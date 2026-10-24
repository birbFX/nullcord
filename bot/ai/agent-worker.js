#!/usr/bin/env node
'use strict';

/*
 * One NullCord AI agent process.
 *
 * The manager starts this file with NULLCORD_AGENT_ID. The worker verifies the
 * configured token is a real bot token before connecting. Regular user
 * credentials are not accepted here.
 */

const path = require('path');
const { Client } = require(path.join(__dirname, '..', '..', 'revite', 'external', 'revolt.js'));
const { createConversationEngine } = require('./engine');
const { createLogger } = require('./logger');
const { loadAgentsConfig, agentConfig, checkBotToken } = require('./agents');

const agentId = process.env.NULLCORD_AGENT_ID;
const API_URL = (process.env.NULLCORD_API || 'http://127.0.0.1:14702').replace(/\/+$/, '');

function fatal(message) {
    console.error(new Date().toISOString(), `[${agentId || 'agent'}] ${message}`);
    process.exitCode = 1;
}

async function main() {
    if (!agentId) {
        fatal('NULLCORD_AGENT_ID is required');
        return;
    }
    const loaded = loadAgentsConfig();
    if (!loaded.ok) {
        fatal(`invalid agents config: ${loaded.errors.join('; ')}`);
        return;
    }
    const agent = loaded.config.agents.find((entry) => entry.id === agentId);
    if (!agent) {
        fatal('agent id is not present in bot/data/agents.json');
        return;
    }
    if (!agent.enabled) {
        fatal('agent is disabled');
        return;
    }
    const verified = await checkBotToken(agent.token);
    if (!verified.ok) {
        fatal(`refusing to start: ${verified.reason}`);
        return;
    }

    const engineConfig = agentConfig(agent, loaded.config);
    if (!engineConfig.validation.ok) {
        fatal(`invalid agent engine config: ${engineConfig.validation.errors.join('; ')}`);
        return;
    }

    const logger = createLogger({
        filePath: engineConfig.logging.path,
        includeContent: Boolean(engineConfig.logging.content),
    });
    const client = new Client({
        apiURL: API_URL,
        autoReconnect: true,
        heartbeat: 20,
    });
    const engine = createConversationEngine({
        client,
        config: engineConfig,
        logger,
    });

    logger.log('agent_process_starting', {
        agentId,
        botUserId: verified.userId,
        username: verified.username,
        channels: engineConfig.channelAllowlist.length,
        model: engineConfig.model,
    });

    client.on('ready', () => {
        logger.log('agent_ready', {
            agentId,
            botUserId: client.user?._id || verified.userId,
            servers: client.servers.size,
        });
        engine.start().catch((error) => {
            logger.error('agent_engine_start_failed', error, {
                agentId,
                errorCategory: 'engine_start_failed',
            });
        });
    });

    client.on('message', async (message) => {
        try {
            await engine.handleMessage(message, { prefix: null });
        } catch (error) {
            logger.error('agent_message_failed', error, {
                agentId,
                errorCategory: 'message_handler_failed',
                channelId: message?.channel?._id,
                messageId: message?._id,
            });
        }
    });

    async function shutdown(signal) {
        logger.log('agent_process_stopping', { agentId, signal });
        try {
            await engine.shutdown();
        } catch (error) {
            logger.error('agent_shutdown_failed', error, {
                agentId,
                errorCategory: 'shutdown_failed',
            });
        }
        try {
            client.websocket?.disconnect();
        } catch {}
        process.exit(0);
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (error) => {
        logger.error('agent_unhandled_rejection', error, {
            agentId,
            errorCategory: 'unhandled_rejection',
        });
    });

    try {
        await client.loginBot(agent.token);
    } catch (error) {
        logger.error('agent_login_failed', error, {
            agentId,
            errorCategory: 'login_failed',
        });
        fatal('bot login failed');
    }
}

main().catch((error) => {
    fatal(error?.message || String(error));
});
