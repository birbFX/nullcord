'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeCharacters } = require('./personalities');

const BOT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG_PATH = path.join(BOT_ROOT, 'data', 'ai.json');
const DEFAULT_KILL_SWITCH_PATH = path.join(BOT_ROOT, 'data', 'ai.disabled');

const DEFAULT_CONFIG = Object.freeze({
    enabled: false,
    model: 'qwen2.5:3b',
    ollamaUrl: 'http://127.0.0.1:11434',
    serverAllowlist: [],
    channelAllowlist: [],
    allowedBotIds: [],
    characters: [],
    defaultCharacterId: null,
    characterRouting: {},
    mode: 'mention',
    rateLimits: {
        perChannelMs: 5000,
        perUserMs: 30000,
        globalPerMinute: 6,
        maxConsecutive: 2,
        maxQueue: 8,
        aiTimeoutMs: 20000,
        maxContextMessages: 12,
    },
    memory: {
        enabled: true,
        persist: false,
        path: 'data/ai-memory.json',
        maxEntries: 40,
        ttlMs: 7 * 24 * 60 * 60 * 1000,
    },
    logging: {
        path: 'data/ai.log',
        content: false,
        level: 'info',
    },
    maxReplyChars: 240,
    commandPrefixes: ['!', '?'],
    presence: {
        applyOnStart: false,
        minIntervalMs: 2500,
        windowMs: 10000,
        maxUpdatesPerWindow: 2,
    },
    chain: {
        enabled: false,
        maxFollowUps: 2,
        followUpChance: 0.65,
        delayMs: 2500,
        characterIds: [],
    },
});

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeConfig(base, override) {
    const result = Array.isArray(base) ? [...base] : { ...base };
    if (!isPlainObject(override)) return result;
    for (const [key, value] of Object.entries(override)) {
        if (isPlainObject(value) && isPlainObject(result[key])) {
            result[key] = mergeConfig(result[key], value);
        } else if (Array.isArray(value)) {
            result[key] = [...value];
        } else {
            result[key] = value;
        }
    }
    return result;
}

function asBool(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    }
    return fallback;
}

function asNumber(value, fallback, min = -Infinity, max = Infinity) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function asList(value, fallback = []) {
    if (Array.isArray(value)) {
        return [...new Set(value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()))];
    }
    if (typeof value === 'string') {
        return [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
    }
    return fallback;
}

function asObject(value) {
    return isPlainObject(value) ? value : {};
}

function resolvePath(value) {
    if (!value) return value;
    return path.isAbsolute(value) ? value : path.resolve(BOT_ROOT, value);
}

function getKillSwitchState({ env = process.env, file = null } = {}) {
    const envValue = env.NULLCORD_AI_DISABLED;
    if (asBool(envValue, false)) {
        return { disabled: true, reason: 'env:NULLCORD_AI_DISABLED' };
    }
    const killFile = file || env.NULLCORD_AI_DISABLED_FILE || DEFAULT_KILL_SWITCH_PATH;
    try {
        if (fs.existsSync(killFile)) {
            return { disabled: true, reason: `file:${killFile}` };
        }
    } catch {
        // If the file cannot be checked, do not disable the whole bot. The
        // caller will still fail closed when the engine is explicitly off.
    }
    return { disabled: false, reason: null };
}

function validateConfig(config) {
    if (!config.enabled) return { ok: true, errors: [] };
    const errors = [];
    if (!['mention', 'ambient'].includes(config.mode)) {
        errors.push(`mode must be "mention" or "ambient", got ${JSON.stringify(config.mode)}`);
    }
    if (!Array.isArray(config.serverAllowlist) || config.serverAllowlist.length === 0) {
        errors.push('serverAllowlist must contain at least one server id when enabled');
    }
    if (!Array.isArray(config.channelAllowlist) || config.channelAllowlist.length === 0) {
        errors.push('channelAllowlist must contain at least one channel id when enabled');
    }
    if (!Array.isArray(config.characters) || config.characters.length === 0) {
        errors.push('characters must contain at least one profile when enabled');
    }
    const selected = config.defaultCharacterId
        ? config.characters.find((character) => character.id === config.defaultCharacterId)
        : null;
    if (config.defaultCharacterId && !selected) {
        errors.push(`defaultCharacterId ${JSON.stringify(config.defaultCharacterId)} is not a configured character`);
    }
    if (!config.characters.some((character) => character.enabled)) {
        errors.push('at least one character must be enabled when enabled=true');
    }
    if (config.chain?.enabled) {
        const chainCharacters = Array.isArray(config.chain.characterIds) ? config.chain.characterIds : [];
        if (chainCharacters.some((id) => !config.characters.some((character) => character.id === id && character.enabled))) {
            errors.push('chain.characterIds must only name enabled characters');
        }
        if (config.rateLimits.maxConsecutive < Number(config.chain.maxFollowUps) + 1) {
            errors.push('rateLimits.maxConsecutive must be at least chain.maxFollowUps + 1');
        }
    }
    if (!Number.isFinite(config.rateLimits.globalPerMinute) || config.rateLimits.globalPerMinute < 1) {
        errors.push('rateLimits.globalPerMinute must be at least 1');
    }
    if (!Number.isFinite(config.rateLimits.maxConsecutive) || config.rateLimits.maxConsecutive < 0) {
        errors.push('rateLimits.maxConsecutive must be zero or greater');
    }
    return { ok: errors.length === 0, errors };
}

