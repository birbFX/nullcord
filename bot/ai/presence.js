'use strict';

const { normalizePresenceValue } = require('./personalities');

/*
 * Stoat presence support, verified against the local revolt.js client and
 * the backend's v0 UserStatus model:
 *
 *   PATCH /users/@me -> { status: { text, presence } }
 *
 * Supported: Online, Idle, Focus, Busy, Invisible and custom status text.
 * Unsupported: Discord-style activity objects (no activity field exists in
 * Stoat's UserStatus model). Activity values are reported and ignored rather
 * than being treated as if they worked.
 *
 * The client represents one authenticated bot account. Per-character presence
 * settings are supported in configuration, but only one character's status can
 * be active at a time in one bot process. A deployment that needs several
 * simultaneous identities must run one client/process per bot token.
 */

const SUPPORTED_PRESENCE = ['Online', 'Idle', 'Focus', 'Busy', 'Invisible'];

function createPresenceController({ client, logger, config = {} } = {}) {
    const lastApplied = new Map();
    const reportedUnsupported = new Set();
    const appliedAt = [];
    const minIntervalMs = Math.max(0, Number(config.minIntervalMs) || 0);
    const windowMs = Math.max(1000, Number(config.windowMs) || 10000);
    const maxUpdatesPerWindow = Math.max(1, Number(config.maxUpdatesPerWindow) || 2);
    let lastAppliedAt = 0;

    function reportOnce(key, fields) {
        if (reportedUnsupported.has(key)) return;
        reportedUnsupported.add(key);
        logger?.log?.('presence_unsupported', fields);
    }

    async function apply(character, { force = false } = {}) {
        if (!character || !character.presence || character.presence.enabled !== true) {
            return { ok: true, skipped: 'disabled' };
        }
        if (!client?.users || typeof client.users.edit !== 'function') {
            logger?.error?.('presence_failed', new Error('client does not expose users.edit'), {
                errorCategory: 'unsupported_client',
                characterId: character.id,
            });
            return { ok: false, reason: 'unsupported_client' };
        }

        const presence = normalizePresenceValue(character.presence.presence);
        if (!presence || !SUPPORTED_PRESENCE.includes(presence)) {
            logger?.error?.('presence_failed', new Error('invalid presence value'), {
                errorCategory: 'invalid_presence',
                characterId: character.id,
                presence: character.presence.presence,
            });
            return { ok: false, reason: 'invalid_presence' };
        }

        if (character.presence.activity) {
            reportOnce(`activity:${character.id}`, {
                characterId: character.id,
                reason: 'activity_not_supported_by_stoat',
            });
        }

        const text = String(character.presence.text || '')
            .replace(/[\r\n]+/g, ' ')
            .trim()
            .slice(0, 128);
        const key = JSON.stringify({ presence, text });
        if (!force && lastApplied.get(character.id) === key) {
            return { ok: true, skipped: 'unchanged' };
        }

        // Stoat's user-edit bucket accepts only two updates per 10 seconds.
        // Chain mode can produce several characters quickly, so throttle
        // status writes rather than generating repeated 429 errors.
        const nowValue = Date.now();
        while (appliedAt.length && nowValue - appliedAt[0] > windowMs) appliedAt.shift();
        if (!force && appliedAt.length >= maxUpdatesPerWindow) {
            logger?.log?.('presence_throttled', {
                characterId: character.id,
                reason: 'window_limit',
                windowMs,
                maxUpdatesPerWindow,
            });
            return { ok: true, skipped: 'throttled' };
        }
        if (!force && lastAppliedAt && nowValue - lastAppliedAt < minIntervalMs) {
            logger?.log?.('presence_throttled', {
                characterId: character.id,
                reason: 'min_interval',
                minIntervalMs,
            });
            return { ok: true, skipped: 'throttled' };
        }

        try {
            await client.users.edit({
                status: {
                    presence,
                    ...(text ? { text } : {}),
                },
            });
            lastApplied.set(character.id, key);
            appliedAt.push(nowValue);
            lastAppliedAt = nowValue;
            logger?.log?.('presence_applied', {
                characterId: character.id,
                presence,
                hasText: Boolean(text),
            });
            return { ok: true, presence, text };
        } catch (error) {
            logger?.error?.('presence_failed', error, {
                errorCategory: 'presence_request_failed',
                characterId: character.id,
            });
            return { ok: false, reason: 'request_failed' };
        }
    }

    function reset() {
        lastApplied.clear();
        appliedAt.length = 0;
        lastAppliedAt = 0;
    }

    return {
        apply,
        reset,
        capabilities: {
            presence: true,
            customStatusText: true,
            activity: false,
            multipleIdentities: false,
            supportedPresence: [...SUPPORTED_PRESENCE],
        },
    };
}

module.exports = { createPresenceController, SUPPORTED_PRESENCE };
