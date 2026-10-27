"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";

import { Button, Checkbox, Flex, Text, TextArea } from "@radix-ui/themes";

import { broadcastAnnouncement, BroadcastResult } from "./actions";

export function AnnouncementForm() {
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const send = useMutation({
    mutationFn: () => broadcastAnnouncement(message, confirmed),
    onSuccess: (data) => {
      setResult(data);
      setMessage("");
      setConfirmed(false);
    },
  });

  return (
    <Flex direction="column" gap="3">
      <TextArea
        rows={8}
        value={message}
        maxLength={2000}
        placeholder="Message sent to every active account from the platform account…"
        onChange={(e) => {
          setMessage(e.currentTarget.value);
          setResult(null);
        }}
      />

      <Text size="1" color="gray">
        {message.length}/2000 characters
      </Text>

      <Text as="label" size="2">
        <Flex gap="2" align="center">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(value) => setConfirmed(!!value)}
          />
          I understand this will DM every active account.
        </Flex>
      </Text>

      <Flex gap="2" align="center" wrap="wrap">
        <Button
          disabled={send.isPending || !message.trim() || !confirmed}
          onClick={() => send.mutate()}>
          {send.isPending ? "Broadcasting…" : "Send announcement"}
        </Button>
        {result ? (
          <Text size="1" color={result.failed ? "amber" : "green"}>
            Sent to {result.sent} accounts
            {result.failed ? `, ${result.failed} failed` : ""}.
          </Text>
        ) : null}
        {send.error ? (
          <Text size="1" color="red">
            {send.error instanceof Error
              ? send.error.message
              : String(send.error)}
          </Text>
        ) : null}
      </Flex>
    </Flex>
  );
}
