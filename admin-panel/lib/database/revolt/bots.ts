import { Document } from "mongodb";

import { createCollectionFn } from "..";

export type BotDocument = Document & {
  _id: string;
  owner: string;
  token?: string;
  public?: boolean;
  flags?: number;
};

export type BotWithUser = {
  _id: string;
  owner: string;
  flags: number;
  verified: boolean;
  username: string;
  discriminator: string;
  display_name?: string | null;
  avatar?: unknown;
};

type BotUserDocument = Document & {
  _id: string;
  username?: string;
  discriminator?: string;
  display_name?: string | null;
  avatar?: unknown;
  bot?: { owner?: string; flags?: number };
};

const botCol = createCollectionFn<BotDocument>("revolt", "bots");
const userCol = createCollectionFn<BotUserDocument>("revolt", "users");

const VERIFIED = 1;

export async function fetchBotsByOwner(ownerId: string): Promise<BotDocument[]> {
  return botCol().find({ owner: ownerId }).sort({ _id: 1 }).toArray();
}

export async function fetchBotsWithUsers(ownerId: string): Promise<BotWithUser[]> {
  const bots = await fetchBotsByOwner(ownerId);
  if (!bots.length) return [];
  const users = await userCol()
    .find({ _id: { $in: bots.map((bot) => bot._id) } })
    .toArray();
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return bots.map((bot) => {
    const user = byId.get(bot._id) || ({} as BotUserDocument);
    const flags = Number(bot.flags || 0);
    return {
      _id: bot._id,
      owner: bot.owner,
      flags,
      verified: (flags & VERIFIED) !== 0,
      username: String(user.username || "bot"),
      discriminator: String(user.discriminator || "0000"),
      display_name: user.display_name ?? null,
      avatar: user.avatar,
    };
  });
}

export async function setBotVerified(botId: string, verified: boolean): Promise<void> {
  const bot = await botCol().findOne({ _id: botId });
  if (!bot) throw new Error("Bot not found");
  const flags = Number(bot.flags || 0);
  const nextFlags = verified ? flags | VERIFIED : flags & ~VERIFIED;
  await botCol().updateOne({ _id: botId }, { $set: { flags: nextFlags } });
  // User objects carry the bot metadata that clients render.
  await userCol().updateOne(
    { _id: botId, bot: { $exists: true } },
    verified
      ? { $set: { "bot.flags": nextFlags } }
      : { $set: { "bot.flags": nextFlags } },
  );
}
