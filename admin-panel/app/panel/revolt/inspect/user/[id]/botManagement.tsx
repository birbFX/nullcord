"use client";

import { Badge, Button, Flex, Table, Text } from "@radix-ui/themes";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import type { BotWithUser } from "@/lib/database/revolt/bots";
import { setBotVerifiedAction } from "./actions";

export function BotManagement({ bots }: { bots: BotWithUser[] }) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: async ({
      botId,
      verified,
    }: {
      botId: string;
      verified: boolean;
    }) => setBotVerifiedAction(botId, verified),
    onSuccess: () => router.refresh(),
  });

  if (!bots.length) {
    return (
      <Text color="gray" size="2">
        No bots owned by this account.
      </Text>
    );
  }

  return (
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Bot</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>App</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Action</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {bots.map((bot) => (
          <Table.Row key={bot._id}>
            <Table.Cell>
              <Flex direction="column" gap="1">
                <Text weight="bold">
                  {bot.display_name || bot.username}
                  {bot.verified ? " ✔" : ""}
                </Text>
                <Text color="gray" size="1">
                  {bot.username}#{bot.discriminator} · {bot._id}
                </Text>
              </Flex>
            </Table.Cell>
            <Table.Cell>
              {bot.verified ? (
                <Badge color="green">Verified App</Badge>
              ) : (
                <Badge color="gray">Unverified</Badge>
              )}
            </Table.Cell>
            <Table.Cell align="right">
              <Button
                size="1"
                variant={bot.verified ? "soft" : "solid"}
                color={bot.verified ? "gray" : "green"}
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ botId: bot._id, verified: !bot.verified })
                }
              >
                {bot.verified ? "Remove verification" : "Verify app"}
              </Button>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}
