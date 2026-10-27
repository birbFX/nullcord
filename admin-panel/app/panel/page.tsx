export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { col } from "@/lib/db";
import { Card, Flex, Grid, Heading, Link as RadixLink, Text } from "@radix-ui/themes";
import { Metadata } from "next";
import Link from "next/link";

import pkg from "../../package.json";

export const metadata: Metadata = {
  title: "NullCord Admin",
  description: "Administer the NullCord instance.",
};

export default async function Home() {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  const [users, servers, channels, messages] = await Promise.all([
    col("users").countDocuments(),
    col("servers").countDocuments(),
    col("channels").countDocuments(),
    col("messages").countDocuments(),
  ]);

  const stats = [
    { label: "Users", value: users, href: "/panel/users" },
    { label: "Servers", value: servers, href: "/panel/servers" },
    { label: "Channels", value: channels, href: "/panel/servers" },
    { label: "Messages", value: messages, href: "/panel/messages" },
  ];

  return (
    <>
      <PageTitle metadata={metadata} />
      <Heading size="6" mb="1">
        Instance overview
      </Heading>
      <Text color="gray" size="2" mb="5" as="p">
        Live counts from the NullCord database.
      </Text>

      <Grid columns={{ initial: "2", sm: "4" }} gap="3" mb="6">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">
                {stat.label}
              </Text>
              <Text size="7" weight="bold">
                {stat.value.toLocaleString()}
              </Text>
              <Link href={stat.href}>
                <Text size="1">Browse →</Text>
              </Link>
            </Flex>
          </Card>
        ))}
      </Grid>

      <Heading size="4" mb="2">
        Tools
      </Heading>
      <Flex direction="column" gap="2">
        <Link href="/panel/revolt/inspect">
          <Text>Search &amp; inspect by ID (users, messages, channels, servers)</Text>
        </Link>
        <Link href="/panel/users">
          <Text>User search</Text>
        </Link>
        <Link href="/panel/servers">
          <Text>Server browser</Text>
        </Link>
        <Link href="/panel/messages">
          <Text>Recent messages</Text>
        </Link>
        <Link href="/panel/announcements">
          <Text>Broadcast an announcement to every account</Text>
        </Link>
        <Link href="/panel/dev">
          <Text>Developer tools and service health</Text>
        </Link>
      </Flex>

      <Text as="p" size="1" color="gray" mt="6">
        NullCord Admin {pkg.version} ·{" "}
        <RadixLink href="https://github.com/birbFX/nullcord" target="_blank">
          Source code
        </RadixLink>
      </Text>
    </>
  );
}