function applyEnvironment(config, env) {
    const result = { ...config };
    if (env.NULLCORD_AI_ENABLED !== undefined) {
        result.enabled = asBool(env.NULLCORD_AI_ENABLED, result.enabled);
    }
    if (env.NULLCORD_AI_MODE !== undefined) {
        result.mode = String(env.NULLCORD_AI_MODE).toLowerCase();
    }
    if (env.NULLCORD_AI_MODEL !== undefined) {
        result.model = String(env.NULLCORD_AI_MODEL);
    }
    if (env.NULLCORD_OLLAMA_URL !== undefined) {
        result.ollamaUrl = String(env.NULLCORD_OLLAMA_URL);
    } else if (env.OLLAMA_HOST !== undefined) {
        result.ollamaUrl = String(env.OLLAMA_HOST);
    }
    if (env.NULLCORD_AI_SERVERS !== undefined || env.NULLCORD_AI_SERVER_ALLOWLIST !== undefined) {
        result.serverAllowlist = asList(
            env.NULLCORD_AI_SERVERS ?? env.NULLCORD_AI_SERVER_ALLOWLIST,
            result.serverAllowlist,
        );
    }
    if (env.NULLCORD_AI_CHANNELS !== undefined || env.NULLCORD_AI_CHANNEL_ALLOWLIST !== undefined) {
        result.channelAllowlist = asList(
            env.NULLCORD_AI_CHANNELS ?? env.NULLCORD_AI_CHANNEL_ALLOWLIST,
            result.channelAllowlist,
        );
    }
    if (env.NULLCORD_AI_ALLOWED_BOTS !== undefined) {
        result.allowedBotIds = asList(env.NULLCORD_AI_ALLOWED_BOTS, result.allowedBotIds);
    }
    if (env.NULLCORD_AI_DEFAULT_CHARACTER !== undefined) {
        result.defaultCharacterId = String(env.NULLCORD_AI_DEFAULT_CHARACTER);
    }
    return result;
}

