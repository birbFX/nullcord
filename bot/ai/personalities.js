'use strict';

/*
 * Character profiles for the NullCord conversation engine.
 *
 * These are deliberately fictional. A profile can describe a background,
 * interests and a voice, but it must never be used to claim that a real person
 * is speaking or that a fictional event actually happened.
 */

const EXAMPLE_PROFILES = [
    {
        id: 'pixel',
        displayName: 'Pixel',
        description:
            'a laid-back gaming friend who enjoys weird indie games, speedruns and bad patch notes',
        background:
            'Fictional character from a small gaming community. Pixel is a fictional test persona, not a real person and not a record of real events.',
        style: {
            vocabulary: ['run', 'build', 'patch', 'queue', 'clip', 'cooldown'],
            lowercase: true,
            minimalPunctuation: true,
            responseLength: 'short',
            humorLevel: 2,
            casual: true,
        },
        interests: ['indie games', 'speedruns', 'game design', 'patch notes'],
        responseFrequency: 0.35,
        cooldown: { channelMs: 5000, userMs: 30000 },
        memory: { enabled: true, maxEntries: 20, ttlMs: 604800000, persist: false },
        presence: { enabled: true, presence: 'Online', text: 'running the safety test' },
        enabled: true,
        channelIds: [],
    },
    {
        id: 'stack',
        displayName: 'Stack',
        description:
            'a dry, helpful software nerd who likes debugging, small tools and clean logs',
        background:
            'Fictional developer persona used only for this test environment. Stack has no real personal history.',
        style: {
            vocabulary: ['trace', 'repro', 'patch', 'log', 'cache', 'build'],
            lowercase: true,
            minimalPunctuation: true,
            responseLength: 'short',
            humorLevel: 1,
            casual: true,
        },
        interests: ['software', 'debugging', 'self-hosting', 'tooling'],
        responseFrequency: 0.25,
        cooldown: { channelMs: 7000, userMs: 45000 },
        memory: { enabled: true, maxEntries: 20, ttlMs: 604800000, persist: false },
        presence: { enabled: true, presence: 'Focus', text: 'reading logs' },
        enabled: true,
        channelIds: [],
    },
    {
        id: 'juno',
        displayName: 'Juno',
        description:
            'a curious, casual conversation partner who likes music, food and finding good playlists',
        background:
            'Fictional character written for a safety-testing channel. Any preferences or memories are fictional test data.',
        style: {
            vocabulary: ['playlist', 'track', 'recipe', 'vibe', 'weekend'],
            lowercase: true,
            minimalPunctuation: true,
            responseLength: 'short',
            humorLevel: 1,
            casual: true,
        },
        interests: ['music', 'food', 'movies', 'weekend plans'],
        responseFrequency: 0.3,
        cooldown: { channelMs: 6000, userMs: 35000 },
        memory: { enabled: true, maxEntries: 20, ttlMs: 604800000, persist: false },
        presence: { enabled: true, presence: 'Online', text: 'looking for a playlist' },
        enabled: true,
        channelIds: [],
    },
    {
        id: 'glitch',
        displayName: 'Glitch',
        description:
            'a playful chaos goblin who makes short jokes and likes finding the funny side of a bug',
        background:
            'Fictional comedic persona for the test channel. Glitch is not a real user and does not have real-world memories.',
        style: {
            vocabulary: ['chaos', 'bug', 'gremlin', 'oops', 'patch'],
            lowercase: true,
            minimalPunctuation: true,
            responseLength: 'short',
            humorLevel: 3,
            casual: true,
        },
        interests: ['bugs', 'memes', 'weird software', 'bad ideas'],
        responseFrequency: 0.15,
        cooldown: { channelMs: 9000, userMs: 60000 },
        memory: { enabled: true, maxEntries: 12, ttlMs: 604800000, persist: false },
        presence: { enabled: false, presence: 'Busy', text: 'causing problems' },
        enabled: false,
        channelIds: [],
    },
];

const PRESENCE_VALUES = new Set(['Online', 'Idle', 'Focus', 'Busy', 'Invisible']);
const PRESENCE_ALIASES = {
    dnd: 'Busy',
    'do not disturb': 'Busy',
    away: 'Idle',
    afk: 'Idle',
    online: 'Online',
    idle: 'Idle',
    focus: 'Focus',
    busy: 'Busy',
    invisible: 'Invisible',
};

function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function asStringArray(value, fallback = []) {
    if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim());
    }
    if (typeof value === 'string' && value.trim()) {
        return value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
    }
    return fallback;
}

