#!/usr/bin/env node
'use strict';

/*
 * NullCord multi-agent manager.
 *
 * The manager runs one child process per configured bot account. Each child has
 * its own Stoat client/session, conversation character, presence, memory and
 * rate limits. It deliberately does not accept regular user credentials; a
 * token is verified through GET /users/@me with the bot-token header and must
 * resolve to an account with a `bot` object.
 *
 * Runtime config: bot/data/agents.json (ignored by publishing)
 * Example config: bot/ai/agents.example.json
 *
 * Usage:
 *   node bot/ai/agents.js status
 *   node bot/ai/agents.js check
 *   node bot/ai/agents.js start [agent-id ...]
 *   node bot/ai/agents.js stop [agent-id ...]
 *   node bot/ai/agents.js restart [agent-id ...]
 *   node bot/ai/agents.js logs <agent-id> [lines]
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadConfig, validateConfig, mergeConfig, DEFAULT_CONFIG } = require('./config');
const { normalizeCharacter } = require('./personalities');

const BOT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(BOT_ROOT, 'data');
const AGENTS_CONFIG = path.join(DATA_DIR, 'agents.json');
const RUNTIME_DIR = path.join(DATA_DIR, 'agents');
const API_URL = (process.env.NULLCORD_API || 'http://127.0.0.1:14702').replace(/\/+$/, '');
const WORKER = path.join(__dirname, 'agent-worker.js');
const DEFAULT_AGENTS_CONFIG = {
    enabled: false,
    model: 'qwen2.5:3b',
    ollamaUrl: 'http://127.0.0.1:11434',
    agents: [],
};

function asArray(value) {
    if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim());
    if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    return [];
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeAgent(raw, index = 0) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id ?? `agent-${index + 1}`).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id)) return null;
    const character = normalizeCharacter(raw.character, index);
    if (!character) return null;
    const token = typeof raw.token === 'string' && raw.token.trim() ? raw.token.trim() : null;
    const serverAllowlist = asArray(raw.serverAllowlist);
    const channelAllowlist = asArray(raw.channelAllowlist);
    return {
        id,
        enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
        token,
        character,
        serverAllowlist,
        channelAllowlist,
        allowedBotIds: asArray(raw.allowedBotIds),
        mode: ['mention', 'ambient'].includes(raw.mode) ? raw.mode : 'mention',
        rateLimits: asObject(raw.rateLimits),
        chain: asObject(raw.chain),
        memory: asObject(raw.memory),
        logging: asObject(raw.logging),
        presenceThrottle: asObject(raw.presenceThrottle),
        maxReplyChars: raw.maxReplyChars,
        commandPrefixes: asArray(raw.commandPrefixes),
    };
}

function loadAgentsConfig({ file = AGENTS_CONFIG, env = process.env } = {}) {
    let fileConfig = DEFAULT_AGENTS_CONFIG;
    try {
        if (fs.existsSync(file)) {
            const raw = fs.readFileSync(file, 'utf8');
            fileConfig = raw.trim() ? JSON.parse(raw) : DEFAULT_AGENTS_CONFIG;
        }
    } catch (error) {
        return { ok: false, errors: [`could not read agents config: ${error.message}`], agents: [] };
    }
    if (!fileConfig || typeof fileConfig !== 'object') {
        return { ok: false, errors: ['agents config must be a JSON object'], agents: [] };
    }
    const config = mergeConfig(DEFAULT_AGENTS_CONFIG, fileConfig);
    config.enabled = env.NULLCORD_AGENTS_ENABLED !== undefined
        ? ['1', 'true', 'yes', 'on'].includes(String(env.NULLCORD_AGENTS_ENABLED).toLowerCase())
        : Boolean(config.enabled);
    config.model = String(env.NULLCORD_AGENT_MODEL || config.model || DEFAULT_AGENTS_CONFIG.model);
    config.ollamaUrl = String(env.NULLCORD_OLLAMA_URL || env.OLLAMA_HOST || config.ollamaUrl || DEFAULT_AGENTS_CONFIG.ollamaUrl).replace(/\/+$/, '');
    const source = Array.isArray(config.agents) ? config.agents : [];
    const agents = [];
    const errors = [];
    const ids = new Set();
    for (let index = 0; index < source.length; index += 1) {
        const agent = normalizeAgent(source[index], index);
        if (!agent) {
            errors.push(`agent at index ${index} is invalid`);
            continue;
        }
        if (ids.has(agent.id)) {
            errors.push(`duplicate agent id: ${agent.id}`);
            continue;
        }
        ids.add(agent.id);
        if (agent.enabled && !agent.token) {
            errors.push(`agent ${agent.id} is enabled but has no bot token`);
        }
        if (agent.enabled && !agent.serverAllowlist.length) {
            errors.push(`agent ${agent.id} is enabled but has no serverAllowlist`);
        }
        if (agent.enabled && !agent.channelAllowlist.length) {
            errors.push(`agent ${agent.id} is enabled but has no channelAllowlist`);
        }
        agents.push(agent);
    }
    return { ok: errors.length === 0, errors, config: { ...config, agents } };
}

function agentConfig(agent, global) {
    const character = agent.character;
    const config = {
        ...DEFAULT_CONFIG,
        enabled: true,
        model: global.model,
        ollamaUrl: global.ollamaUrl,
        serverAllowlist: agent.serverAllowlist,
        channelAllowlist: agent.channelAllowlist,
        allowedBotIds: agent.allowedBotIds,
        characters: [character],
        defaultCharacterId: character.id,
        characterRouting: {},
        mode: agent.mode,
        commandPrefixes: agent.commandPrefixes.length ? agent.commandPrefixes : ['!', '?'],
        maxReplyChars: agent.maxReplyChars ?? DEFAULT_CONFIG.maxReplyChars,
        rateLimits: { ...DEFAULT_CONFIG.rateLimits, ...agent.rateLimits },
        chain: { ...DEFAULT_CONFIG.chain, ...agent.chain },
        memory: {
            ...DEFAULT_CONFIG.memory,
            ...agent.memory,
            path: agent.memory.path || path.join(RUNTIME_DIR, `${agent.id}-memory.json`),
        },
        logging: {
            ...DEFAULT_CONFIG.logging,
            ...agent.logging,
            path: agent.logging.path || path.join(RUNTIME_DIR, `${agent.id}.log`),
        },
        presence: { ...DEFAULT_CONFIG.presence, ...agent.presenceThrottle },
    };
    const validation = validateConfig(config);
    return { ...config, validation };
}

function pidFile(id) {
    return path.join(RUNTIME_DIR, `${id}.pid`);
}

function logFile(id) {
    return path.join(RUNTIME_DIR, `${id}.log`);
}

function isRunning(id) {
    const file = pidFile(id);
    try {
        const pid = Number(fs.readFileSync(file, 'utf8').trim());
        if (!Number.isInteger(pid) || pid <= 0) return null;
        process.kill(pid, 0);
        return pid;
    } catch {
        return null;
    }
}

async function checkBotToken(token, { apiUrl = API_URL, fetchImpl = globalThis.fetch } = {}) {
    if (!token) return { ok: false, reason: 'missing_token' };
    if (typeof fetchImpl !== 'function') return { ok: false, reason: 'fetch_unavailable' };
    try {
        const response = await fetchImpl(`${apiUrl}/users/@me`, {
            headers: { 'x-bot-token': token },
            signal: AbortSignal.timeout(10000),
        });
        const text = await response.text();
        if (!response.ok) return { ok: false, reason: `http_${response.status}` };
        const user = text ? JSON.parse(text) : null;
        if (!user?.bot) return { ok: false, reason: 'regular_user_account_not_supported' };
        return { ok: true, userId: user._id, username: user.username };
    } catch (error) {
        return { ok: false, reason: `auth_error:${error.message}` };
    }
}

function ensureRuntimeDir() {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true, mode: 0o700 });
}

function spawnAgent(id, config) {
    ensureRuntimeDir();
    const agent = config.agents.find((entry) => entry.id === id);
    if (!agent) throw new Error(`unknown agent: ${id}`);
    if (!agent.enabled) throw new Error(`agent ${id} is disabled in config`);
    const running = isRunning(id);
    if (running) return { id, pid: running, status: 'already_running' };
    const output = fs.openSync(logFile(id), 'a', 0o600);
    const child = spawn(process.execPath, [WORKER, id], {
        cwd: BOT_ROOT,
        detached: true,
        stdio: ['ignore', output, output],
        env: {
            ...process.env,
            NULLCORD_API: API_URL,
            NULLCORD_AGENT_ID: id,
        },
    });
    child.unref();
    fs.writeFileSync(pidFile(id), `${child.pid}\n`, { mode: 0o600 });
    return { id, pid: child.pid, status: 'started' };
}

async function stopAgent(id) {
    const pid = isRunning(id);
    if (!pid) {
        try { fs.rmSync(pidFile(id), { force: true }); } catch {}
        return { id, status: 'not_running' };
    }
    try { process.kill(pid, 'SIGTERM'); } catch {}
    for (let i = 0; i < 25; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (!isRunning(id)) break;
    }
    if (isRunning(id)) {
        try { process.kill(pid, 'SIGKILL'); } catch {}
    }
    try { fs.rmSync(pidFile(id), { force: true }); } catch {}
    return { id, pid, status: 'stopped' };
}

function selectedAgents(config, ids) {
    const requested = ids.length ? new Set(ids) : null;
    return config.agents.filter((agent) => (requested ? requested.has(agent.id) : agent.enabled));
}

async function main() {
    const [command = 'status', ...args] = process.argv.slice(2);
    const loaded = loadAgentsConfig();
    if (!loaded.ok) {
        console.error(loaded.errors.join('\n'));
        process.exitCode = 1;
        return;
    }
    const config = loaded.config;

    if (command === 'status') {
        console.log(`agents enabled: ${config.enabled}`);
        for (const agent of config.agents) {
            const pid = isRunning(agent.id);
            console.log(`${agent.id.padEnd(20)} ${agent.enabled ? 'enabled ' : 'disabled'} ${pid ? `running pid ${pid}` : 'stopped'} channels=${agent.channelAllowlist.length}`);
        }
        return;
    }

    if (command === 'check') {
        let failed = false;
        for (const agent of config.agents) {
            const result = await checkBotToken(agent.token);
            if (!result.ok) failed = true;
            console.log(`${agent.id.padEnd(20)} ${result.ok ? `bot ${result.username} (${result.userId})` : `NOT STARTABLE: ${result.reason}`}`);
        }
        if (failed) process.exitCode = 1;
        return;
    }

    if (command === 'logs') {
        const id = args[0];
        if (!id) throw new Error('logs requires an agent id');
        const file = logFile(id);
        if (!fs.existsSync(file)) throw new Error(`no log for ${id}`);
        const lines = Math.max(1, Number(args[1]) || 80);
        const content = fs.readFileSync(file, 'utf8').split('\n');
        console.log(content.slice(-lines).join('\n'));
        return;
    }

    if (command === 'start' || command === 'restart') {
        const agents = selectedAgents(config, args);
        if (!agents.length) {
            console.log('no enabled agents selected');
            return;
        }
        if (!config.enabled) throw new Error('agents are globally disabled in bot/data/agents.json');
        for (const agent of agents) {
            const checked = await checkBotToken(agent.token);
            if (!checked.ok) {
                console.error(`${agent.id}: refused (${checked.reason})`);
                process.exitCode = 1;
                continue;
            }
            if (command === 'restart') await stopAgent(agent.id);
            const result = spawnAgent(agent.id, config);
            console.log(`${agent.id}: ${result.status}${result.pid ? ` pid ${result.pid}` : ''}`);
        }
        return;
    }

    if (command === 'stop') {
        const agents = selectedAgents(config, args);
        for (const agent of agents) {
            const result = await stopAgent(agent.id);
            console.log(`${agent.id}: ${result.status}`);
        }
        return;
    }

    console.error(`unknown command: ${command}`);
    process.exitCode = 1;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    AGENTS_CONFIG,
    RUNTIME_DIR,
    loadAgentsConfig,
    normalizeAgent,
    agentConfig,
    checkBotToken,
    isRunning,
    spawnAgent,
    stopAgent,
};
