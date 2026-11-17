"use server";

import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { createOrFindDM } from "@/lib/core";
import { col } from "@/lib/db";

/**
 * Resolve the Revolt user id of the signed-in admin from their account email
 */
async function currentAdminId() {
  const email = await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  const account = await col<{ _id: string; email: string }>("accounts").findOne({
    email,
  });
  if (!account) throw new Error("No NullCord account matches your admin login");
  return String(account._id);
}

/**
 * Open (or create) a DM between the admin and any user, friends or not
 */
export async function openDmAction(targetId: string): Promise<string> {
  const adminId = await currentAdminId();
  if (adminId === targetId) throw new Error("That is your own account");
  const dm = await createOrFindDM(adminId, targetId);
  return String(dm._id);
}

/**
 * Add the admin to a server as a member for moderation
 */
export async function joinServerAction(serverId: string): Promise<void> {
  const adminId = await currentAdminId();
  const id = serverId.trim();
  const server = await col("servers").findOne({ _id: id as never });
  if (!server) throw new Error("Server not found");

  await col("server_members").updateOne(
    { _id: { server: id, user: adminId } } as never,
    {
      $setOnInsert: {
        _id: { server: id, user: adminId },
        joined_at: new Date(),
      },
    } as never,
    { upsert: true },
  );
}
