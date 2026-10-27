import fs from "node:fs";
import { Document } from "mongodb";
import Revolt from "revolt-nodejs-bindings";
import { API } from "revolt.js";

import { callProcedure, createCollectionFn } from "..";

export type IpBan = {
  _id: string;
  reason?: string;
  message?: string;
  expires_at?: number | string | null;
  created_by?: string;
  created_at?: number | string | null;
};

export type UserIP = {
  ip: string;
  last_seen?: string;
};

export type RevoltUser = API.User;
export type RevoltUserInfo = Omit<RevoltUser, "relations"> & {
  relations: {
    friends: number;
  };
};

export function isRestrictedUser(user: RevoltUser) {
  if (
    user._id === "01EX2NCWQ0CHS3QJF0FEQS1GR4" ||
    user._id === process.env.PLATFORM_ACCOUNT_ID
  )
    return true;
  return false;
}

/**
 * Generate Stoat user information as a smaller payload
 * @param user User
 * @returns Stripped User
 */
export function revoltUserInfo(user: RevoltUser): RevoltUserInfo {
  return {
    ...user,
    relations: {
      friends: user.relations?.filter((x) => x.status === "Friend").length || 0,
    },
  };
}

const userCol = createCollectionFn<RevoltUser>("revolt", "users");
const sessionCol = createCollectionFn<{ _id: string; user_id: string; ip?: string; last_seen?: string }>("revolt", "sessions");
const accountCol = createCollectionFn<Document & { _id: string; disabled?: boolean }>(
  "revolt",
  "accounts",
);
const ipBanCol = createCollectionFn<IpBan>("revolt", "ip_bans");
const IP_BAN_FILE =
  process.env.NULLCORD_IP_BAN_FILE ||
  "/mnt/cll-storage/NullCord-legacy/ip-bans.json";

/**
 * Fetch a user by given ID
 * @param id ID
 * @returns User if exists
 */
export function fetchUserById(id: string) {
  return userCol().findOne({ _id: id });
}

/**
 * Ban a user at the platform level.
 *
 * The API guard reads `flags`, `ban_message` and `banned_until`; disabling the
 * account and deleting sessions makes the ban effective immediately for both
 * existing sessions and new logins.
 */
export async function banUser(
  userId: string,
  message: string,
  until: Date | null,
) {
  const existing = await userCol().findOne({ _id: userId });
  const flags = Number((existing as { flags?: number } | null)?.flags ?? 0);
  await userCol().updateOne(
    { _id: userId },
    {
      $set: {
        // Clear suspension, set banned, preserve unrelated flags.
        flags: (flags & ~1) | 4,
        ban_message: message || "Your account has been banned.",
        ...(until ? { banned_until: until.getTime() } : {}),
      },
      ...(until ? {} : { $unset: { banned_until: "" } }),
    } as never,
  );
  await sessionCol().deleteMany({ user_id: userId });
}

/**
 * Remove a platform ban and re-enable login.
 */
export async function unbanUser(userId: string) {
  const existing = await userCol().findOne({ _id: userId });
  const flags = Number((existing as { flags?: number } | null)?.flags ?? 0);
  await userCol().updateOne(
    { _id: userId },
    {
      $set: { flags: flags & ~4 },
      $unset: { ban_message: "", banned_until: "" },
    },
  );
}

/**
 * Suspend user by given ID
 * @param userId User ID
 * @param duration Duration (in days), set to 0 for indefinite
 * @param reasons Reasons
 */
export async function suspendUser(
  userId: string,
  duration: number,
  reasons: string[],
) {
  let user = await callProcedure(Revolt.database_fetch_user, userId);

  await callProcedure(
    Revolt.proc_users_suspend,
    user,
    duration,
    reasons.join("|"),
  );
}

/**
 * Remove a suspension and re-enable the account.
 */
