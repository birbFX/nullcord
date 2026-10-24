"use client";

import { IpBan, UserIP } from "@/lib/database/revolt/users";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Button, Flex, Select, Table, Text, TextField } from "@radix-ui/themes";

import { banIpAction, unbanIpAction } from "./actions";

export function IpManagement({
  ips,
  bans,
}: {
  ips: UserIP[];
  bans: IpBan[];
}) {
  const router = useRouter();
  const [selectedIp, setSelectedIp] = useState(ips[0]?.ip || "");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<"permanent" | "1" | "7" | "30">(
    "permanent",
  );

  const ban = useMutation({
    mutationFn: async () => {
      if (!selectedIp) return;
      await banIpAction(selectedIp, message, reason, duration);
      router.refresh();
    },
  });

  const unban = useMutation({
    mutationFn: async (ip: string) => {
      await unbanIpAction(ip);
      router.refresh();
    },
  });

  if (!ips.length) {
    return (
      <Text color="gray" size="1">
        No recorded session IPs for this user.
      </Text>
    );
  }

  const banMap = new Map(bans.map((entry) => [entry._id, entry]));

  return (
    <Flex direction="column" gap="3">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>IP</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Last Seen</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>State</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {ips.map((entry) => {
            const ban = banMap.get(entry.ip);
            return (
              <Table.Row key={entry.ip}>
                <Table.Cell>
                  <Text style={{ fontFamily: "monospace" }}>{entry.ip}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="1" color="gray">
                    {entry.last_seen
                      ? new Date(entry.last_seen).toLocaleString()
                      : "unknown"}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {ban ? (
                    <Badge color="red">IP banned</Badge>
                  ) : (
                    <Badge color="gray">Allowed</Badge>
                  )}
                </Table.Cell>
                <Table.Cell>
                  {ban ? (
                    <Button
                      size="1"
                      color="green"
                      variant="soft"
                      disabled={unban.isPending}
                      onClick={() => unban.mutate(entry.ip)}
                    >
                      Unban IP
                    </Button>
                  ) : (
                    <Button
                      size="1"
                      color="red"
                      variant="soft"
                      onClick={() => setSelectedIp(entry.ip)}
                    >
                      Select
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>

      <Flex gap="2" direction="column">
        <TextField.Root
          value={selectedIp}
          onChange={(e) => setSelectedIp(e.currentTarget.value)}
          placeholder="IP address"
        />
        <TextField.Root
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
          placeholder="Message shown to the banned IP"
        />
        <TextField.Root
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder="Moderator-only reason"
        />
        <Flex gap="2">
          <Select.Root
            value={duration}
            onValueChange={(value) => setDuration(value as never)}
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="permanent">Permanent</Select.Item>
              <Select.Item value="1">1 day</Select.Item>
              <Select.Item value="7">7 days</Select.Item>
              <Select.Item value="30">30 days</Select.Item>
            </Select.Content>
          </Select.Root>
          <Button
            color="red"
            disabled={ban.isPending || !selectedIp}
            onClick={() => ban.mutate()}
          >
            Ban IP
          </Button>
        </Flex>
        {ban.isError && <Text color="red">{String(ban.error)}</Text>}
      </Flex>
    </Flex>
  );
}
