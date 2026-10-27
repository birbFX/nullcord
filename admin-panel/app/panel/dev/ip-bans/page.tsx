export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { fetchIpBans } from "@/lib/database/revolt";
import { Heading, Text } from "@radix-ui/themes";
import { Metadata } from "next";

import { DevIpBansTable } from "./DevIpBansTable";

export const metadata: Metadata = {
  title: "IP Bans",
  description: "Manage global NullCord IP bans.",
};

export default async function IpBansPage() {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  const bans = await fetchIpBans();

  return (
    <>
      <PageTitle metadata={metadata} />
      <Heading size="6" mb="1">
        IP bans
      </Heading>
      <Text color="gray" size="2" mb="5" as="p">
        {bans.length} active platform IP bans. Removing a ban also updates the
        shared ip-bans.json file used by the API guard.
      </Text>
      <DevIpBansTable rows={bans} />
    </>
  );
}
