'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createConversationEngine, parseDecision, sanitizeReply, validateReply } = require('./engine');
const { normalizeCharacter } = require('./personalities');
const { createMemoryStore } = require('./memory');
const { createPresenceController } = require('./presence');
const { getKillSwitchState } = require('./config');

let nextId = 1;

function makeCharacter(overrides = {}) {
    return normalizeCharacter({
        id: 'pixel',
        displayName: 'Pixel',
        description: 'a fictional gaming friend',
        background: 'fictional test persona',
        style: {
            lowercase: true,
            minimalPunctuation: true,
            responseLength: 'short',
            humorLevel: 1,
        },
        interests: ['games'],
        responseFrequency: 1,
        cooldown: { channelMs: 1000, userMs: 5000 },
        memory: { enabled: false, persist: false },
        presence: { enabled: false },
        ...overrides,
    });
}

function makeConfig(overrides = {}) {
    const base = {
        enabled: true,
        model: 'qwen2.5:3b',
        mode: 'mention',
        serverAllowlist: ['server1'],
        channelAllowlist: ['channel1'],
        allowedBotIds: [],
        characters: [makeCharacter()],
        defaultCharacterId: 'pixel',
        characterRouting: {},
        rateLimits: {
            perChannelMs: 1000,
            perUserMs: 5000,
            globalPerMinute: 10,
            maxConsecutive: 2,
            maxQueue: 8,
            aiTimeoutMs: 1000,
            maxContextMessages: 5,
        },
        memory: { enabled: false, persist: false, maxEntries: 10, ttlMs: 60000 },
        logging: { path: null, content: false },
        maxReplyChars: 120,
        commandPrefixes: ['!'],
    };
    return {
        ...base,
        ...overrides,
        rateLimits: { ...base.rateLimits, ...(overrides.rateLimits || {}) },
        memory: { ...base.memory, ...(overrides.memory || {}) },
        logging: { ...base.logging, ...(overrides.logging || {}) },
        characters: overrides.characters || base.characters,
    };
}

function makeLogger() {
    const entries = [];
    return {
        entries,
        log(event, fields = {}) {
            entries.push({ event, ...fields });
        },
        error(event, error, fields = {}) {
            entries.push({ event, error: error?.message || String(error), ...fields });
        },
    };
}

function makePresence() {
    return {
        calls: 0,
        async apply() {
            this.calls += 1;
            return { ok: true };
        },
        capabilities: { activity: false },
    };
}

function makeClient() {
    const users = new Map();
    return {
        user: { _id: 'bot1', username: 'Axiom' },
        users: {
            get(id) {
                return users.get(id) || null;
            },
            set(id, value) {
                users.set(id, value);
            },
            edit: async () => undefined,
        },
    };
}

function makeMessage(overrides = {}) {
    const sent = [];
    const channel = {
        _id: 'channel1',
        channel_type: 'TextChannel',
        server_id: 'server1',
        fetchMessagesWithUsers: async () => ({ messages: [], users: [] }),
        fetchMessage: async (id) => ({ _id: id, author_id: 'bot1' }),
        sendMessage: async (data, key) => {
            sent.push({ data, key });
            return { _id: `bot-message-${nextId++}` };
        },
        ...(overrides.channel || {}),
    };
    const message = {
        _id: `message-${nextId++}`,
        content: 'hey <@bot1>',
        author_id: 'user1',
        author: { _id: 'user1', username: 'alex', display_name: 'Alex', bot: null },
        mention_ids: ['bot1'],
        reply_ids: [],
        channel,
        ...overrides,
        channel,
    };
    return { message, sent };
}

function makeOllama(reply = '{"should_reply":true,"reply":"yeah that makes sense"}', overrides = {}) {
    return {
        calls: 0,
        async chat() {
            this.calls += 1;
            if (overrides.throwError) throw overrides.throwError;
            return typeof reply === 'function' ? reply() : reply;
        },
    };
}