function normalizePresenceValue(value) {
    if (typeof value !== 'string') return null;
    const exact = value.trim();
    if (PRESENCE_VALUES.has(exact)) return exact;
    const lower = exact.toLowerCase();
    if (PRESENCE_ALIASES[lower]) return PRESENCE_ALIASES[lower];
    return [...PRESENCE_VALUES].find((entry) => entry.toLowerCase() === lower) || null;
}

function normalizeStyle(raw = {}, fallback = {}) {
    const style = raw && typeof raw === 'object' ? raw : {};
    return {
        vocabulary: asStringArray(style.vocabulary, fallback.vocabulary || []),
        lowercase: style.lowercase === undefined ? fallback.lowercase ?? true : Boolean(style.lowercase),
        minimalPunctuation:
            style.minimalPunctuation === undefined
                ? fallback.minimalPunctuation ?? true
                : Boolean(style.minimalPunctuation),
        responseLength: ['short', 'medium'].includes(style.responseLength)
            ? style.responseLength
            : fallback.responseLength || 'short',
        humorLevel: clamp(style.humorLevel, 0, 3, fallback.humorLevel ?? 1),
        casual: style.casual === undefined ? fallback.casual ?? true : Boolean(style.casual),
    };
}

function normalizeCharacter(raw, index = 0) {
    if (!raw || typeof raw !== 'object') return null;
    const idSource = raw.id ?? raw.characterId ?? `character-${index + 1}`;
    const id = String(idSource).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id)) return null;

    const style = normalizeStyle(raw.style, raw);
    const memoryRaw = raw.memory && typeof raw.memory === 'object' ? raw.memory : {};
    const presenceRaw = raw.presence && typeof raw.presence === 'object' ? raw.presence : {};
    const cooldownRaw = raw.cooldown && typeof raw.cooldown === 'object' ? raw.cooldown : {};

    return {
        id,
        displayName: String(raw.displayName ?? raw.name ?? id).trim().slice(0, 40) || id,
        description: String(raw.description ?? raw.personality ?? 'a fictional chat participant').trim().slice(0, 500),
        background: String(raw.background ?? 'Fictional test persona.').trim().slice(0, 1200),
        style,
        interests: asStringArray(raw.interests),
        responseFrequency: clamp(raw.responseFrequency, 0, 1, 0.2),
        cooldown: {
            channelMs: clamp(cooldownRaw.channelMs ?? raw.cooldownMs, 1000, 600000, 6000),
            userMs: clamp(cooldownRaw.userMs, 5000, 3600000, 30000),
        },
        memory: {
            enabled: memoryRaw.enabled === undefined ? true : Boolean(memoryRaw.enabled),
            maxEntries: clamp(memoryRaw.maxEntries, 2, 200, 20),
            ttlMs: clamp(memoryRaw.ttlMs, 60000, 30 * 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000),
            persist: Boolean(memoryRaw.persist),
        },
        presence: {
            enabled: Boolean(presenceRaw.enabled),
            presence: normalizePresenceValue(presenceRaw.presence) || 'Online',
            text: String(presenceRaw.text ?? '').trim().slice(0, 128),
            // Kept for config compatibility and explicitly reported as
            // unsupported by the Stoat client rather than silently ignored.
            activity: presenceRaw.activity ?? null,
        },
        enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
        channelIds: asStringArray(raw.channelIds),
    };
}

function normalizeCharacters(value) {
    const source = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
          ? Object.values(value)
          : [];
    const characters = [];
    const seen = new Set();
    for (let index = 0; index < source.length; index += 1) {
        const character = normalizeCharacter(source[index], index);
        if (!character || seen.has(character.id)) continue;
        seen.add(character.id);
        characters.push(character);
    }
    return characters;
}

function resolveCharacter(characters, config, channelId) {
    const list = characters instanceof Map ? [...characters.values()] : characters || [];
    const routing = config?.characterRouting || {};
    const routedId = routing[channelId];
    if (routedId) {
        return list.find((character) => character.id === routedId && character.enabled) || null;
    }

    const channelMatched = list.find(
        (character) =>
            character.enabled &&
            Array.isArray(character.channelIds) &&
            character.channelIds.includes(channelId),
    );
    if (channelMatched) return channelMatched;

    const defaultId = config?.defaultCharacterId;
    if (defaultId) {
        const selected = list.find((character) => character.id === defaultId && character.enabled);
        if (selected) return selected;
    }

    return list.find((character) => character.enabled) || null;
}

module.exports = {
    EXAMPLE_PROFILES,
    PRESENCE_VALUES,
    PRESENCE_ALIASES,
    normalizeCharacter,
    normalizeCharacters,
    normalizeStyle,
    resolveCharacter,
    normalizePresenceValue,
    asStringArray,
    clamp,
};
