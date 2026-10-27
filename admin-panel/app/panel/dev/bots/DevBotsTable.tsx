"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge, Button, Card, Code, Flex, Table, Text } from "@radix-ui/themes";

import { setBotVerifiedAction } from "@/app/panel/revolt/inspect/user/[id]/actions";

export type DevBotRow = {
  id: string;
  username: string;
  discriminator: string;
  displayName: string;
  ownerId: string;
  ownerName: string;
  verified: boolean;
};

export function DevBotsTable({ rows }: { rows: DevBotRow[] }) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      setBotVerifiedAction(id, verified),
    onSuccess: () => router.refresh(),
  });

  return (
    <Card>
      <Table.Root size="1">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Bot</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Owner</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">Action</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.id}>
              <Table.Cell>
                <Flex direction="column" gap="1">
                  <Text weight="bold">
                    {row.displayName || row.username}
                    {row.verified ? " ✔" : ""}
                  </Text>
                  <Text size="1" color="gray">
                    {row.username}#{row.discriminator} · <Code>{row.id}</Code>
                  </Text>
                </Flex>
              </Table.Cell>
              <Table.Cell>
                <Link href={`/panel/revolt/inspect/user/${row.ownerId}`}>
                  {row.ownerName}
                </Link>
              </Table.Cell>
              <Table.Cell>
                <Badge color={row.verified ? "green" : "gray"}>
                  {row.verified ? "Verified" : "Unverified"}
                </Badge>
              </Table.Cell>
              <Table.Cell align="right">
                <Button
                  size="1"
                  variant={row.verified ? "soft" : "solid"}
                  color={row.verified ? "gray" : "green"}
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ id: row.id, verified: !row.verified })
                  }
                >
                  {row.verified ? "Remove verification" : "Verify app"}
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
          {rows.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={4}>
                <Text color="gray">No bots registered.</Text>
              </Table.Cell>
            </Table.Row>
          ) : null}
        </Table.Body>
      </Table.Root>
      {mutation.error ? (
        <Text color="red" size="1" mt="2" as="p">
          {mutation.error instanceof Error
            ? mutation.error.message
            : String(mutation.error)}
        </Text>
      ) : null}
    </Card>
  );
}
