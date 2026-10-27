"use server";

import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { sendPlatformAlert } from "@/lib/core";
import { col } from "@/lib/db";

export type BroadcastResult = {
  sent: number;
  failed: number;
  skipped: number;
};

/**
 * Send a platform announcement to every active, non-bot account.
 *
 * The panel already writes directly to MongoDB; this reuses the same
 * platform-account DM path as individual alerts so announcements show up in
 * the normal client inbox.
 */
export async function broadcastAnnouncement(
  message: string,
  confirmed: boolean,
): Promise<BroadcastResult> {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  if (!confirmed)
    throw new Error("Tick the confirmation box before broadcasting");
  if (!process.env.PLATFORM_ACCOUNT_ID)
    throw new Error("PLATFORM_ACCOUNT_ID is not configured");

  const content = message.trim();
  if (!content) throw new Error("Announcement cannot be empty");
  if (content.length > 2000)
    throw new Error("Announcement must be 2000 characters or fewer");

  const users = await col<{ _id: string; bot?: unknown; disabled?: boolean }>(
    "users",
  )
    .find({
      bot: { $exists: false },
      disabled: { $ne: true },
    })
    .limit(5000)
    .toArray();

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await sendPlatformAlert(String(user._id), content);
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { sent, failed, skipped: 0 };
}
