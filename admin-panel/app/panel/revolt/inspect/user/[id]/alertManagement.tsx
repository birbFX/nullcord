"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";

import { Button, Flex, Text, TextArea } from "@radix-ui/themes";

import { sendAlertAction } from "./actions";

export function AlertManagement({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState("");

  const send = useMutation({
    mutationFn: () => sendAlertAction(id, message),
    onSuccess: () => {
      setSent("Alert sent.");
      setMessage("");
    },
  });

  return (
    <Flex direction="column" gap="2">
      <TextArea
        placeholder="Message to send to this user from the platform account"
        value={message}
        onChange={(e) => {
          setMessage(e.currentTarget.value);
          setSent("");
        }}
        rows={3}
      />
      <Flex gap="2" align="center">
        <Button
          disabled={send.isPending || !message.trim()}
          onClick={() => send.mutate()}
        >
          Send Alert
        </Button>
        {sent ? (
          <Text size="1" color="green">
            {sent}
          </Text>
        ) : null}
        {send.error ? (
          <Text size="1" color="red">
            {send.error instanceof Error ? send.error.message : String(send.error)}
          </Text>
        ) : null}
      </Flex>
    </Flex>
  );
}
