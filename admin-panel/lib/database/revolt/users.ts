import Revolt from "revolt-nodejs-bindings";
import { API } from "revolt.js";

import { callProcedure, createCollectionFn } from "..";

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
const sessionCol = createCollectionFn<{ _id: string; user_id: string }>("revolt", "sessions");

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
  await userCol().updateOne(
    { _id: userId },
    {
      $set: {
        flags: 4,
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
  await userCol().updateOne(
    { _id: userId },
    { $set: { flags: 0 }, $unset: { ban_message: "", banned_until: "" } },
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
