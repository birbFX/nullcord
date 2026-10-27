export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { col } from "@/lib/db";
import { Heading, Text } from "@radix-ui/themes";
import { Metadata } from "next";
import Link from "next/link";

import { DevBotsTable } from "./DevBotsTable";

export const metadata: Metadata = {
  title: "Bot Management",
  description: "Manage bot verification across the instance.",
};

export default async function DevBotsPage() {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  const bots = await col("bots").find({}).sort({ _id: 1 }).toArray();
  const owners = [...new Set(bots.map((bot) => String(bot.owner)))];
  const [users, ownerUsers] = await Promise.all([
    col("users")
      .find({ _id: { $in: bots.map((bot) => bot._id) as never[] } })
      .toArray(),
    col("users")
      .find({ _id: { $in: owners as never[] } })
      .toArray(),
  ]);
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const ownerMap = new Map(ownerUsers.map((user) => [String(user._id), user]));

  const rows = bots.map((bot) => {
    const user = userMap.get(String(bot._id));
    const owner = ownerMap.get(String(bot.owner));
    const flags = Number(bot.flags ?? 0);
    return {
      id: String(bot._id),
      username: String(user?.username ?? "unknown"),
      discriminator: String(user?.discriminator ?? "0000"),
      displayName: user?.display_name ? String(user.display_name) : "",
      ownerId: String(bot.owner),
      ownerName: owner
        ? `${String(owner.username)}#${String(owner.discriminator)}`
        : String(bot.owner),
      verified: (flags & 1) !== 0,
    };
  });

  return (
    <>
      <PageTitle metadata={metadata} />
      <Heading size="6" mb="1">
        Bot management
      </Heading>
      <Text color="gray" size="2" mb="5" as="p">
        {rows.length} registered bots. Verification sets the app checkmark in
        the NullCord client. Open an owner from the table to inspect their
        account.
      </Text>
      <DevBotsTable rows={rows} />
      <Text size="1" color="gray" mt="4" as="p">
        Need a specific owner? Use the <Link href="/panel/users">user search</Link>.
      </Text>
    </>
  );
}