function makeEngine({ config = makeConfig(), ollama = makeOllama(), presence = makePresence(), logger = makeLogger(), client = makeClient(), now = () => Date.now(), random = () => 0, killSwitch = () => ({ disabled: false }) } = {}) {
    const engine = createConversationEngine({
        client,
        config,
        logger,
        ollama,
        presence,
        now,
        random,
        killSwitch,
    });
    return { engine, logger, client, ollama, presence };
}

test('rejects messages from unauthorized servers', async () => {
    const { engine, logger } = makeEngine();
    const { message, sent } = makeMessage({ channel: { server_id: 'other-server' } });
    const result = await engine.handleMessage(message);
    assert.equal(result.reason, 'unauthorized');
    assert.equal(sent.length, 0);
    assert.ok(logger.entries.some((entry) => entry.event === 'engine_started'));
});

test('rejects messages from unauthorized channels', async () => {
    const { engine } = makeEngine();
    const { message, sent } = makeMessage({ channel: { _id: 'general' } });
    const result = await engine.handleMessage(message);
    assert.equal(result.reason, 'unauthorized');
    assert.equal(sent.length, 0);
});

test('rejects direct messages by default', async () => {
    const { engine } = makeEngine();
    const { message, sent } = makeMessage({ channel: { channel_type: 'DirectMessage', server_id: undefined } });
    const result = await engine.handleMessage(message);
    assert.equal(result.reason, 'unauthorized');
    assert.equal(sent.length, 0);
});

test('ignores bot-authored messages and does not reply-loop', async () => {
    const { engine } = makeEngine();
    const { message, sent } = makeMessage({
        author_id: 'bot2',
        author: { _id: 'bot2', username: 'OtherBot', bot: { owner: 'owner' } },
    });
    const result = await engine.handleMessage(message);
    assert.equal(result.reason, 'unauthorized');
    assert.equal(sent.length, 0);
});

test('kill switch prevents replies before generation', async () => {
    let disabled = true;
    const { engine, ollama } = makeEngine({ killSwitch: () => ({ disabled }) });
    const first = makeMessage();
    const blocked = await engine.handleMessage(first.message);
    assert.equal(blocked.reason, 'kill_switch');
    assert.equal(first.sent.length, 0);
    assert.equal(ollama.calls, 0);

    disabled = false;
    const second = makeMessage();
    const allowed = await engine.handleMessage(second.message);
    assert.equal(allowed.action, 'reply');
    assert.equal(second.sent.length, 1);
});

test('kill switch is checked again before sending', async () => {
    let disabled = false;
    const ollama = makeOllama(() => {
        disabled = true;
        return '{"should_reply":true,"reply":"hello there"}';
    });
    const { engine } = makeEngine({
        ollama,
        killSwitch: () => ({ disabled }),
    });
    const { message, sent } = makeMessage();
    const result = await engine.handleMessage(message);
    assert.equal(result.reason, 'kill_switch');
    assert.equal(sent.length, 0);
    assert.equal(ollama.calls, 1);
});

test('duplicate message ids produce at most one reply', async () => {
    const { engine } = makeEngine();
    const { message, sent } = makeMessage();
    const first = await engine.handleMessage(message);
    const second = await engine.handleMessage(message);
    assert.equal(first.action, 'reply');
    assert.equal(second.reason, 'duplicate_message');
    assert.equal(sent.length, 1);
});

test('channel cooldowns prevent rapid replies', async () => {
    let clock = 1000;
    const { engine } = makeEngine({ now: () => clock });
    const first = makeMessage();
    assert.equal((await engine.handleMessage(first.message)).action, 'reply');
    clock += 100;
    const second = makeMessage({ author_id: 'user2', author: { _id: 'user2', username: 'sam', bot: null } });
    const result = await engine.handleMessage(second.message);
    assert.equal(result.reason, 'channel_cooldown');
    assert.equal(second.sent.length, 0);
});

