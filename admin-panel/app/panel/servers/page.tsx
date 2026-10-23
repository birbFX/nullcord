export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { col } from "@/lib/db";
import { Badge, Button, Card, Code, Flex, Table, Text, TextField } from "@radix-ui/themes";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Servers",
  description: "Browse platform servers.",
};

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default async function ServersPage({
  searchParams,
}: {
  searchParams:
    | Promise<{ q?: string | string[] }>
    | { q?: string | string[] };
}) {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = (raw ?? "").trim();

  const filter = q ? { $or: [{ name: new RegExp(escapeRegex(q), "i") }, { _id: q }] } : {};
  const servers = await col("servers")
    .find(filter as any)
    .sort({ _id: -1 })
    .limit(50)
    .toArray();

  const ids = servers.map((s) => s._id as never);
  const ownerIds = [...new Set(servers.map((s) => s.owner as string))];
  const owners = await col("users")
    .find({ _id: { $in: ownerIds as never[] } })
    .toArray();
  const ownerNames = new Map(owners.map((u) => [String(u._id), u.username as string]));

  const counts = await col("server_members")
    .aggregate([
      { $match: { "_id.server": { $in: ids } } },
      { $group: { _id: "$_id.server", count: { $sum: 1 } } },
    ])
    .toArray();
  const memberCounts = new Map(counts.map((c) => [String(c._id), c.count as number]));

  return (
    <>
      <PageTitle metadata={metadata} />
      <Flex justify="between" align="center" mb="4">
        <Text size="5" weight="bold">
          Servers
        </Text>
        <form action="/panel/servers">
          <Flex gap="2">
            <TextField.Root
              name="q"
              placeholder="Server name or ID"
              defaultValue={q}
              size="2"
            />
            <Button type="submit" variant="soft">
              Search
            </Button>
          </Flex>
        </form>
      </Flex>

      <Card>
        <Table.Root size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Server</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Owner</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Members</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Channels</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Flags</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {servers.map((server) => (
              <Table.Row key={String(server._id)}>
                <Table.Cell>
                  <Link href={`/panel/revolt/inspect/server/${server._id}`}>
                    {server.name as string}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <Code size="1">{String(server._id)}</Code>
                </Table.Cell>
                <Table.Cell>
                  <Link href={`/panel/revolt/inspect/user/${server.owner}`}>
                    {ownerNames.get(server.owner as string) ?? (server.owner as string)}
                  </Link>
                </Table.Cell>
                <Table.Cell>{memberCounts.get(String(server._id)) ?? 0}</Table.Cell>
                <Table.Cell>
                  {Array.isArray(server.channels) ? server.channels.length : 0}
                </Table.Cell>
                <Table.Cell>
                  <Flex gap="1">
                    {server.discoverable ? <Badge color="green">discoverable</Badge> : null}
                    {server.analytics ? <Badge color="gray">analytics</Badge> : null}
                  </Flex>
                </Table.Cell>
              </Table.Row>
            ))}
            {servers.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={6}>
                  <Text color="gray">No servers match that query.</Text>
                </Table.Cell>
              </Table.Row>
            ) : null}
          </Table.Body>
        </Table.Root>
      </Card>
    </>
  );
}
