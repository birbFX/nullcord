import { Document } from "mongodb";

import { createCollectionFn } from "..";

export const OWNER_ID = "01M5KCFRPDZZHPADH5BKJT19VG";

export const BADGE = {
  Developer: 1,
  Translator: 2,
  Supporter: 4,
  ResponsibleDisclosure: 8,
  Founder: 16,
  PlatformModeration: 32,
  ActiveSupporter: 64,
  Paw: 128,
  EarlyAdopter: 256,
  Sus: 512,
  Morbin: 1024,
  BugHunter: 4096,
  FormerAdmin: 8192,
  TrialMod: 16384,
  Mod: 32768,
  Owner: 65536,
  Bestie: 131072,
} as const;

/** The one login that is always the platform owner. */
export const OWNER_EMAIL = "nnewburg@canyonlakelabs.com";

export const BADGE_LABELS: { bit: number; label: string }[] = [
  { bit: BADGE.Owner, label: "Owner" },
  { bit: BADGE.Mod, label: "Moderator" },
  { bit: BADGE.TrialMod, label: "Trial Moderator" },
  { bit: BADGE.FormerAdmin, label: "Former Admin" },
  { bit: BADGE.Developer, label: "Developer" },
  { bit: BADGE.Founder, label: "Founder" },
  { bit: BADGE.BugHunter, label: "Bug Hunter" },
  { bit: BADGE.Supporter, label: "Supporter" },
  { bit: BADGE.Translator, label: "Translator" },
  { bit: BADGE.ResponsibleDisclosure, label: "Responsible Disclosure" },
  { bit: BADGE.Paw, label: "Paw" },
  { bit: BADGE.PlatformModeration, label: "Platform Moderation" },
  { bit: BADGE.ActiveSupporter, label: "Active Supporter" },
  { bit: BADGE.EarlyAdopter, label: "Early Adopter" },
  { bit: BADGE.Sus, label: "sus" },
  { bit: BADGE.Morbin, label: "It's Morbin Time" },
  { bit: BADGE.Bestie, label: "birbfx's bestie" },
];

export type Rank = "owner" | "admin" | "none";

type U = { _id: string; privileged?: boolean; badges?: number | null };

const users = createCollectionFn<Document & U>("revolt", "users");
const accounts = createCollectionFn<Document & { _id: string; email?: string }>(
  "revolt",
  "accounts",
);
const settings = createCollectionFn<Document>("revolt", "user_settings");

export function rankOf(u: U | null | undefined): Rank {
  if (!u) return "none";
  if (u._id === OWNER_ID || ((u.badges ?? 0) & BADGE.Owner) !== 0) return "owner";
  return u.privileged ? "admin" : "none";
}

/** The platform user behind the signed-in panel email. */
export async function actorByEmail(email: string) {
  const lower = email.toLowerCase();
  const account = await accounts().findOne({
    $or: [{ email }, { email_normalised: lower }, { email: lower }],
  } as never);
  if (!account) return null;
  const user = await users().findOne({ _id: account._id } as never);
  // The owner login always holds the Owner badge and admin, self-healing if removed.
  if (user && lower === OWNER_EMAIL && user._id === OWNER_ID) {
    const badges = user.badges ?? 0;
    if (!(badges & BADGE.Owner) || !user.privileged) {
      await users().updateOne(
        { _id: user._id } as never,
        { $set: { badges: badges | BADGE.Owner, privileged: true } } as never,
      );
      user.badges = badges | BADGE.Owner;
      user.privileged = true;
    }
  }
  return user;
}

async function fetchUser(id: string) {
  const user = await users().findOne({ _id: id } as never);
  if (!user) throw new Error("User not found");
  return user;
}

function assertCanTouch(actor: U, target: U) {
  if (actor._id === OWNER_ID) return;
  const a = rankOf(actor);
  const t = rankOf(target);
  if (a === "none") throw new Error("You do not have permission to do this");
  if (t === "owner") throw new Error("Owners cannot be changed by anyone but birbfx");
  if (t === "admin" && a !== "owner" && actor._id !== target._id)
    throw new Error("Only owners can change another admin");
}

/** Set a user's whole badge bitfield, enforcing who may touch which bits. */
export async function setBadgesAs(
  actorEmail: string,
  targetId: string,
  badges: number,
) {
  const actor = await actorByEmail(actorEmail);
  if (!actor) throw new Error("Your panel login is not linked to a platform account");
  const target = await fetchUser(targetId);
  assertCanTouch(actor as U, target as U);
  const old = target.badges ?? 0;
  const changed = old ^ badges;
  if (changed & BADGE.Owner && actor._id !== OWNER_ID)
    throw new Error("Only birbfx can give or remove the Owner badge");
  if (target._id === OWNER_ID && !(badges & BADGE.Owner))
    throw new Error("The platform owner cannot be demoted");
  await users().updateOne(
    { _id: targetId } as never,
    { $set: { badges } } as never,
  );
}

/** Admin access: owners only. Revoking leaves the Former Admin badge. */
export async function setAdminAs(
  actorEmail: string,
  targetId: string,
  privileged: boolean,
) {
  const actor = await actorByEmail(actorEmail);
  if (!actor) throw new Error("Your panel login is not linked to a platform account");
  if (rankOf(actor as U) !== "owner")
    throw new Error("Only owners can grant or revoke admin");
  const target = await fetchUser(targetId);
  assertCanTouch(actor as U, target as U);
  const badges = target.badges ?? 0;
  const next = privileged
    ? badges & ~BADGE.FormerAdmin
    : target.privileged
      ? badges | BADGE.FormerAdmin
      : badges;
  await users().updateOne(
    { _id: targetId } as never,
    { $set: { privileged, badges: next } } as never,
  );
}

/** Nitro tier lives in the user's server-side economy state. */
export async function getNitro(userId: string): Promise<string | null> {
  const row = await settings().findOne({ _id: userId } as never);
  const entry = row?.["nullcord:economy"];
  if (!Array.isArray(entry)) return null;
  try {
    return JSON.parse(entry[1])?.nitro ?? null;
  } catch {
    return null;
  }
}

export async function setNitroAs(
  actorEmail: string,
  targetId: string,
  tier: "nitro" | "basic" | null,
) {
  const actor = await actorByEmail(actorEmail);
  if (!actor || rankOf(actor as U) === "none")
    throw new Error("You do not have permission to do this");
  await fetchUser(targetId);
  const row = await settings().findOne({ _id: targetId } as never);
  const entry = row?.["nullcord:economy"];
  let state: Record<string, unknown> = {};
  if (Array.isArray(entry)) {
    try {
      state = JSON.parse(entry[1]) ?? {};
    } catch {
      state = {};
    }
  }
  state.nitro = tier;
  await settings().updateOne(
    { _id: targetId } as never,
    {
      $set: { "nullcord:economy": [Date.now(), JSON.stringify(state)] },
    } as never,
    { upsert: true },
  );
}