test('global rate limits are enforced', async () => {
    let clock = 1000;
    const { engine } = makeEngine({
        config: makeConfig({ rateLimits: { globalPerMinute: 1, perChannelMs: 1000, perUserMs: 5000 } }),
        now: () => clock,
    });
    const first = makeMessage();
    assert.equal((await engine.handleMessage(first.message)).action, 'reply');
    clock += 2000;
    const second = makeMessage({ author_id: 'user2', author: { _id: 'user2', username: 'sam', bot: null } });
    const result = await engine.handleMessage(second.message);
    assert.equal(result.reason, 'global_rate_limit');
    assert.equal(second.sent.length, 0);
});

test('maximum consecutive automated replies is enforced for allowed bots', async () => {
    let clock = 1000;
    const allowedBot = { _id: 'bot2', username: 'AllowedBot', bot: { owner: 'owner' } };
    const config = makeConfig({ allowedBotIds: ['bot2'] });
    let replyIndex = 0;
    const { engine } = makeEngine({
        config,
        now: () => clock,
        ollama: makeOllama(() => `{"should_reply":true,"reply":"reply ${replyIndex += 1}"}`),
    });
    for (let index = 0; index < 2; index += 1) {
        clock += 6000;
        const { message } = makeMessage({
            author_id: 'bot2',
            author: allowedBot,
            mention_ids: ['bot1'],
        });
        const result = await engine.handleMessage(message);
        assert.equal(result.action, 'reply');
    }
    clock += 6000;
    const third = makeMessage({ author_id: 'bot2', author: allowedBot, mention_ids: ['bot1'] });
    const result = await engine.handleMessage(third.message);
    assert.equal(result.reason, 'consecutive_limit');
    assert.equal(third.sent.length, 0);
});

test('invalid model output is rejected', async () => {
    const { engine } = makeEngine({ ollama: makeOllama('this is not json') });
    const { message, sent } = makeMessage();
    const result = await engine.handleMessage(message);
    assert.equal(result.reason, 'invalid_json');
    assert.equal(sent.length, 0);
});

test('model decline is respected', async () => {
    const { engine } = makeEngine({ ollama: makeOllama('{"should_reply":false}') });
    const { message, sent } = makeMessage();
    const result = await engine.handleMessage(message);
    assert.equal(result.reason, 'model_declined');
    assert.equal(sent.length, 0);
});

test('mentions and punctuation are sanitized', async () => {
    const text = sanitizeReply('@everyone <@123> HELLO!!!  how are you?', {
        lowercase: true,
        minimalPunctuation: true,
    }, 100);
    assert.equal(text, 'everyone hello how are you');
});

test('human claims and robotic disclaimers are rejected', () => {
    const character = makeCharacter();
    const config = makeConfig();
    const memory = createMemoryStore({ config: { maxEntries: 10, ttlMs: 60000 }, now: () => 1 });
    assert.equal(validateReply('i am a real human', character, config, memory).reason, 'human_claim');
    assert.equal(validateReply('as an ai language model i cannot', character, config, memory).reason, 'robotic_disclaimer');
});

test('prefix commands remain outside the AI path', async () => {
    const { engine, ollama } = makeEngine();
    const { message, sent } = makeMessage({ content: '!ping', mention_ids: [] });
    const result = await engine.handleMessage(message, { prefix: '!' });
    assert.equal(result.reason, 'command');
    assert.equal(sent.length, 0);
    assert.equal(ollama.calls, 0);
});

test('mention mode ignores messages that do not mention or reply to the bot', async () => {
    const { engine, ollama } = makeEngine();
    const { message, sent } = makeMessage({ content: 'just a normal message', mention_ids: [] });
    const result = await engine.handleMessage(message);
    assert.equal(result.action, 'skip');
    assert.equal(sent.length, 0);
    assert.equal(ollama.calls, 0);
});

