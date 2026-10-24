'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadAgentsConfig, normalizeAgent, agentConfig, checkBotToken } = require('./agents');

function character(id = 'pixel') {
    return {
        id,
        displayName: 'Pixel',
        description: 'a fictional gaming friend',
        background: 'fictional test persona',
        style: { lowercase: true, minimalPunctuation: true, responseLength: 'short' },
        interests: ['games'],
        presence: { enabled: true, presence: 'Online', text: 'testing' },
        memory: { enabled: true, persist: false },
        enabled: true,
    };
}

function writeTempConfig(value) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nullcord-agents-'));
    const file = path.join(directory, 'agents.json');
    fs.writeFileSync(file, JSON.stringify(value));
    return file;
}

test('loads a config containing multiple independent bot agents', () => {
    const file = writeTempConfig({
        enabled: true,
        agents: [
            {
                id: 'pixel-agent',
                enabled: true,
                token: 'bot-token-1',
                serverAllowlist: ['server1'],
                channelAllowlist: ['channel1'],
                character: character('pixel'),
            },
            {
                id: 'stack-agent',
                enabled: true,
                token: 'bot-token-2',
                serverAllowlist: ['server1'],
                channelAllowlist: ['channel2'],
                character: character('stack'),
            },
        ],
    });
    const loaded = loadAgentsConfig({ file, env: {} });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.config.agents.length, 2);
    assert.deepEqual(loaded.config.agents.map((agent) => agent.id), ['pixel-agent', 'stack-agent']);
});

test('rejects enabled agents without bot tokens and channel allowlists', () => {
    const file = writeTempConfig({
        enabled: true,
        agents: [
            {
                id: 'bad-agent',
                enabled: true,
                serverAllowlist: ['server1'],
                character: character(),
            },
        ],
    });
    const loaded = loadAgentsConfig({ file, env: {} });
    assert.equal(loaded.ok, false);
    assert.ok(loaded.errors.some((error) => error.includes('no bot token')));
    assert.ok(loaded.errors.some((error) => error.includes('no channelAllowlist')));
});

test('builds a valid per-agent engine config with isolated paths', () => {
    const loaded = loadAgentsConfig({
        file: writeTempConfig({
            enabled: true,
            agents: [
                {
                    id: 'pixel-agent',
                    enabled: true,
                    token: 'token',
                    serverAllowlist: ['server1'],
                    channelAllowlist: ['channel1'],
                    character: character(),
                },
            ],
        }),
        env: {},
    });
    assert.equal(loaded.ok, true);
    const config = agentConfig(loaded.config.agents[0], loaded.config);
    assert.equal(config.enabled, true);
    assert.equal(config.serverAllowlist[0], 'server1');
    assert.equal(config.characters[0].id, 'pixel');
    assert.match(config.memory.path, /pixel-agent-memory\.json$/);
    assert.match(config.logging.path, /pixel-agent\.log$/);
    assert.equal(config.validation.ok, true);
});

test('bot-token verification accepts only accounts with a bot marker', async () => {
    const botResponse = {
        ok: true,
        status: 200,
        async text() {
            return JSON.stringify({ _id: 'bot1', username: 'PixelBot', bot: { owner: 'owner' } });
        },
    };
    const bot = await checkBotToken('token', {
        apiUrl: 'http://test',
        fetchImpl: async () => botResponse,
    });
    assert.equal(bot.ok, true);
    assert.equal(bot.userId, 'bot1');

    const regularResponse = {
        ok: true,
        status: 200,
        async text() {
            return JSON.stringify({ _id: 'user1', username: 'RegularUser' });
        },
    };
    const regular = await checkBotToken('token', {
        apiUrl: 'http://test',
        fetchImpl: async () => regularResponse,
    });
    assert.equal(regular.ok, false);
    assert.equal(regular.reason, 'regular_user_account_not_supported');
});

test('normalizes DND aliases for agent presence', () => {
    const agent = normalizeAgent({
        id: 'agent-x',
        token: 'token',
        serverAllowlist: ['server1'],
        channelAllowlist: ['channel1'],
        character: { ...character(), presence: { enabled: true, presence: 'DND' } },
    });
    assert.equal(agent.character.presence.presence, 'Busy');
});
