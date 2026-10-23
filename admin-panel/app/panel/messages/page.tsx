export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { col } from "@/lib/db";
import { Button, Card, Code, Flex, Table, Text, TextField } from "@radix-ui/themes";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Messages",
  description: "Recent platform messages.",
};

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default async function MessagesPage({
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

  const filter = q
    ? { $or: [{ content: new RegExp(escapeRegex(q), "i") }, { _id: q }] }
    : {};

  const messages = await col("messages")
    .find(filter as any)
    .sort({ _id: -1 })
    .limit(50)
    .toArray();

  const authorIds = [...new Set(messages.map((m) => m.author as string))];
  const channelIds = [...new Set(messages.map((m) => m.channel as string))];

  const [authors, channels] = await Promise.all([
    col("users").find({ _id: { $in: authorIds as never[] } }).toArray(),
    col("channels").find({ _id: { $in: channelIds as never[] } }).toArray(),
  ]);

  const authorNames = new Map(authors.map((u) => [String(u._id), u.username as string]));
  const channelNames = new Map(channels.map((c) => [String(c._id), c.name as string]));

  return (
    <>
      <PageTitle metadata={metadata} />
      <Flex justify="between" align="center" mb="4">
        <Text size="5" weight="bold">
          Messages
        </Text>
        <form action="/panel/messages">
          <Flex gap="2">
            <TextField.Root
              name="q"
              placeholder="Content or message ID"
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
              <Table.ColumnHeaderCell>Message</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Author</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Channel</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {messages.map((message) => (
              <Table.Row key={String(message._id)}>
                <Table.Cell>
                  <Link href={`/panel/revolt/inspect/message/${message._id}`}>
                    <Text size="1">
                      {String(message.content ?? "").slice(0, 90) || "(no content)"}
                    </Text>
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <Link href={`/panel/revolt/inspect/user/${message.author}`}>
                    {authorNames.get(message.author as string) ?? (message.author as string)}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <Text size="1" color="gray">
                    #{channelNames.get(message.channel as string) ?? (message.channel as string)}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Code size="1">{String(message._id)}</Code>
                </Table.Cell>
              </Table.Row>
            ))}
            {messages.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={4}>
                  <Text color="gray">No messages match that query.</Text>
                </Table.Cell>
              </Table.Row>
            ) : null}
          </Table.Body>
        </Table.Root>
      </Card>
    </>
  );
}
