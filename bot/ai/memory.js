'use strict';

const fs = require('fs');
const path = require('path');

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function words(value) {
    return new Set(normalizeText(value).split(' ').filter(Boolean));
}

function similarity(left, right) {
    const a = words(left);
    const b = words(right);
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    for (const word of a) if (b.has(word)) intersection += 1;
    return intersection / new Set([...a, ...b]).size;
}

function createMemoryStore({
    config = {},
    logger = null,
    now = () => Date.now(),
    fsModule = fs,
} = {}) {
    const contexts = new Map();
    const replies = new Map();
    const notes = new Map();
    const maxEntries = Math.min(200, Math.max(2, Number(config.maxEntries) || 40));
    const maxReplies = Math.min(100, Math.max(5, Number(config.maxReplies) || 20));
    const ttlMs = Math.min(
        30 * 24 * 60 * 60 * 1000,
        Math.max(60 * 1000, Number(config.ttlMs) || 7 * 24 * 60 * 60 * 1000),
    );
    const persistEnabled = Boolean(config.persist);
    const persistPath = config.path ? path.resolve(config.path) : null;
    const maxNotes = Math.min(100, Math.max(1, Number(config.maxNotes) || 20));

    function contextKey(characterId, channelId) {
        return `${characterId}:${channelId}`;
    }

    function pruneList(list) {
        const cutoff = now() - ttlMs;
        return list.filter((entry) => Number(entry.ts) >= cutoff);
    }

    function contextFor(characterId, channelId) {
        const key = contextKey(characterId, channelId);
        const list = pruneList(contexts.get(key) || []).slice(-maxEntries);
        if (list.length) contexts.set(key, list);
        else contexts.delete(key);
        return list;
    }

    function recordContext(characterId, channelId, entry = {}) {
        if (!characterId || !channelId) return;
        const key = contextKey(characterId, channelId);
        const list = contextFor(characterId, channelId);
        const content = String(entry.content || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
        if (!content) return;
        const messageId = entry.messageId ? String(entry.messageId).slice(0, 64) : null;
        if (messageId && list.some((item) => item.messageId === messageId)) return;
        list.push({
            author: String(entry.author || 'someone').slice(0, 64),
            isBot: Boolean(entry.isBot),
            content,
            messageId,
            ts: Number(entry.ts) || now(),
        });
        contexts.set(key, list.slice(-maxEntries));
    }

    function getContext(characterId, channelId) {
        return contextFor(characterId, channelId).map((entry) => ({ ...entry }));
    }

    function recordReply(characterId, text) {
        if (!characterId || !text) return;
        const list = pruneList(replies.get(characterId) || []);
        list.push({ text: String(text).slice(0, 1000), normalized: normalizeText(text), ts: now() });
        replies.set(characterId, list.slice(-maxReplies));
    }

    function getReplies(characterId) {
        return pruneList(replies.get(characterId) || []).map((entry) => entry.text);
    }

    function isDuplicateReply(characterId, text, threshold = 0.86) {
        const normalized = normalizeText(text);
        if (!normalized) return true;
        const list = pruneList(replies.get(characterId) || []);
        for (const entry of list) {
            if (entry.normalized === normalized) return true;
            if (similarity(normalized, entry.normalized) >= threshold) return true;
        }
        return false;
    }

    function rememberNote(characterId, note) {
        if (!characterId || !note) return;
        const list = pruneList(notes.get(characterId) || []);
        list.push({ text: String(note).slice(0, 500), ts: now() });
        notes.set(characterId, list.slice(-maxNotes));
    }

    function getNotes(characterId) {
        if (!characterId) return [];
        return pruneList(notes.get(characterId) || []).map((entry) => entry.text);
    }

    function clearCharacter(characterId) {
        for (const key of contexts.keys()) {
            if (key.startsWith(`${characterId}:`)) contexts.delete(key);
        }
        replies.delete(characterId);
        notes.delete(characterId);
    }

    function prune() {
        for (const [key, list] of contexts.entries()) {
            const pruned = pruneList(list);
            if (pruned.length) contexts.set(key, pruned);
            else contexts.delete(key);
        }
        for (const [key, list] of replies.entries()) {
            const pruned = pruneList(list);
            if (pruned.length) replies.set(key, pruned);
            else replies.delete(key);
        }
        for (const [key, list] of notes.entries()) {
            const pruned = pruneList(list);
            if (pruned.length) notes.set(key, pruned);
            else notes.delete(key);
        }
    }

    function serializable() {
        return {
            version: 1,
            savedAt: new Date(now()).toISOString(),
            contexts: Object.fromEntries([...contexts.entries()].map(([key, list]) => [key, pruneList(list)])),
            replies: Object.fromEntries([...replies.entries()].map(([key, list]) => [key, pruneList(list)])),
            notes: Object.fromEntries([...notes.entries()].map(([key, list]) => [key, pruneList(list)])),
        };
    }

    function persist() {
        if (!persistEnabled || !persistPath) return { ok: true, skipped: 'disabled' };
        try {
            fsModule.mkdirSync(path.dirname(persistPath), { recursive: true, mode: 0o700 });
            const temporary = `${persistPath}.${process.pid}.tmp`;
            fsModule.writeFileSync(temporary, `${JSON.stringify(serializable(), null, 2)}\n`, { mode: 0o600 });
            fsModule.renameSync(temporary, persistPath);
            try {
                fsModule.chmodSync(persistPath, 0o600);
            } catch {
                // best effort
            }
            return { ok: true };
        } catch (error) {
            logger?.error?.('memory_persist_failed', error, { errorCategory: 'memory_write_failed' });
            return { ok: false };
        }
    }

    function load() {
        if (!persistEnabled || !persistPath) return { ok: true, skipped: 'disabled' };
        try {
            if (!fsModule.existsSync(persistPath)) return { ok: true, skipped: 'missing' };
            const raw = JSON.parse(fsModule.readFileSync(persistPath, 'utf8'));
            if (!raw || typeof raw !== 'object') return { ok: false, reason: 'invalid' };
            for (const [key, list] of Object.entries(raw.contexts || {})) {
                if (!Array.isArray(list)) continue;
                contexts.set(key, pruneList(list));
            }
            for (const [key, list] of Object.entries(raw.replies || {})) {
                if (!Array.isArray(list)) continue;
                replies.set(key, pruneList(list).slice(-maxReplies));
            }
            for (const [key, list] of Object.entries(raw.notes || {})) {
                if (!Array.isArray(list)) continue;
                notes.set(key, pruneList(list).slice(-maxNotes));
            }
            return { ok: true };
        } catch (error) {
            logger?.error?.('memory_load_failed', error, { errorCategory: 'memory_read_failed' });
            return { ok: false };
        }
    }

    if (persistEnabled) load();

    return {
        recordContext,
        getContext,
        recordReply,
        getReplies,
        isDuplicateReply,
        rememberNote,
        getNotes,
        clearCharacter,
        prune,
        persist,
        load,
        serializable,
        get characterIds() {
            return [...new Set([...contexts.keys(), ...replies.keys(), ...notes.keys()].map((key) => key.split(':')[0]))];
        },
        normalizeText,
        similarity,
    };
}

module.exports = { createMemoryStore, normalizeText, similarity };
