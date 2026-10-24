'use strict';

/*
 * Minimal Ollama chat client.
 *
 * The local installation already used by seed-accounts.mjs defaults to
 * qwen2.5:3b. This module only uses /api/chat and /api/tags. It never pulls a
 * model automatically and never substitutes a different model for a missing
 * configured one.
 */

class OllamaError extends Error {
    constructor(category, message, cause = null) {
        super(message);
        this.name = 'OllamaError';
        this.category = category;
        this.cause = cause;
    }
}

function createOllamaClient({
    url = 'http://127.0.0.1:11434',
    model = 'qwen2.5:3b',
    timeoutMs = 20000,
    fetchImpl = globalThis.fetch,
    logger = null,
} = {}) {
    const baseUrl = String(url || '').replace(/\/+$/, '');
    const modelName = String(model || '').trim();
    let modelChecked = false;
    let available = null;

    function assertUsable() {
        if (!baseUrl) throw new OllamaError('config', 'Ollama URL is empty');
        if (!modelName) throw new OllamaError('config', 'Ollama model is empty');
        if (typeof fetchImpl !== 'function') throw new OllamaError('unsupported', 'fetch is not available');
    }

    async function request(pathname, options = {}, timeout = timeoutMs) {
        assertUsable();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(1000, timeout));
        try {
            const response = await fetchImpl(`${baseUrl}${pathname}`, {
                ...options,
                signal: controller.signal,
            });
            const text = await response.text();
            let data = null;
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch {
                    data = text;
                }
            }
            if (!response.ok) {
                throw new OllamaError(
                    response.status === 404 ? 'model_unavailable' : 'http_error',
                    `Ollama ${pathname} returned HTTP ${response.status}`,
                );
            }
            return data;
        } catch (error) {
            if (error instanceof OllamaError) throw error;
            if (error?.name === 'AbortError') {
                throw new OllamaError('timeout', `Ollama ${pathname} timed out`);
            }
            throw new OllamaError('unavailable', `Ollama ${pathname} is unavailable: ${error.message}`, error);
        } finally {
            clearTimeout(timer);
        }
    }

    async function checkModel() {
        try {
            const data = await request('/api/tags', { method: 'GET' }, Math.min(5000, timeoutMs));
            const names = Array.isArray(data?.models)
                ? data.models.map((entry) => (typeof entry === 'string' ? entry : entry?.name)).filter(Boolean)
                : [];
            available = names.includes(modelName);
            modelChecked = true;
            if (!available) {
                logger?.log?.('ollama_model_unavailable', {
                    model: modelName,
                    errorCategory: 'model_unavailable',
                    availableModels: names.slice(0, 20),
                });
            }
            return { available, model: modelName, models: names };
        } catch (error) {
            available = false;
            modelChecked = true;
            logger?.error?.('ollama_unavailable', error, {
                errorCategory: error.category || 'unavailable',
                model: modelName,
            });
            return { available: false, model: modelName, models: [], error: error.category || 'unavailable' };
        }
    }

    async function chat({
        messages,
        temperature = 0.8,
        maxTokens = 180,
        timeout = timeoutMs,
        format = 'json',
    } = {}) {
        if (!Array.isArray(messages) || messages.length === 0) {
            throw new OllamaError('config', 'messages must be a non-empty array');
        }
        const body = {
            model: modelName,
            messages,
            stream: false,
            keep_alive: '10m',
            options: {
                temperature: Math.min(1.5, Math.max(0, Number(temperature) || 0.8)),
                top_p: 0.95,
                num_predict: Math.min(600, Math.max(16, Number(maxTokens) || 180)),
            },
        };
        if (format) body.format = format;

        const data = await request('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }, timeout);

        if (data?.error) {
            throw new OllamaError('model_error', String(data.error).slice(0, 200));
        }
        const content = data?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new OllamaError('invalid_output', 'Ollama returned an empty response');
        }
        return content.trim();
    }

    return {
        checkModel,
        chat,
        get model() {
            return modelName;
        },
        get url() {
            return baseUrl;
        },
        get checked() {
            return modelChecked;
        },
        get available() {
            return available;
        },
        capabilities: {
            chat: true,
            tags: true,
            automaticModelDownload: false,
            automaticModelSwitching: false,
        },
    };
}

module.exports = { createOllamaClient, OllamaError };
