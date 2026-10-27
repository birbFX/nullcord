export const dynamic = "force-dynamic";

import { PageTitle } from "@/components/common/navigation/PageTitle";
import { getScopedUser } from "@/lib/auth";
import { RBAC_PERMISSION_MODERATION_AGENT } from "@/lib/auth/rbacInternal";
import { db } from "@/lib/db";
import { Card, Code, Heading, Table, Text } from "@radix-ui/themes";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Database",
  description: "Inspect NullCord database collections.",
};

export default async function DatabasePage() {
  await getScopedUser(RBAC_PERMISSION_MODERATION_AGENT);

  const collections = await db().listCollections().toArray();
  const rows = await Promise.all(
    collections
      .filter((collection) => !collection.name.startsWith("system."))
      .map(async (collection) => ({
        name: collection.name,
        count: await db()
          .collection(collection.name)
          .estimatedDocumentCount()
          .catch(() => 0),
      })),
  );
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <PageTitle metadata={metadata} />
      <Heading size="6" mb="1">
        Database
      </Heading>
      <Text color="gray" size="2" mb="5" as="p">
        {rows.length} collections · {total.toLocaleString()} estimated documents
        in <Code>revolt</Code>.
      </Text>

      <Card>
        <Table.Root size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Collection</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Documents</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Tools</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.name}>
                <Table.Cell>
                  <Code>{row.name}</Code>
                </Table.Cell>
                <Table.Cell>{row.count.toLocaleString()}</Table.Cell>
                <Table.Cell>
                  {row.name === "users" ? (
                    <Link href="/panel/users">Browse users</Link>
                  ) : row.name === "servers" ? (
                    <Link href="/panel/servers">Browse servers</Link>
                  ) : row.name === "messages" ? (
                    <Link href="/panel/messages">Browse messages</Link>
                  ) : row.name === "bots" ? (
                    <Link href="/panel/dev/bots">Browse bots</Link>
                  ) : row.name === "ip_bans" ? (
                    <Link href="/panel/dev/ip-bans">Browse IP bans</Link>
                  ) : (
                    <Text size="1" color="gray">
                      —
                    </Text>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card>
    </>
  );
}
