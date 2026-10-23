export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { col } from "@/lib/db";
import { Badge, Button, Card, Code, Flex, Table, Text, TextField } from "@radix-ui/themes";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Users",
  description: "Search platform users.",
};

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default async function UsersPage({
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
    ? {
        $or: [
          { username: new RegExp(escapeRegex(q), "i") },
          { _id: q },
        ],
      }
    : {};

  const users = await col("users")
    .find(filter as any)
    .sort({ _id: -1 })
    .limit(50)
    .toArray();

  const accounts = await col("accounts")
    .find({ _id: { $in: users.map((u) => u._id as never) } })
    .toArray();
  const emails = new Map(accounts.map((a) => [String(a._id), a.email]));

  return (
    <>
      <PageTitle metadata={metadata} />
      <Flex justify="between" align="center" mb="4">
        <Text size="5" weight="bold">
          Users
        </Text>
        <form action="/panel/users">
          <Flex gap="2">
            <TextField.Root
              name="q"
              placeholder="Username or user ID"
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
              <Table.ColumnHeaderCell>User</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Flags</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {users.map((user) => (
              <Table.Row key={String(user._id)}>
                <Table.Cell>
                  <Link href={`/panel/revolt/inspect/user/${user._id}`}>
                    {user.username as string}#{user.discriminator as string}
                  </Link>
                  {user.display_name ? (
                    <Text as="span" color="gray" size="1">
                      {" "}
                      ({user.display_name as string})
                    </Text>
                  ) : null}
                </Table.Cell>
                <Table.Cell>
                  <Code size="1">{String(user._id)}</Code>
                </Table.Cell>
                <Table.Cell>
                  <Text size="1" color="gray">
                    {emails.get(String(user._id)) ?? "—"}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Flex gap="1">
                    {user.privileged ? <Badge color="ruby">admin</Badge> : null}
                    {user.bot ? <Badge color="indigo">bot</Badge> : null}
                    {user.disabled ? <Badge color="gray">disabled</Badge> : null}
                  </Flex>
                </Table.Cell>
              </Table.Row>
            ))}
            {users.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={4}>
                  <Text color="gray">No users match that query.</Text>
                </Table.Cell>
              </Table.Row>
            ) : null}
          </Table.Body>
        </Table.Root>
      </Card>
    </>
  );
}