export async function unsuspendUser(userId: string) {
  await userCol().updateOne(
    { _id: userId },
    {
      $set: { flags: 0 },
      $unset: {
        suspended_until: "",
        ban_message: "",
        banned_until: "",
      },
    } as never,
  );
  await accountCol().updateOne(
    { _id: userId },
    { $set: { disabled: false } } as never,
  );
  // Sessions were revoked by the suspension, so delete leftovers as well.
  await sessionCol().deleteMany({ user_id: userId });
}

const USERNAME_RE = /^[\p{L}\d_.-]+(?: [\p{L}\d_.-]+)*$/u;

export async function setUsername(userId: string, username: string) {
  const value = username.trim();
  if (value.length < 2 || value.length > 35)
    throw new Error("Username must be between 2 and 35 characters");
  if (!USERNAME_RE.test(value))
    throw new Error(
      "Username may only contain letters, numbers, spaces, dots, dashes and underscores. Spaces cannot be repeated or at the start/end.",
    );
  await userCol().updateOne(
    { _id: userId },
    { $set: { username: value } } as never,
  );
}

export async function setDisplayName(userId: string, displayName: string) {
  const value = displayName.trim();
  if (value.length > 32) throw new Error("Display name is too long");
  if (/[\u200B\n\r]/.test(value))
    throw new Error("Display name cannot contain newlines or zero-width spaces");
  await userCol().updateOne(
    { _id: userId },
    value
      ? ({ $set: { display_name: value } } as never)
      : ({ $unset: { display_name: "" } } as never),
  );
}

export async function setUserPrivileged(userId: string, privileged: boolean) {
  await userCol().updateOne(
    { _id: userId },
    { $set: { privileged } } as never,
  );
}

export async function forceLogout(userId: string) {
  await sessionCol().deleteMany({ user_id: userId });
}

export async function fetchUserIPs(userId: string): Promise<UserIP[]> {
  const rows = await sessionCol()
    .find(
      { user_id: userId, ip: { $exists: true, $ne: "" } },
      { projection: { ip: 1, last_seen: 1 } },
    )
    .sort({ last_seen: -1 })
    .limit(25)
    .toArray();
  const seen = new Set<string>();
  return rows
    .filter((row): row is typeof row & { ip: string } => Boolean(row.ip))
    .filter((row) => {
      if (seen.has(row.ip)) return false;
      seen.add(row.ip);
      return true;
    })
    .map((row) => ({ ip: row.ip, last_seen: row.last_seen }));
}

export function fetchIpBans() {
  return ipBanCol().find({}).sort({ created_at: -1 }).limit(100).toArray();
}

export async function banIp(
  ip: string,
  message: string,
  reason: string,
  until: Date | null,
  createdBy: string,
) {
  await ipBanCol().updateOne(
    { _id: ip },
    {
      $set: {
        reason,
        message: message || "Your IP address has been banned from NullCord.",
        ...(until ? { expires_at: until.getTime() } : {}),
        created_by: createdBy,
        created_at: Date.now(),
      },
      ...(until ? {} : { $unset: { expires_at: "" } }),
    } as never,
    { upsert: true },
  );
  await sessionCol().deleteMany({ ip });
  const shared = readSharedIpBans();
  shared[ip] = {
    reason,
    message: message || "Your IP address has been banned from NullCord.",
    ...(until ? { expires_at: until.getTime() } : {}),
    created_by: createdBy,
    created_at: Date.now(),
  };
  writeSharedIpBans(shared);
}

export async function unbanIp(ip: string) {
  await ipBanCol().deleteOne({ _id: ip });
  const shared = readSharedIpBans();
  delete shared[ip];
  writeSharedIpBans(shared);
}

function readSharedIpBans(): Record<string, Record<string, unknown>> {
  try {
    return JSON.parse(fs.readFileSync(IP_BAN_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeSharedIpBans(value: Record<string, Record<string, unknown>>) {
  const temporary = `${IP_BAN_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o644,
  });
  fs.renameSync(temporary, IP_BAN_FILE);
}