test('reply-to-bot detection works through reply ids', async () => {
    const { engine } = makeEngine();
    const first = makeMessage();
    await engine.handleMessage(first.message);
    const reply = makeMessage({
        content: 'yeah what about it',
        mention_ids: [],
        reply_ids: [first.sent[0] ? 'bot-message-1' : 'missing'],
    });
    // The mock send returns a generated id; use the actual object from the
    // message event by looking at a reply to the current bot message id.
    reply.message.reply_ids = ['bot-message-1'];
    const result = await engine.handleMessage(reply.message);
    assert.notEqual(result.reason, 'not_triggered');
});

test('presence controller supports text/presence, caches, and reports unsupported activity', async () => {
    let edits = 0;
    const logger = makeLogger();
    const controller = createPresenceController({
        client: {
            users: {
                edit: async () => {
                    edits += 1;
                },
            },
        },
        logger,
    });
    const character = makeCharacter({
        presence: { enabled: true, presence: 'Idle', text: 'testing', activity: { type: 'playing' } },
    });
    assert.equal((await controller.apply(character)).ok, true);
    assert.equal((await controller.apply(character)).skipped, 'unchanged');
    assert.equal(edits, 1);
    assert.equal(controller.capabilities.activity, false);
    assert.ok(logger.entries.some((entry) => entry.event === 'presence_unsupported'));
});

test('presence controller fails gracefully when the client cannot edit status', async () => {
    const controller = createPresenceController({ client: { users: {} }, logger: makeLogger() });
    const character = makeCharacter({ presence: { enabled: true, presence: 'Online' } });
    const result = await controller.apply(character);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unsupported_client');
});

test('invalid presence values fail gracefully', async () => {
    const controller = createPresenceController({
        client: { users: { edit: async () => undefined } },
        logger: makeLogger(),
    });
    const character = { id: 'pixel', presence: { enabled: true, presence: 'Playing' } };
    const result = await controller.apply(character);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_presence');
});

test('memory isolation and reply deduplication', () => {
    const memory = createMemoryStore({ config: { maxEntries: 10, ttlMs: 60000 }, now: () => 1000 });
    memory.recordContext('a', 'channel1', { author: 'Alice', content: 'hello', messageId: 'm1' });
    memory.recordContext('b', 'channel1', { author: 'Alice', content: 'hello', messageId: 'm1' });
    assert.equal(memory.getContext('a', 'channel1').length, 1);
    assert.equal(memory.getContext('b', 'channel1').length, 1);
    memory.recordContext('a', 'channel1', { author: 'Alice', content: 'duplicate', messageId: 'm1' });
    assert.equal(memory.getContext('a', 'channel1').length, 1);

    memory.recordReply('a', 'that sounds good');
    assert.equal(memory.isDuplicateReply('a', 'that sounds good!'), true);
    assert.equal(memory.isDuplicateReply('b', 'that sounds good!'), false);
});

test('kill switch environment state is detected', () => {
    assert.equal(getKillSwitchState({ env: { NULLCORD_AI_DISABLED: '1' }, file: '/definitely/not/here' }).disabled, true);
    assert.equal(getKillSwitchState({ env: {}, file: '/definitely/not/here' }).disabled, false);
});

test('parseDecision rejects malformed and incomplete decisions', () => {
    assert.equal(parseDecision('nope').shouldReply, false);
    assert.equal(parseDecision('{"should_reply":true}').shouldReply, false);
    assert.equal(parseDecision('{"should_reply":false}').reason, 'model_declined');
    assert.deepEqual(parseDecision('{"should_reply":true,"reply":"hi"}'), {
        shouldReply: true,
        reply: 'hi',
    });
});

