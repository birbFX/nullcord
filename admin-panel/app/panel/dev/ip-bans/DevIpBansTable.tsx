"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Badge, Button, Card, Code, Flex, Table, Text } from "@radix-ui/themes";

import type { IpBan } from "@/lib/database/revolt/users";
import { unbanIpAction } from "@/app/panel/revolt/inspect/user/[id]/actions";

export function DevIpBansTable({ rows }: { rows: IpBan[] }) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: (ip: string) => unbanIpAction(ip),
    onSuccess: () => router.refresh(),
  });

  return (
    <Card>
      <Table.Root size="1">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>IP</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Reason</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Expires</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">Action</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((ban) => (
            <Table.Row key={ban._id}>
              <Table.Cell>
                <Code>{ban._id}</Code>
              </Table.Cell>
              <Table.Cell>
                <Flex direction="column" gap="1">
                  <Text size="1">{ban.reason || "No reason recorded"}</Text>
                  {ban.message ? (
                    <Text size="1" color="gray">
                      {ban.message}
                    </Text>
                  ) : null}
                </Flex>
              </Table.Cell>
              <Table.Cell>
                {ban.expires_at ? (
                  <Badge color="orange">
                    {new Date(ban.expires_at).toLocaleString()}
                  </Badge>
                ) : (
                  <Badge color="red">Permanent</Badge>
                )}
              </Table.Cell>
              <Table.Cell align="right">
                <Button
                  size="1"
                  color="green"
                  variant="soft"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(ban._id)}
                >
                  Unban IP
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
          {rows.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={4}>
                <Text color="gray">No IP bans.</Text>
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
