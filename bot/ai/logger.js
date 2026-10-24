'use strict';

const fs = require('fs');
const path = require('path');

function redact(value) {
    if (value === undefined || value === null) return value;
    return String(value)
        .replace(/(x-session-token|authorization|token|password|cookie)\s*[:=]\s*[^\s,}]+/gi, '$1=[redacted]')
        .replace(/\b[A-Za-z0-9_-]{56,}\b/g, '[redacted]')
        .slice(0, 600);
}

function createLogger({ filePath = null, includeContent = false, now = () => new Date(), fsModule = fs } = {}) {
    let directoryReady = false;
    if (filePath) {
        try {
            fsModule.mkdirSync(path.dirname(filePath), { recursive: true });
            directoryReady = true;
        } catch {
            directoryReady = false;
        }
    }

    function write(entry) {
        const line = JSON.stringify(entry);
        if (!filePath || !directoryReady) {
            // Keep a compact fallback without content or secrets.
            console.error(line);
            return;
        }
        try {
            fsModule.appendFileSync(filePath, `${line}\n`);
        } catch (error) {
            console.error(JSON.stringify({ ts: now().toISOString(), event: 'logger_write_failed', error: redact(error.message) }));
        }
    }

    function log(event, fields = {}) {
        const entry = {
            ts: now().toISOString(),
            event,
            ...fields,
        };
        if (!includeContent) delete entry.content;
        write(entry);
    }

    function error(event, error, fields = {}) {
        log(event, {
            ...fields,
            errorCategory: fields.errorCategory || 'engine_error',
            error: redact(error?.message || error),
        });
    }

    return { log, error, redact };
}

module.exports = { createLogger, redact };