function loadConfig({ configPath = DEFAULT_CONFIG_PATH, env = process.env } = {}) {
    let fileConfig = {};
    try {
        if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf8');
            fileConfig = raw.trim() ? JSON.parse(raw) : {};
        }
    } catch (error) {
        throw new Error(`could not read AI config at ${configPath}: ${error.message}`);
    }
    if (!isPlainObject(fileConfig)) {
        throw new Error(`AI config at ${configPath} must contain a JSON object`);
    }

    const merged = mergeConfig(DEFAULT_CONFIG, fileConfig);
    merged.ollamaUrl = String(merged.ollamaUrl || DEFAULT_CONFIG.ollamaUrl).replace(/\/+$/, '');
    merged.maxReplyChars = asNumber(merged.maxReplyChars, DEFAULT_CONFIG.maxReplyChars, 40, 1000);
    merged.allowedBotIds = asList(merged.allowedBotIds);
    merged.serverAllowlist = asList(merged.serverAllowlist);
    merged.channelAllowlist = asList(merged.channelAllowlist);
    merged.commandPrefixes = asList(merged.commandPrefixes, DEFAULT_CONFIG.commandPrefixes);
    merged.characterRouting = asObject(merged.characterRouting);
    merged.characters = normalizeCharacters(merged.characters);
    merged.rateLimits = {
        ...DEFAULT_CONFIG.rateLimits,
        ...asObject(merged.rateLimits),
    };
    merged.rateLimits.perChannelMs = asNumber(merged.rateLimits.perChannelMs, DEFAULT_CONFIG.rateLimits.perChannelMs, 1000, 600000);
    merged.rateLimits.perUserMs = asNumber(merged.rateLimits.perUserMs, DEFAULT_CONFIG.rateLimits.perUserMs, 5000, 3600000);
    merged.rateLimits.globalPerMinute = asNumber(merged.rateLimits.globalPerMinute, DEFAULT_CONFIG.rateLimits.globalPerMinute, 1, 120);
    merged.rateLimits.maxConsecutive = asNumber(merged.rateLimits.maxConsecutive, DEFAULT_CONFIG.rateLimits.maxConsecutive, 0, 20);
    merged.rateLimits.maxQueue = asNumber(merged.rateLimits.maxQueue, DEFAULT_CONFIG.rateLimits.maxQueue, 1, 100);
    merged.rateLimits.aiTimeoutMs = asNumber(merged.rateLimits.aiTimeoutMs, DEFAULT_CONFIG.rateLimits.aiTimeoutMs, 1000, 120000);
    merged.rateLimits.maxContextMessages = asNumber(merged.rateLimits.maxContextMessages, DEFAULT_CONFIG.rateLimits.maxContextMessages, 1, 50);
    merged.memory = {
        ...DEFAULT_CONFIG.memory,
        ...asObject(merged.memory),
    };
    merged.memory.enabled = asBool(merged.memory.enabled, DEFAULT_CONFIG.memory.enabled);
    merged.memory.persist = asBool(merged.memory.persist, DEFAULT_CONFIG.memory.persist);
    merged.memory.path = resolvePath(merged.memory.path || DEFAULT_CONFIG.memory.path);
    merged.memory.maxEntries = asNumber(merged.memory.maxEntries, DEFAULT_CONFIG.memory.maxEntries, 2, 500);
    merged.memory.ttlMs = asNumber(merged.memory.ttlMs, DEFAULT_CONFIG.memory.ttlMs, 60000, 30 * 24 * 60 * 60 * 1000);
    merged.logging = {
        ...DEFAULT_CONFIG.logging,
        ...asObject(merged.logging),
    };
    merged.logging.path = resolvePath(merged.logging.path || DEFAULT_CONFIG.logging.path);
    merged.logging.content = asBool(merged.logging.content, false);
    merged.presence = {
        ...DEFAULT_CONFIG.presence,
        ...asObject(merged.presence),
    };
    merged.presence.applyOnStart = asBool(merged.presence.applyOnStart, false);
    merged.presence.minIntervalMs = asNumber(merged.presence.minIntervalMs, DEFAULT_CONFIG.presence.minIntervalMs, 0, 60000);
    merged.presence.windowMs = asNumber(merged.presence.windowMs, DEFAULT_CONFIG.presence.windowMs, 1000, 120000);
    merged.presence.maxUpdatesPerWindow = asNumber(merged.presence.maxUpdatesPerWindow, DEFAULT_CONFIG.presence.maxUpdatesPerWindow, 1, 20);
    merged.chain = {
        ...DEFAULT_CONFIG.chain,
        ...asObject(merged.chain),
    };
    merged.chain.enabled = asBool(merged.chain.enabled, false);
    merged.chain.maxFollowUps = asNumber(merged.chain.maxFollowUps, DEFAULT_CONFIG.chain.maxFollowUps, 0, 5);
    merged.chain.followUpChance = asNumber(merged.chain.followUpChance, DEFAULT_CONFIG.chain.followUpChance, 0, 1);
    merged.chain.delayMs = asNumber(merged.chain.delayMs, DEFAULT_CONFIG.chain.delayMs, 0, 60000);
    merged.chain.characterIds = asList(merged.chain.characterIds);
    merged.enabled = asBool(merged.enabled, false);
    merged.mode = String(merged.mode || 'mention').toLowerCase();

    const applied = applyEnvironment(merged, env);
    applied.characters = normalizeCharacters(applied.characters);
    if (!applied.defaultCharacterId) {
        applied.defaultCharacterId = applied.characters.find((character) => character.enabled)?.id || null;
    }

    const validation = validateConfig(applied);
    applied.validation = validation;
    return applied;
}

module.exports = {
    BOT_ROOT,
    DEFAULT_CONFIG,
    DEFAULT_CONFIG_PATH,
    DEFAULT_KILL_SWITCH_PATH,
    loadConfig,
    validateConfig,
    getKillSwitchState,
    resolvePath,
    mergeConfig,
    asBool,
    asList,
    asNumber,
};
