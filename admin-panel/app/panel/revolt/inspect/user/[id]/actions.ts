"use server";

import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { createChangelog, sendPlatformAlert } from "@/lib/core";
import {
  banIp,
  banUser,
  cancelAccountDeletion,
  clearAccountRecoveryCodes,
  disableAccountMfa,
  resetAccountLockout,
  scheduleAccountDeletion,
  setAccountDisabled,
  setAccountEmail,
  setBotVerified,
  setDisplayName,
  setUserPrivileged,
  setUsername,
  suspendUser,
  unsuspendUser,
  forceLogout,
  unbanIp,
  unbanUser,
  verifyAccountEmail,
} from "@/lib/database/revolt";
import { findCaseById } from "@/lib/database/revolt/safety_cases";
import { createStrike } from "@/lib/database/revolt/safety_strikes";
import { col } from "@/lib/db";

export async function strikeUser(
  userId: string,
  type: "strike" | "suspension" | "ban",
  reason: string[],
  context: string,
  caseId: string | undefined,
  duration: "7" | "14" | "indefinite",
  banMessage = "",
  banDuration: "permanent" | "7" | "14" | "30" | "custom" = "permanent",
  customBanValue = "1",
  customBanUnit: "minutes" | "hours" | "days" | "weeks" | "months" = "days",
) {
  const userEmail = await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  if (caseId && !(await findCaseById(caseId))) throw "Case doesn't exist?";

  const unitMs: Record<typeof customBanUnit, number> = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000,
  };
  const customBanMs =
    Math.max(1, Number(customBanValue) || 1) * unitMs[customBanUnit];
  const banUntil =
    type === "ban" && banDuration !== "permanent"
      ? new Date(
          Date.now() +
            (banDuration === "custom"
              ? customBanMs
              : Number(banDuration) * 24 * 60 * 60 * 1000),
        )
      : null;
  const strike = await createStrike(
    userId,
    reason.join(", ") +
      (type === "suspension"
        ? ` (${duration === "indefinite" ? duration : `${duration} day`})`
        : "") +
      (type === "ban" && banUntil
        ? ` (until ${banUntil.toISOString()})`
        : type === "ban"
          ? " (permanent)"
          : "") +
      (context ? ` - ${context}` : ""),
    type,
    caseId,
    type === "ban"
      ? { ban_message: banMessage, banned_until: banUntil }
      : {},
  );

  const changelog = await createChangelog(userEmail, {
    object: {
      type: "User",
      id: userId,
    },
    ...(type === "strike"
      ? {
          type: "user/strike",
          id: strike._id,
          reason,
        }
      : type === "suspension"
        ? {
            type: "user/suspend",
            id: strike._id,
            duration,
            reason,
          }
        : {
            type: "user/ban",
            id: strike._id,
            reason,
          }),
  });

  if (type === "suspension") {
    await suspendUser(
      userId,
      duration === "indefinite" ? 0 : parseInt(duration),
      reason,
    );
  }

  if (type === "ban") {
    await banUser(
      userId,
      banMessage || "Your account has been banned from NullCord.",
      banUntil,
    );
  }

  if (type !== "ban") {
    await sendPlatformAlert(
      userId,
      [
        type === "suspension"
          ? "Your account has been suspended, for one or more reasons:"
          : "You have received an account strike, for one or more reasons:",
        ...reason.map((r) => `- ${r}`),
        "",
        type === "suspension"
          ? "Further violations may result in a permanent ban depending on severity, please abide by the [Acceptable Usage Policy](https://stoat.chat/aup)."
          : "Further violations will result in suspension or a permanent ban depending on severity, please abide by the [Acceptable Usage Policy](https://stoat.chat/aup).",
        ...(caseId
          ? ["", `Case ID for your reference: **${caseId.substring(18)}**`]
          : ""),
        "If you have further questions about this strike, please contact abuse@revolt.chat",
      ].join("\n"),
    );
  }

  return { changelog, strike };
}


export async function unbanUserAction(userId: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await unbanUser(userId);
}

export async function unsuspendUserAction(userId: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await unsuspendUser(userId);
}

