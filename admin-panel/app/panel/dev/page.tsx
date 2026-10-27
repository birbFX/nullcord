export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { col, db } from "@/lib/db";
import { Badge, Card, Code, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import { Metadata } from "next";
import net from "node:net";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Developer Overview",
  description: "Service health and instance diagnostics.",
};

type Check = { name: string; ok: boolean; detail: string };

async function httpCheck(name: string, url: string): Promise<Check> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    let extra = "";
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      try {
        const data = (await response.json()) as Record<string, unknown>;
        if (typeof data.stoat === "string") extra = ` · Stoat ${data.stoat}`;
        else if (typeof data.revolt === "string") extra = ` · Revolt ${data.revolt}`;
      } catch {
        // ignore malformed health payloads
      }
    }
    return { name, ok: response.ok, detail: `HTTP ${response.status}${extra}` };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }
}

function tcpCheck(name: string, host: string, port: number): Promise<Check> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (ok: boolean, detail: string) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ name, ok, detail });
    };
    socket.setTimeout(1500);
    socket.once("connect", () => finish(true, `TCP ${host}:${port}`));
    socket.once("timeout", () => finish(false, `Timed out connecting to ${host}:${port}`));
    socket.once("error", (error) =>
      finish(false, error.message || `Could not connect to ${host}:${port}`),
    );
  });
}

export default async function DeveloperOverview() {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  const apiUrl = process.env.NULLCORD_API_URL || "http://127.0.0.1:14702";
  const [
    api,
    webui,
    loader,
    searxng,
    mongo,
    redis,
    rabbit,
    gateway,
    livekit,
    livekitTcp,
    voiceIngress,
  ] = await Promise.all([
    httpCheck("NullCord API", apiUrl),
    httpCheck("Open WebUI", "http://127.0.0.1:8080/"),
    httpCheck("Web loader", "http://127.0.0.1:8091/health"),
    httpCheck("SearXNG", "http://127.0.0.1:8888/"),
    db()
      .command({ ping: 1 })
      .then(() => ({ name: "MongoDB", ok: true, detail: "Ping succeeded" }))
      .catch((error) => ({
        name: "MongoDB",
        ok: false,
        detail: error instanceof Error ? error.message : "Ping failed",
      })),
    tcpCheck("Redis", "127.0.0.1", 6379),
    tcpCheck("RabbitMQ", "127.0.0.1", 5672),
    tcpCheck("Gateway", "127.0.0.1", 14703),
    httpCheck("LiveKit voice", "http://127.0.0.1:7880/"),
    tcpCheck("LiveKit RTC/TCP", "127.0.0.1", 7881),
    tcpCheck("Voice webhook", "127.0.0.1", 8500),
  ]);

  const checks = [
    api,
    gateway,
    mongo,
    redis,
    rabbit,
    livekit,
    livekitTcp,
    voiceIngress,
    webui,
    loader,
    searxng,
  ];

  const [users, servers, channels, messages, bots, ipBans, accounts] =
    await Promise.all([
      col("users").estimatedDocumentCount(),
      col("servers").estimatedDocumentCount(),
      col("channels").estimatedDocumentCount(),
      col("messages").estimatedDocumentCount(),
      col("bots").estimatedDocumentCount(),
      col("ip_bans").countDocuments({}),
      col("accounts").countDocuments({ "deletion.status": "Scheduled" }),
    ]);

  const counts = [
    { label: "Users", value: users, href: "/panel/users" },
    { label: "Servers", value: servers, href: "/panel/servers" },
    { label: "Channels", value: channels, href: "/panel/servers" },
    { label: "Messages", value: messages, href: "/panel/messages" },
    { label: "Bots", value: bots, href: "/panel/dev/bots" },
    { label: "IP bans", value: ipBans, href: "/panel/dev/ip-bans" },
    { label: "Deletion queue", value: accounts, href: "/panel/dev/database" },
  ];

  return (
    <>
      <PageTitle metadata={metadata} />
      <Heading size="6" mb="1">
        Developer overview
      </Heading>
      <Text color="gray" size="2" mb="5" as="p">
        Live service probes and database diagnostics for this NullCord instance.
      </Text>

      <Heading size="4" mb="2">
        Services
      </Heading>
      <Grid columns={{ initial: "1", sm: "2", lg: "4" }} gap="3" mb="6">
        {checks.map((check) => (
          <Card key={check.name}>
            <Flex direction="column" gap="1">
              <Flex justify="between" align="center" gap="2">
                <Text weight="bold">{check.name}</Text>
                <Badge color={check.ok ? "green" : "red"}>
                  {check.ok ? "Healthy" : "Down"}
                </Badge>
              </Flex>
              <Text size="1" color="gray">
                {check.detail}
              </Text>
            </Flex>
          </Card>
        ))}
      </Grid>

      <Heading size="4" mb="2">
        Instance data
      </Heading>
      <Grid columns={{ initial: "2", sm: "4", lg: "7" }} gap="3" mb="6">
        {counts.map((count) => (
          <Card key={count.label}>
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">
                {count.label}
              </Text>
              <Text size="6" weight="bold">
                {count.value.toLocaleString()}
              </Text>
              <Link href={count.href}>
                <Text size="1">Open →</Text>
              </Link>
            </Flex>
          </Card>
        ))}
      </Grid>

      <Heading size="4" mb="2">
        Developer tools
      </Heading>
      <Flex direction="column" gap="2">
        <Link href="/panel/dev/database">
          <Text>Database collections and document counts</Text>
        </Link>
        <Link href="/panel/dev/bots">
          <Text>All bots, owners, and verification state</Text>
        </Link>
        <Link href="/panel/dev/ip-bans">
          <Text>Global IP ban list</Text>
        </Link>
        <Link href="/panel/dev/logs">
          <Text>Tail NullCord service logs</Text>
        </Link>
      </Flex>

      <Text as="p" size="1" color="gray" mt="6">
        API: <Code>{apiUrl}</Code> · Gateway: <Code>127.0.0.1:14703</Code> ·
        LiveKit: <Code>127.0.0.1:7880</Code> (RTC TCP{" "}
        <Code>7881</Code>, UDP <Code>50000-50015</Code>) · Voice webhook:{" "}
        <Code>127.0.0.1:8500</Code>
      </Text>
    </>
  );
}
