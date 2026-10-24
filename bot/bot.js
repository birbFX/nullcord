#!/usr/bin/env node
'use strict';

/*
 * Canyon Lake Labs NullCord bot
 * -----------------------------
 * Port of the core Axiom features to Stoat/NullCord:
 *   - moderation (kick / ban / unban / warn / purge / say)
 *   - logging (messages, joins, leaves, channels)
 *   - prefix commands with per-server configuration
 *   - tickets / appeals (private channels with transcripts)
 *   - music queue (links/queue only: Stoat bots cannot stream voice yet)
 *
 * Runs on the local revolt.js, talks to the local API.
 *   node bot.js
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileP = promisify(execFile);

const revolt = require(path.join(__dirname, '..', 'revite', 'external', 'revolt.js'));
const { Client, Permission } = revolt;

const { createConversationEngine } = require('./ai/engine');
const { loadConfig: loadAiConfig } = require('./ai/config');

// ---------------------------------------------------------------- settings
const API_URL = process.env.NULLCORD_API || 'http://127.0.0.1:14702';
const TOKEN =
    process.env.NULLCORD_BOT_TOKEN ||
    fs.readFileSync(path.join(__dirname, '.token'), 'utf8').trim();

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const WARNS_FILE = path.join(DATA_DIR, 'warns.json');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const TRANSCRIPT_DIR = path.join(DATA_DIR, 'transcripts');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });

function loadJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
}

function saveJson(file, value) {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
}

let config = loadJson(CONFIG_FILE, { prefix: '!', guilds: {} });
let warns = loadJson(WARNS_FILE, {});
let tickets = loadJson(TICKETS_FILE, {});

if (!config.guilds) config.guilds = {};
saveJson(CONFIG_FILE, config);

function guildCfg(serverId) {
    if (!config.guilds[serverId]) {
        config.guilds[serverId] = {};
        saveJson(CONFIG_FILE, config);
    }
    return config.guilds[serverId];
}

const client = new Client({
    apiURL: API_URL,
    autoReconnect: true,
    heartbeat: 20,
});

let aiEngine = null;
try {
    const aiConfig = loadAiConfig();
    aiEngine = createConversationEngine({ client, config: aiConfig });
} catch (err) {
    // A malformed AI config must never take down moderation/tickets/music.
    console.error('ai init failed:', err?.message ?? err);
}

// ------------------------------------------------------------------ helpers
const P = {
    ViewChannel: Permission.ViewChannel,
    SendMessage: Permission.SendMessage,
    ReadMessageHistory: Permission.ReadMessageHistory,
    ManageMessages: Permission.ManageMessages,
    ManageChannel: Permission.ManageChannel,
    ManageServer: Permission.ManageServer,
    KickMembers: Permission.KickMembers,
    BanMembers: Permission.BanMembers,
    UploadFiles: Permission.UploadFiles ?? 0,
    SendEmbeds: Permission.SendEmbeds ?? 0,
    React: Permission.React ?? 0,
};

const TICKET_ALLOW =
    P.ViewChannel |
    P.SendMessage |
    P.ReadMessageHistory |
    P.UploadFiles |
    P.SendEmbeds |
    P.React;

const raw = {
    post: (p, d) => client.api.post(p, d),
    put: (p, d) => client.api.put(p, d),
    patch: (p, d) => client.api.patch(p, d),
    del: (p) => client.api.delete(p),
    get: (p, d) => client.api.get(p, d),
};

function log(...args) {
    console.log(new Date().toISOString(), ...args);
}

function sanitize(text) {
    // Keep mentions from pinging when we echo user content into log channels.
    return String(text ?? '').replace(/@/g, '@\u200b');
}

function fmtUser(user) {
    if (!user) return 'unknown user';
    return `${user.username}#${user.discriminator} (${user._id})`;
}

function decodeIdTime(id) {
    if (!id) return null;
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let time = 0;
    for (const ch of id.slice(0, 10).toUpperCase()) {
        const i = alphabet.indexOf(ch);
        if (i < 0) return null;
        time = time * 32 + i;
    }
    return new Date(time);
}

function duration(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
}

function parseUserId(arg) {
    if (!arg) return null;
    const m = /<@([0-9A-Z]+)>/.exec(arg);
    if (m) return m[1];
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(arg)) return arg.toUpperCase();
    return null;
}

function parseRoleId(arg) {
    if (!arg) return null;
    const m = /<@&([0-9A-Z]+)>/.exec(arg);
    if (m) return m[1];
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(arg)) return arg.toUpperCase();
    return null;
}

function parseChannelId(arg) {
    if (!arg) return null;
    const m = /<#([0-9A-Z]+)>/.exec(arg);
    if (m) return m[1];
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(arg)) return arg.toUpperCase();
    return null;
}

function memberHas(member, target, ...permissions) {
    try {
        return member.hasPermission(target, ...permissions);
    } catch {
        return false;
    }
}

function isMod(member, server) {
    if (!member || !server) return false;
    const user = member.user;
    if (user?.privileged) return true;
    if (server.owner === user?._id) return true;
    return (
        memberHas(member, server, 'ManageServer') ||
        memberHas(member, server, 'KickMembers') ||
        memberHas(member, server, 'BanMembers')
    );
}

function isAdmin(member, server) {
    if (!member || !server) return false;
    const user = member.user;
    if (user?.privileged) return true;
    if (server.owner === user?._id) return true;
    return memberHas(member, server, 'ManageServer');
}

async function sendTo(channelOrId, content) {
    const id = typeof channelOrId === 'string' ? channelOrId : channelOrId?._id;
    if (!id) return;
    const channel = client.channels.get(id);
    if (channel) return channel.sendMessage(content);
    return raw.post(`/channels/${id}/messages`, { content });
}

async function reply(ctx, content) {
    return sendTo(ctx.channel, content);
}

async function logEvent(serverId, content) {
    const cfg = config.guilds[serverId];
    if (!cfg?.logChannel) return;
    try {
        await sendTo(cfg.logChannel, content);
    } catch (err) {
        log('log channel failed', serverId, err?.message ?? err);
    }
}

async function fetchMember(server, userId) {
    const cached = client.members.getKey({ server: server._id, user: userId });
    if (cached) return cached;
    try {
        return await server.fetchMember(userId);
    } catch {
        return null;
    }
}

function roleIdsFor(member) {
    return Array.isArray(member?.roles) ? member.roles : [];
}

// -------------------------------------------------------------- permissions
async function createTicketRole(server, username) {
    const res = await raw.post(`/servers/${server._id}/roles`, {
        name: `ticket-${username}`.slice(0, 32),
        rank: 100,
    });
    // POST /roles returns { id, role } rather than the role itself.
    const roleId = res.id ?? res.role?._id ?? res._id;
    log('role created', roleId);
    if (!roleId) throw new Error('role create returned no id');
    await raw.put(`/servers/${server._id}/permissions/${roleId}`, {
        permissions: { allow: TICKET_ALLOW, deny: 0 },
    });
    log('role perms set', roleId);
    return { _id: roleId };
}

async function assignRole(server, userId, roleId, add) {
    const member = await fetchMember(server, userId);
    const roles = new Set(roleIdsFor(member));
    if (add) roles.add(roleId);
    else roles.delete(roleId);
    await raw.patch(`/servers/${server._id}/members/${userId}`, {
        roles: [...roles],
    });
}

// ----------------------------------------------------------------- commands
const commands = new Map();

function define(name, options, run) {
    const entry = { name, aliases: options.aliases ?? [], ...options, run };
    commands.set(name, entry);
    for (const alias of entry.aliases) commands.set(alias, entry);
}

const HELP_GROUPS = {
    General: ['help', 'ping', 'uptime', 'botinfo', 'userinfo', 'avatar', 'serverinfo'],
    Moderation: ['kick', 'ban', 'unban', 'warn', 'warnings', 'clearwarns', 'purge', 'say'],
    Tickets: ['ticket', 'close', 'add', 'remove', 'tickets'],
    Music: ['play', 'queue', 'nowplaying', 'skip', 'stop'],
    Config: ['setprefix', 'setlogs', 'setticketrole'],
};

// Stoat does not expose Discord message components yet. The help browser
// keeps the same shape as Axiom's AxHelpView (category picker, home,
// previous and next) but uses reactions instead of a Select + buttons.
const HELP_CATEGORY_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const HELP_HOME = '🏠';
const HELP_PREV = '◀️';
const HELP_NEXT = '▶️';
const helpViews = new Map();

function ax_help_categories(prefix) {
    return Object.entries(HELP_GROUPS)
        .map(([name, names]) => ({
            name,
            commands: names
                .filter((command) => commands.has(command))
                .map((command) => {
                    const entry = commands.get(command);
                    return {
                        name: entry.name,
                        usage: entry.usage ?? '',
                        description: entry.description ?? '',
                        aliases: entry.aliases ?? [],
                    };
                }),
        }))
        .filter((category) => category.commands.length > 0);
}

function ax_help_pages(prefix) {
    return ax_help_categories(prefix);
}

function helpText(ctx) {
    const lines = [`**Canyon Lake Labs bot** — prefix \`${ctx.prefix}\``, ''];
    for (const category of ax_help_categories(ctx.prefix)) {
        lines.push(`**${category.name}**`);
        for (const command of category.commands) {
            const usage = command.usage ? ` ${command.usage}` : '';
            lines.push(`\`${ctx.prefix}${command.name}${usage}\` — ${command.description}`);
        }
        lines.push('');
    }
    lines.push(`Use \`${ctx.prefix}help <command>\` for one command.`);
    return { content: lines.join('\n') };
}

class AxHelpView {
    constructor(ctx) {
        this.ctx = ctx;
        this.p = ctx.prefix;
        this.cats = ax_help_categories(this.p);
        this.pages = ax_help_pages(this.p);
        this.index = -1;
        this._key_first = ctx.author?._id;
        this.message = null;
    }

    async start() {
        this.message = await reply(this.ctx, this._renderPayload());
        if (!this.message?._id) return this.message;

        helpViews.set(this.message._id, this);
        for (const emoji of this._reactions()) {
            await this.message.react(emoji).catch(() => {});
        }
        return this.message;
    }

    _reactions() {
        const categoryReactions = this.cats
            .slice(0, HELP_CATEGORY_EMOJIS.length)
            .map((_, index) => HELP_CATEGORY_EMOJIS[index]);

        return [...categoryReactions, HELP_HOME, HELP_PREV, HELP_NEXT];
    }

    _renderPayload() {
        if (this.index < 0 || !this.pages[this.index]) {
            const lines = [
                `Prefix: \`${this.p}\``,
                '',
                ...this.cats.map((category, index) => {
                    const emoji = HELP_CATEGORY_EMOJIS[index] ?? `#${index + 1}`;
                    const count = category.commands.length;
                    return `${emoji} **${category.name}** — ${count} command${count === 1 ? '' : 's'}`;
                }),
                '',
                'React with a number to browse a category.',
                `Use \`${this.p}help <command>\` for one command.`,
            ];

            return {
                embeds: [
                    {
                        title: 'Canyon Lake Labs Help',
                        description: lines.join('\n'),
                        colour: '#3ba55c',
                    },
                ],
            };
        }

        const category = this.pages[this.index];
        const lines = category.commands.map((command) => {
            const usage = command.usage ? ` ${command.usage}` : '';
            const aliases = command.aliases.length
                ? ` · aliases: ${command.aliases.map((alias) => `\`${alias}\``).join(', ')}`
                : '';
            return `\`${this.p}${command.name}${usage}\` — ${command.description}${aliases}`;
        });

        lines.push('');
        lines.push(`Page ${this.index + 1}/${this.pages.length} · ${category.name}`);
        lines.push(`Use \`${this.p}help <command>\` for one command.`);

        return {
            embeds: [
                {
                    title: `${category.name} commands`,
                    description: lines.join('\n'),
                    colour: '#3ba55c',
                },
            ],
        };
    }

    async _render(interaction) {
        if (!this.message) return;

        try {
            await this.message.edit(this._renderPayload());
        } catch (err) {
            log('help edit failed', err?.message ?? err);
            // A deleted or unavailable message should not keep a dead view.
            helpViews.delete(this.message._id);
        }
    }

    async _on_select(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.cats.length) return;
        this.index = index;
        await this._render();
    }

    async _on_home() {
        this.index = -1;
        await this._render();
    }

    async _on_prev() {
        this.index = Math.max(-1, this.index - 1);
        await this._render();
    }

    async _on_next() {
        this.index = Math.min(this.cats.length - 1, this.index + 1);
        await this._render();
    }

    async handle(packet) {
        if (!packet || packet.type === 'MessageUnreact') return;
        if (packet.user_id === client.user?._id) return;
        if (packet.user_id !== this._key_first) return;

        const emoji = packet.emoji_id;
        const categoryIndex = HELP_CATEGORY_EMOJIS.indexOf(emoji);

        if (categoryIndex >= 0) return this._on_select(categoryIndex);
        if (emoji === HELP_HOME) return this._on_home();
        if (emoji === HELP_PREV) return this._on_prev();
        if (emoji === HELP_NEXT) return this._on_next();
    }
}

define('help', { aliases: ['h', 'commands'], description: 'List commands' }, async (ctx) => {
    if (ctx.args[0]) {
        const requested = ctx.args.join(' ').toLowerCase();
        const categoryIndex = ax_help_categories(ctx.prefix).findIndex(
            (category) => category.name.toLowerCase() === requested,
        );
        if (categoryIndex >= 0) {
            const view = new AxHelpView(ctx);
            view.index = categoryIndex;
            return view.start();
        }

        const c = commands.get(ctx.args[0].toLowerCase());
        if (!c) return reply(ctx, `No such command: ${ctx.args[0]}`);
        const usage = c.usage ? ` ${c.usage}` : '';
        return reply(ctx, `\`${ctx.prefix}${c.name}${usage}\`\n${c.description}`);
    }

    const view = new AxHelpView(ctx);
    return view.start();
});

define('ping', { description: 'Gateway and API latency' }, async (ctx) => {
    const started = Date.now();
    await raw.get('/');
    const api = Date.now() - started;
    const ws = client.websocket.ping ?? '?';
    return reply(ctx, `Pong! gateway ${ws}ms · api ${api}ms`);
});

const START = Date.now();
define('uptime', { description: 'How long the bot has been running' }, async (ctx) => {
    return reply(ctx, `Up for ${duration((Date.now() - START) / 1000)}`);
});

define('botinfo', { description: 'Bot information' }, async (ctx) => {
    return reply(
        ctx,
        [
            `**Canyon Lake Labs bot**`,
            `User: ${fmtUser(client.user)}`,
            `API: ${client.apiURL}`,
            `Servers: ${client.servers.size}`,
            `Commands: ${new Set([...commands.values()].map((c) => c.name)).size}`,
            `Uptime: ${duration((Date.now() - START) / 1000)}`,
        ].join('\n'),
    );
});

define('userinfo', { aliases: ['whois'], usage: '[@user]', description: 'User details' }, async (ctx) => {
    const id = parseUserId(ctx.args[0]) ?? ctx.author._id;
    const user = client.users.get(id) ?? ctx.author;
    const created = decodeIdTime(user._id);
    const member = ctx.server ? await fetchMember(ctx.server, id) : null;

    const lines = [
        `**${user.username}#${user.discriminator}** (\`${user._id}\`)`,
        `Display name: ${user.display_name ?? '—'}`,
        `Bot: ${user.bot ? 'yes' : 'no'} · Privileged: ${user.privileged ? 'yes' : 'no'}`,
        created ? `Created: ${created.toUTCString()}` : null,
        member ? `Joined: ${new Date(Number(member.joined_at)).toUTCString()}` : null,
        member && roleIdsFor(member).length
            ? `Roles: ${roleIdsFor(member).map((r) => ctx.server.roles?.[r]?.name ?? r).join(', ')}`
            : null,
    ].filter(Boolean);

    return reply(ctx, lines.join('\n'));
});

define('avatar', { usage: '[@user]', description: 'Show a user avatar URL' }, async (ctx) => {
    const id = parseUserId(ctx.args[0]) ?? ctx.author._id;
    const user = client.users.get(id) ?? ctx.author;
    const url = user.generateAvatarURL({ max_side: 256 });
    return reply(ctx, url);
});

define('serverinfo', { aliases: ['guildinfo'], description: 'Server details' }, async (ctx) => {
    if (!ctx.server) return reply(ctx, 'This command only works in a server.');
    const s = ctx.server;
    const owner = client.users.get(s.owner);
    return reply(
        ctx,
        [
            `**${s.name}** (\`${s._id}\`)`,
            `Owner: ${owner ? `${owner.username}#${owner.discriminator}` : s.owner}`,
            `Channels: ${Object.keys(s.channels ?? {}).length}`,
            `Roles: ${Object.keys(s.roles ?? {}).length}`,
            `Created: ${decodeIdTime(s._id)?.toUTCString() ?? '?'}`,
        ].join('\n'),
    );
});

// --------------------------------------------------------------- moderation
define(
    'kick',
    { usage: '@user [reason]', description: 'Kick a member', mod: true },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        const id = parseUserId(ctx.args[0]);
        if (!id) return reply(ctx, 'Mention a user to kick.');
        if (id === ctx.author._id) return reply(ctx, 'You cannot kick yourself.');
        const member = await fetchMember(ctx.server, id);
        if (!member) return reply(ctx, 'That user is not in this server.');
        const reason = ctx.args.slice(1).join(' ') || 'No reason provided';
        await member.kick();
        await logEvent(ctx.server._id, `**Kick** ${fmtUser(member.user)} by ${fmtUser(ctx.author)} — ${sanitize(reason)}`);
        return reply(ctx, `Kicked ${member.user?.username ?? id}.`);
    },
);

define(
    'ban',
    { usage: '@user [reason]', description: 'Ban a member', mod: true },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        const id = parseUserId(ctx.args[0]);
        if (!id) return reply(ctx, 'Mention a user to ban.');
        if (id === ctx.author._id) return reply(ctx, 'You cannot ban yourself.');
        const reason = ctx.args.slice(1).join(' ') || 'No reason provided';
        await ctx.server.banUser(id, { reason });
        await logEvent(ctx.server._id, `**Ban** ${id} by ${fmtUser(ctx.author)} — ${sanitize(reason)}`);
        return reply(ctx, `Banned ${id}.`);
    },
);

define(
    'unban',
    { usage: '<user id>', description: 'Unban a user', mod: true },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        const id = parseUserId(ctx.args[0]);
        if (!id) return reply(ctx, 'Provide a user ID.');
        await ctx.server.unbanUser(id);
        await logEvent(ctx.server._id, `**Unban** ${id} by ${fmtUser(ctx.author)}`);
        return reply(ctx, `Unbanned ${id}.`);
    },
);

define(
    'warn',
    { usage: '@user [reason]', description: 'Warn a member', mod: true },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        const id = parseUserId(ctx.args[0]);
        if (!id) return reply(ctx, 'Mention a user to warn.');
        const reason = ctx.args.slice(1).join(' ') || 'No reason provided';
        const sid = ctx.server._id;
        warns[sid] ??= {};
        warns[sid][id] ??= [];
        warns[sid][id].push({
            reason,
            by: ctx.author._id,
            at: new Date().toISOString(),
        });
        saveJson(WARNS_FILE, warns);
        await logEvent(sid, `**Warn** ${id} by ${fmtUser(ctx.author)} — ${sanitize(reason)} (${warns[sid][id].length} total)`);
        return reply(ctx, `Warned ${id}. They now have ${warns[sid][id].length} warning(s).`);
    },
);

define(
    'warnings',
    { aliases: ['warns'], usage: '[@user]', description: 'List warnings', mod: true },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        const id = parseUserId(ctx.args[0]) ?? ctx.author._id;
        const list = warns[ctx.server._id]?.[id] ?? [];
        if (!list.length) return reply(ctx, 'No warnings.');
        return reply(
            ctx,
            list
                .map((w, i) => `${i + 1}. ${w.reason} — <@${w.by}> · ${w.at}`)
                .join('\n'),
        );
    },
);

define(
    'clearwarns',
    { usage: '@user', description: 'Clear warnings', mod: true },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        const id = parseUserId(ctx.args[0]);
        if (!id) return reply(ctx, 'Mention a user.');
        const sid = ctx.server._id;
        if (warns[sid]?.[id]) {
            delete warns[sid][id];
            saveJson(WARNS_FILE, warns);
        }
        return reply(ctx, `Cleared warnings for ${id}.`);
    },
);

define(
    'purge',
    { aliases: ['clear'], usage: '<count>', description: 'Delete recent messages', mod: true },
    async (ctx) => {
        const count = Math.min(Math.max(parseInt(ctx.args[0], 10) || 10, 1), 100);
        if (!memberHas(ctx.member, ctx.channel, 'ManageMessages')) {
            return reply(ctx, 'You need Manage Messages here.');
        }
        const messages = await ctx.channel.fetchMessages({ limit: count + 1 });
        const ids = messages
            .filter((m) => m._id !== ctx.message._id)
            .slice(0, count)
            .map((m) => m._id);
        if (!ids.length) return reply(ctx, 'Nothing to delete.');
        await ctx.channel.deleteMessages(ids);
        const notice = await reply(ctx, `Deleted ${ids.length} message(s).`);
        setTimeout(() => notice.delete().catch(() => {}), 4000);
    },
);

define(
    'say',
    { usage: '<text>', description: 'Send a message as the bot', mod: true },
    async (ctx) => {
        const text = ctx.raw.slice(ctx.prefix.length + ctx.command.name.length).trim();
        if (!text) return reply(ctx, 'Nothing to say.');
        await ctx.message.delete().catch(() => {});
        return reply(ctx, text);
    },
);

// ------------------------------------------------------------------ tickets
define(
    'ticket',
    { aliases: ['appeal'], usage: '[reason]', description: 'Open a private ticket' },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Tickets can only be opened in a server.');
        const sid = ctx.server._id;
        const cfg = guildCfg(sid);
        const reason = ctx.args.join(' ') || 'No reason provided';

        let existingId = Object.keys(tickets).find(
            (id) => tickets[id].server === sid && tickets[id].user === ctx.author._id,
        );
        if (existingId) {
            // Drop stale records left behind when a channel was deleted.
            let alive = true;
            try {
                await raw.get(`/channels/${existingId}`);
            } catch {
                alive = false;
            }
            if (alive) {
                return reply(ctx, `You already have an open ticket: <#${existingId}>`);
            }
            delete tickets[existingId];
            saveJson(TICKETS_FILE, tickets);
            existingId = null;
        }

        const name = `ticket-${ctx.author.username}`.slice(0, 32);
        let channel;
        let role;
        try {
            channel = await raw.post(`/servers/${sid}/channels`, {
                type: 'Text',
                name,
                description: `Ticket opened by ${ctx.author.username}`,
            });
            // Revolt channel overwrites are role-based: give this ticket its
            // own role, hand it to the opener, then deny @default the channel.
            log('ticket: channel', channel._id);
            role = await createTicketRole(ctx.server, ctx.author.username);
            log('ticket: role', role._id);
            await assignRole(ctx.server, ctx.author._id, role._id, true);
            log('ticket: role assigned');
            await raw.put(`/channels/${channel._id}/permissions/default`, {
                permissions: { allow: 0, deny: P.ViewChannel },
            });
            log('ticket: locked');
        } catch (err) {
            log('ticket setup failed', err?.message ?? err, err?.response?.status, JSON.stringify(err?.response?.data ?? null));
            if (channel?._id) await raw.del(`/channels/${channel._id}`).catch(() => {});
            if (role?._id) await raw.del(`/servers/${sid}/roles/${role._id}`).catch(() => {});
            return reply(ctx, 'Could not set up the ticket (missing Manage Channel / Role permissions?).');
        }

        tickets[channel._id] = {
            server: sid,
            user: ctx.author._id,
            role: role._id,
            reason,
            created: new Date().toISOString(),
        };
        saveJson(TICKETS_FILE, tickets);

        await sendTo(
            channel._id,
            [
                `<@${ctx.author._id}> — your ticket is open.`,
                `Reason: ${reason}`,
                '',
                'Staff can reply here. Use `!close [reason]` to close it.',
            ].join('\n'),
        );
        await logEvent(sid, `**Ticket opened** <#${channel._id}> by ${fmtUser(ctx.author)} — ${sanitize(reason)}`);
        return reply(ctx, `Ticket created: <#${channel._id}>`);
    },
);

define(
    'close',
    { usage: '[reason]', description: 'Close the current ticket' },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        const ticket = tickets[ctx.channel._id];
        if (!ticket) return reply(ctx, 'This channel is not a ticket.');
        const allowed =
            ctx.author._id === ticket.user || isMod(ctx.member, ctx.server);
        if (!allowed) return reply(ctx, 'Only the opener or staff can close this ticket.');

        const reason = ctx.args.join(' ') || 'No reason provided';

        try {
            const history = await ctx.channel.fetchMessages({ limit: 100 });
            const transcript = history.map((m) => ({
                id: m._id,
                author: m.author_id,
                username: m.author?.username,
                content: m.content,
                at: m.createdAt,
            }));
            fs.writeFileSync(
                path.join(TRANSCRIPT_DIR, `${ctx.channel._id}.json`),
                JSON.stringify(transcript, null, 2),
            );
        } catch (err) {
            log('transcript failed', err?.message ?? err);
        }

        const ticketRole = ticket.role;
        delete tickets[ctx.channel._id];
        saveJson(TICKETS_FILE, tickets);
        if (ticketRole) {
            await raw.del(`/servers/${ticket.server}/roles/${ticketRole}`).catch(() => {});
        }
        await logEvent(
            ctx.server._id,
            `**Ticket closed** <#${ctx.channel._id}> by ${fmtUser(ctx.author)} — ${sanitize(reason)}`,
        );
        await reply(ctx, 'Closing ticket…');
        setTimeout(() => ctx.channel.delete().catch((err) => log('close failed', err?.message ?? err)), 800);
    },
);

define(
    'add',
    { usage: '@user', description: 'Add a user to this ticket' },
    async (ctx) => {
        const ticket = tickets[ctx.channel._id];
        if (!ticket) return reply(ctx, 'This channel is not a ticket.');
        if (ctx.author._id !== ticket.user && !isMod(ctx.member, ctx.server)) {
            return reply(ctx, 'Only the opener or staff can add users.');
        }
        const id = parseUserId(ctx.args[0]);
        if (!id) return reply(ctx, 'Mention a user.');
        if (!ticket.role) return reply(ctx, 'This ticket has no access role.');
        await assignRole(ctx.server, id, ticket.role, true);
        return reply(ctx, `Added <@${id}> to the ticket.`);
    },
);

define(
    'remove',
    { usage: '@user', description: 'Remove a user from this ticket' },
    async (ctx) => {
        const ticket = tickets[ctx.channel._id];
        if (!ticket) return reply(ctx, 'This channel is not a ticket.');
        if (ctx.author._id !== ticket.user && !isMod(ctx.member, ctx.server)) {
            return reply(ctx, 'Only the opener or staff can remove users.');
        }
        const id = parseUserId(ctx.args[0]);
        if (!id) return reply(ctx, 'Mention a user.');
        if (!ticket.role) return reply(ctx, 'This ticket has no access role.');
        await assignRole(ctx.server, id, ticket.role, false);
        return reply(ctx, `Removed <@${id}> from the ticket.`);
    },
);

define(
    'tickets',
    { description: 'List open tickets', mod: true },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        const list = Object.entries(tickets).filter(([, t]) => t.server === ctx.server._id);
        if (!list.length) return reply(ctx, 'No open tickets.');
        return reply(
            ctx,
            list
                .map(([id, t]) => `<#${id}> — <@${t.user}> · ${t.reason}`)
                .join('\n'),
        );
    },
);

// -------------------------------------------------------------------- music
const queues = new Map();

function queueFor(serverId) {
    if (!queues.has(serverId)) queues.set(serverId, { items: [], index: -1 });
    return queues.get(serverId);
}

async function resolveTrack(query) {
    const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    try {
        const { stdout } = await execFileP(
            'yt-dlp',
            ['--no-playlist', '--print', '%(id)s\t%(title)s', `ytsearch1:${query}`],
            { timeout: 25000 },
        );
        const line = stdout.trim().split('\n')[0];
        const [id, title] = line.split('\t');
        if (id) {
            return { title: title || query, url: `https://www.youtube.com/watch?v=${id}` };
        }
    } catch (err) {
        log('yt-dlp failed', err?.message ?? err);
    }
    return { title: query, url: search, note: 'link only' };
}

define(
    'play',
    { usage: '<query>', description: 'Queue a track (links; no voice streaming)' },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Music queues are per-server.');
        const query = ctx.args.join(' ').trim();
        if (!query) return reply(ctx, `Usage: ${ctx.prefix}play <query>`);
        const track = await resolveTrack(query);
        const q = queueFor(ctx.server._id);
        q.items.push(track);
        if (q.index < 0) q.index = 0;
        return reply(
            ctx,
            `Queued **${track.title}**\n${track.url}${track.note ? `\n_${track.note}_` : ''}`,
        );
    },
);

define(
    'queue',
    { aliases: ['q'], description: 'Show the music queue' },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        const q = queueFor(ctx.server._id);
        if (!q.items.length) return reply(ctx, 'Queue is empty.');
        const lines = q.items.map(
            (t, i) => `${i === q.index ? '▶' : ' '} ${i + 1}. ${t.title}\n   ${t.url}`,
        );
        return reply(ctx, lines.join('\n'));
    },
);

define(
    'nowplaying',
    { aliases: ['np'], description: 'Show the current track' },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        const q = queueFor(ctx.server._id);
        const t = q.items[q.index];
        if (!t) return reply(ctx, 'Nothing playing.');
        return reply(ctx, `▶ **${t.title}**\n${t.url}`);
    },
);

define('skip', { description: 'Skip the current track' }, async (ctx) => {
    if (!ctx.server) return reply(ctx, 'Server only.');
    const q = queueFor(ctx.server._id);
    if (!q.items.length) return reply(ctx, 'Queue is empty.');
    q.index += 1;
    if (q.index >= q.items.length) {
        q.items = [];
        q.index = -1;
        return reply(ctx, 'Queue finished.');
    }
    const t = q.items[q.index];
    return reply(ctx, `Skipped to **${t.title}**\n${t.url}`);
});

define('stop', { description: 'Clear the music queue' }, async (ctx) => {
    if (!ctx.server) return reply(ctx, 'Server only.');
    queues.set(ctx.server._id, { items: [], index: -1 });
    return reply(ctx, 'Queue cleared.');
});

// ------------------------------------------------------------------- config
define(
    'setprefix',
    { usage: '<prefix>', description: 'Change the command prefix', mod: true },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        if (!isAdmin(ctx.member, ctx.server)) return reply(ctx, 'You need Manage Server.');
        const prefix = (ctx.args[0] ?? '').slice(0, 5);
        if (!prefix) return reply(ctx, 'Provide a prefix.');
        guildCfg(ctx.server._id).prefix = prefix;
        saveJson(CONFIG_FILE, config);
        return reply(ctx, `Prefix set to \`${prefix}\`.`);
    },
);

define(
    'setlogs',
    { usage: '#channel', description: 'Set the moderation log channel', mod: true },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        if (!isAdmin(ctx.member, ctx.server)) return reply(ctx, 'You need Manage Server.');
        const id = parseChannelId(ctx.args[0]) ?? ctx.channel._id;
        guildCfg(ctx.server._id).logChannel = id;
        saveJson(CONFIG_FILE, config);
        return reply(ctx, `Logs will be posted in <#${id}>.`);
    },
);

define(
    'setticketrole',
    { usage: '@role', description: 'Role that can see all tickets', mod: true },
    async (ctx) => {
        if (!ctx.server) return reply(ctx, 'Server only.');
        if (!isAdmin(ctx.member, ctx.server)) return reply(ctx, 'You need Manage Server.');
        const id = parseRoleId(ctx.args[0]);
        if (!id) return reply(ctx, 'Mention a role.');
        guildCfg(ctx.server._id).ticketRole = id;
        saveJson(CONFIG_FILE, config);
        return reply(ctx, `Ticket staff role set to ${ctx.server.roles?.[id]?.name ?? id}.`);
    },
);

// ------------------------------------------------------------------ gateway
client.on('ready', () => {
    log(`ready as ${fmtUser(client.user)}`);
    log(`api ${client.apiURL} · servers ${client.servers.size} · commands ${new Set([...commands.values()].map((c) => c.name)).size}`);
    if (aiEngine) {
        aiEngine.start().catch((err) => log('ai start failed', err?.message ?? err));
    }
});

client.on('message', async (message) => {
    try {
        await handleMessage(message);
    } catch (err) {
        log('command error', err?.stack ?? err);
        try {
            await message.channel?.sendMessage('Something went wrong handling that command.');
        } catch {}
    }
});

async function handleMessage(message) {
    if (!message || !message.content) return;
    if (message.author_id === client.user?._id) return;
    const author = message.author;
    if (!author || author.bot) return;

    const channel = message.channel;
    if (!channel) return;
    const server = channel.server ?? null;
    const cfg = server ? config.guilds[server._id] : null;
    const prefix = (server && cfg?.prefix) || config.prefix || '!';

    const content = message.content.trim();
    if (!content.startsWith(prefix)) {
        // The AI engine has its own allowlist and is disabled unless
        // data/ai.json explicitly enables it. Existing commands stay on the
        // command path below and are never sent to the model.
        if (aiEngine) {
            try {
                await aiEngine.handleMessage(message, { prefix });
            } catch (err) {
                log('ai handler failed', err?.message ?? err);
            }
        }
        return;
    }

    const withoutPrefix = content.slice(prefix.length);
    const [name, ...args] = withoutPrefix.split(/\s+/);
    const command = commands.get((name ?? '').toLowerCase());
    if (!command) return;

    const member = server
        ? client.members.getKey({ server: server._id, user: author._id }) ?? null
        : null;

    if (command.guildOnly && !server) {
        return channel.sendMessage('This command only works in a server.');
    }
    if (command.mod) {
        if (!server || !isMod(member, server)) {
            return channel.sendMessage('You do not have permission to use that command.');
        }
    }

    const ctx = {
        client,
        message,
        channel,
        server,
        member,
        author,
        args,
        raw: content,
        prefix,
        command,
    };

    log(`cmd ${prefix}${command.name} by ${author.username} in ${server ? server.name : 'DM'}`);
    return command.run(ctx);
}

// ------------------------------------------------------------------ logging
client.on('message/updated', async (message, packet) => {
    if (!packet || packet.type !== 'MessageReact' || !packet.id) return;

    const view = helpViews.get(packet.id);
    if (!view) return;

    try {
        await view.handle(packet);
    } catch (err) {
        log('help interaction failed', err?.stack ?? err);
    }
});

client.on('message/delete', (id, message) => {
    helpViews.delete(id);
    try {
        const serverId = message?.channel?.server_id;
        if (!serverId) return;
        logEvent(
            serverId,
            `**Message deleted** in <#${message.channel._id}> by ${
                message.author ? fmtUser(message.author) : message.author_id
            }: ${sanitize((message.content ?? '').slice(0, 500)) || '(no cached content)'}`,
        );
    } catch (err) {
        log('delete log failed', err?.message ?? err);
    }
});

client.on('message/update', (message) => {
    try {
        const serverId = message?.channel?.server_id;
        if (!serverId) return;
        logEvent(
            serverId,
            `**Message edited** in <#${message.channel._id}> by ${fmtUser(
                message.author,
            )}: ${sanitize((message.content ?? '').slice(0, 500))}`,
        );
    } catch (err) {
        log('edit log failed', err?.message ?? err);
    }
});

client.on('member/join', (member) => {
    try {
        const serverId = member.server?._id;
        if (!serverId) return;
        logEvent(serverId, `**Member joined** ${fmtUser(member.user)}`);
    } catch (err) {
        log('join log failed', err?.message ?? err);
    }
});

client.on('member/leave', (key) => {
    try {
        const user = client.users.get(key.user);
        logEvent(
            key.server,
            `**Member left** ${user ? fmtUser(user) : key.user}`,
        );
    } catch (err) {
        log('leave log failed', err?.message ?? err);
    }
});

client.on('channel/create', (channel) => {
    try {
        if (!channel.server_id) return;
        logEvent(
            channel.server_id,
            `**Channel created** #${channel.name} (<#${channel._id}>)`,
        );
    } catch (err) {
        log('channel create log failed', err?.message ?? err);
    }
});

client.on('channel/delete', (id, channel) => {
    try {
        if (!channel?.server_id) return;
        logEvent(
            channel.server_id,
            `**Channel deleted** #${channel.name} (${id})`,
        );
    } catch (err) {
        log('channel delete log failed', err?.message ?? err);
    }
});

// --------------------------------------------------------------- lifecycle
async function shutdown(signal) {
    log(`shutting down (${signal})`);
    try {
        if (aiEngine) await aiEngine.shutdown();
    } catch (err) {
        log('ai shutdown failed', err?.message ?? err);
    }
    client.websocket.disconnect();
    process.exit(0);
}
process.on('SIGINT', () => {
    shutdown('SIGINT');
});
process.on('SIGTERM', () => {
    shutdown('SIGTERM');
});

client.loginBot(TOKEN).catch((err) => {
    console.error('login failed:', err?.message ?? err);
    process.exit(1);
});
