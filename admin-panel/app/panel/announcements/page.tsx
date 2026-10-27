export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { Card, Code, Heading, Text } from "@radix-ui/themes";
import { Metadata } from "next";

import { AnnouncementForm } from "./AnnouncementForm";

export const metadata: Metadata = {
  title: "Announcements",
  description: "Broadcast a platform announcement.",
};

export default async function AnnouncementsPage() {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  return (
    <>
      <PageTitle metadata={metadata} />
      <Heading size="6" mb="1">
        Announcements
      </Heading>
      <Text color="gray" size="2" mb="5" as="p">
        Send a direct message from the platform account to every active,
        non-bot account. Messages are stored in the normal DM channel, so users
        can reply and see them on every client. The platform account is{" "}
        <Code>{process.env.PLATFORM_ACCOUNT_ID ?? "not configured"}</Code>.
      </Text>

      <Card>
        <AnnouncementForm />
      </Card>
    </>
  );
}
