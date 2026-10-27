export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { Badge, Card, Code, Flex, Heading, Text } from "@radix-ui/themes";
import { Metadata } from "next";
import fs from "node:fs";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Service Logs",
  description: "Tail NullCord service logs.",
};

const ROOT = "/mnt/cll-storage/NullCord-legacy";
const LOGS: Record<string, { label: string; path: string }> = {
  delta: { label: "API (delta)", path: `${ROOT}/stoat-backend/logs/revolt-delta.log` },
  bonfire: { label: "Gateway (bonfire)", path: `${ROOT}/stoat-backend/logs/revolt-bonfire.log` },
  autumn: { label: "Files (autumn)", path: `${ROOT}/stoat-backend/logs/revolt-autumn.log` },
  january: { label: "Media (january)", path: `${ROOT}/stoat-backend/logs/revolt-january.log` },
  crond: { label: "Cron (crond)", path: `${ROOT}/stoat-backend/logs/revolt-crond.log` },
  pushd: { label: "Push (pushd)", path: `${ROOT}/stoat-backend/logs/revolt-pushd.log` },
  gifbox: { label: "GIF (gifbox)", path: `${ROOT}/stoat-backend/logs/revolt-gifbox.log` },
  voice: {
    label: "Voice (ingress)",
    path: `${ROOT}/stoat-backend/logs/revolt-voice-ingress.log`,
  },
  bot: { label: "Bot", path: `${ROOT}/bot/data/bot.log` },
  admin: { label: "Admin panel", path: `${ROOT}/admin-panel/.run/admin.log` },
  webui: { label: "Open WebUI", path: "/mnt/cll-storage/open-webui/backend/cll-ai.log" },
};

function tail(file: string, lines = 250) {
  try {
    const contents = fs.readFileSync(file, "utf8");
    return contents.split(/\r?\n/).slice(-lines).join("\n");
  } catch (error) {
    return error instanceof Error ? error.message : `Could not read ${file}`;
  }
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: { file?: string | string[] } | Promise<{ file?: string | string[] }>;
}) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);
  const params = await searchParams;
  const raw = Array.isArray(params.file) ? params.file[0] : params.file;
  const key = raw && LOGS[raw] ? raw : "delta";
  const selected = LOGS[key];
  const contents = tail(selected.path);

  return (
    <>
      <PageTitle metadata={metadata} />
      <Flex justify="between" align="center" mb="2" wrap="wrap" gap="2">
        <Heading size="6">Service logs</Heading>
        <Link href={`/panel/dev/logs?file=${key}`}>
          <Text size="2">Refresh</Text>
        </Link>
      </Flex>
      <Text color="gray" size="2" mb="4" as="p">
        Showing the last 250 lines. Files are read from a fixed allowlist.
      </Text>

      <Flex gap="2" wrap="wrap" mb="4">
        {Object.entries(LOGS).map(([logKey, log]) => (
          <Link key={logKey} href={`/panel/dev/logs?file=${logKey}`}>
            <Badge color={logKey === key ? "blue" : "gray"}>{log.label}</Badge>
          </Link>
        ))}
      </Flex>

      <Card>
        <Flex direction="column" gap="2">
          <Flex justify="between" align="center" gap="2">
            <Text weight="bold">{selected.label}</Text>
            <Code size="1">{selected.path}</Code>
          </Flex>
          <pre
            style={{
              margin: 0,
              maxHeight: "70vh",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {contents}
          </pre>
        </Flex>
      </Card>
    </>
  );
}