export async function setUsernameAction(userId: string, username: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await setUsername(userId, username);
}

export async function setDisplayNameAction(userId: string, displayName: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await setDisplayName(userId, displayName);
}

export async function setUserPrivilegedAction(
  userId: string,
  privileged: boolean,
) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await setUserPrivileged(userId, privileged);
}

export async function forceLogoutAction(userId: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await forceLogout(userId);
}

export async function banIpAction(
  ip: string,
  message: string,
  reason: string,
  durationSeconds: number | null,
) {
  const moderator = await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  const { isIP } = await import("node:net");
  if (!isIP(ip)) throw new Error("Invalid IP address");
  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds < 60))
    throw new Error("Ban duration must be at least one minute");
  const until =
    durationSeconds === null
      ? null
      : new Date(Date.now() + durationSeconds * 1000);
  await banIp(ip, message, reason, until, moderator);
}

export async function unbanIpAction(ip: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await unbanIp(ip);
}


export async function setBotVerifiedAction(botId: string, verified: boolean) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await setBotVerified(botId, verified);
  return { botId, verified };
}


export async function setAccountDisabledAction(userId: string, disabled: boolean) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await setAccountDisabled(userId, disabled);
}

export async function resetAccountLockoutAction(userId: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await resetAccountLockout(userId);
}

export async function setAccountEmailAction(userId: string, email: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    throw new Error("Enter a valid email address");
  await setAccountEmail(userId, trimmed);
}

export async function verifyAccountEmailAction(userId: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await verifyAccountEmail(userId);
}

export async function disableAccountMfaAction(userId: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await disableAccountMfa(userId);
}

export async function clearAccountRecoveryCodesAction(userId: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await clearAccountRecoveryCodes(userId);
}

export async function scheduleAccountDeletionAction(userId: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await scheduleAccountDeletion(userId);
}

export async function cancelAccountDeletionAction(userId: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  await cancelAccountDeletion(userId);
}

export async function sendAlertAction(userId: string, content: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  const message = content.trim();
  if (!message) throw new Error("Alert message cannot be empty");
  if (message.length > 2000) throw new Error("Alert message must be 2000 characters or fewer");
  if (!process.env.PLATFORM_ACCOUNT_ID)
    throw new Error("PLATFORM_ACCOUNT_ID is not configured");
  await sendPlatformAlert(userId, message);
}

export type ClearProfileField =
  | "avatar"
  | "banner"
  | "display_name"
  | "bio"
  | "status"
  | "all";

export async function clearProfileAction(
  userId: string,
  field: ClearProfileField,
) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  const unset: Record<string, string> = {};
  const add = (key: string) => {
    unset[key] = "";
  };

  if (field === "avatar" || field === "all") add("avatar");
  if (field === "banner" || field === "all") add("profile.background");
  if (field === "display_name" || field === "all") add("display_name");
  if (field === "bio" || field === "all") add("profile.content");
  if (field === "status" || field === "all") add("status");

  if (!Object.keys(unset).length) return;
  await col("users").updateOne(
    { _id: userId as never },
    { $unset: unset } as never,
  );
}

/**
 * Build a portable JSON export for a user. This includes account metadata,
 * memberships and their 500 most recent messages; it deliberately excludes
 * secrets such as password hashes and session tokens.
 */
export async function exportUserAction(userId: string) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  const [user, account, memberships, messages] = await Promise.all([
    col("users").findOne({ _id: userId as never }),
    col("accounts").findOne({ _id: userId as never }),
    col("server_members")
      .find({ "_id.user": userId })
      .limit(500)
      .toArray(),
    col("messages")
      .find({ author: userId })
      .sort({ _id: -1 })
      .limit(500)
      .toArray(),
  ]);

  if (!user && !account) throw new Error("User not found");

  const safeAccount = account
    ? {
        _id: account._id,
        email: account.email,
        disabled: account.disabled,
        verification: account.verification,
        deletion: account.deletion,
      }
    : null;

  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      user,
      account: safeAccount,
      memberships,
      messages,
    },
    null,
    2,
  );
}