test('ambient mode respects response frequency and cooldowns', async () => {
    const character = makeCharacter({ responseFrequency: 0.5 });
    const config = makeConfig({ mode: 'ambient', characters: [character] });
    let clock = 1000;
    let replyIndex = 0;
    const { engine } = makeEngine({
        config,
        now: () => clock,
        random: () => 0.1,
        ollama: makeOllama(() => `{"should_reply":true,"reply":"ambient ${replyIndex += 1}"}`),
    });
    const first = makeMessage({ content: 'just chatting', mention_ids: [] });
    const result = await engine.handleMessage(first.message);
    assert.equal(result.action, 'reply');
    clock += 1000;
    const second = makeMessage({ content: 'still chatting', mention_ids: [] });
    const slow = await engine.handleMessage(second.message);
    assert.equal(slow.reason, 'user_cooldown');
});

test('model unavailability fails closed without calling chat', async () => {
    let chatCalls = 0;
    const ollama = {
        async checkModel() {
            return { available: false, model: 'qwen2.5:3b', models: [] };
        },
        async chat() {
            chatCalls += 1;
            return '{"should_reply":true,"reply":"should not happen"}';
        },
    };
    const { engine } = makeEngine({ ollama });
    const { message, sent } = makeMessage();
    const result = await engine.handleMessage(message);
    assert.equal(result.reason, 'model_unavailable');
    assert.equal(chatCalls, 0);
    assert.equal(sent.length, 0);
});

test('duplicate response text is suppressed across different messages', async () => {
    let clock = 1000;
    const { engine } = makeEngine({
        now: () => clock,
        ollama: makeOllama('{"should_reply":true,"reply":"same answer"}'),
    });
    const first = makeMessage();
    assert.equal((await engine.handleMessage(first.message)).action, 'reply');
    clock += 7000;
    const second = makeMessage({ author_id: 'user2', author: { _id: 'user2', username: 'sam', bot: null } });
    const result = await engine.handleMessage(second.message);
    assert.equal(result.reason, 'duplicate_reply');
    assert.equal(second.sent.length, 0);
});

test('example configuration loads four profiles and stays disabled', () => {
    const path = require('node:path');
    const { loadConfig } = require('./config');
    const config = loadConfig({ configPath: path.join(__dirname, '..', 'ai-config.example.json'), env: {} });
    assert.equal(config.enabled, false);
    assert.equal(config.characters.length, 4);
    assert.equal(config.validation.ok, true);
});

test('bounded multi-character chain follows one user message', async () => {
    const characters = [
        makeCharacter({ id: 'pixel', displayName: 'Pixel', presence: { enabled: true, presence: 'Online' } }),
        makeCharacter({ id: 'stack', displayName: 'Stack', presence: { enabled: true, presence: 'Busy' } }),
        makeCharacter({ id: 'juno', displayName: 'Juno', presence: { enabled: true, presence: 'Idle' } }),
    ];
    const config = makeConfig({
        characters,
        defaultCharacterId: 'pixel',
        chain: {
            enabled: true,
            maxFollowUps: 2,
            followUpChance: 1,
            delayMs: 0,
            characterIds: ['pixel', 'stack', 'juno'],
        },
        rateLimits: { maxConsecutive: 3, globalPerMinute: 10 },
    });
    let replyIndex = 0;
    const { engine, presence } = makeEngine({
        config,
        ollama: makeOllama(() => `{"should_reply":true,"reply":"chain reply ${replyIndex += 1}"}`),
    });
    const { message, sent } = makeMessage();
    const first = await engine.handleMessage(message);
    assert.equal(first.action, 'reply');
    assert.equal(await engine.waitForIdle(), true);
    assert.equal(sent.length, 3);
    assert.ok(presence.calls >= 3);
});

test('DND presence aliases map to the supported Stoat Busy value', () => {
    const { normalizePresenceValue } = require('./personalities');
    assert.equal(normalizePresenceValue('DND'), 'Busy');
    assert.equal(normalizePresenceValue('do not disturb'), 'Busy');
});
