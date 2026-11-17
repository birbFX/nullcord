"use client";

import { useState } from "react";

import { Button, Flex, Text, TextField } from "@radix-ui/themes";

import { joinServerAction, openDmAction } from "./actions";

function useJoin() {
  const [state, setState] = useState("");
  const join = async (id: string) => {
    try {
      setState("Joining…");
      await joinServerAction(id);
      setState("Joined, reload the app");
    } catch (e) {
      setState((e as Error).message);
    }
  };
  return [state, join] as const;
}

export function DmButton({ userId }: { userId: string }) {
  const [err, setErr] = useState("");
  return (
    <Flex gap="2" align="center">
      <Button
        size="1"
        variant="soft"
        onClick={async () => {
          try {
            setErr("");
            const channel = await openDmAction(userId);
            window.open(`/channel/${channel}`, "_blank");
          } catch (e) {
            setErr((e as Error).message);
          }
        }}>
        DM
      </Button>
      {err ? (
        <Text size="1" color="red">
          {err}
        </Text>
      ) : null}
    </Flex>
  );
}

export function JoinServerButton({ serverId }: { serverId: string }) {
  const [state, join] = useJoin();
  return (
    <Flex gap="2" align="center">
      <Button size="1" variant="soft" onClick={() => join(serverId)}>
        Join
      </Button>
      {state ? (
        <Text size="1" color="gray">
          {state}
        </Text>
      ) : null}
    </Flex>
  );
}

/** Join-by-ID box for the users page */
export function JoinServerBox() {
  const [id, setId] = useState("");
  const [state, join] = useJoin();
  return (
    <Flex gap="2" align="center" mb="3">
      <TextField.Root
        size="2"
        placeholder="Server ID to join for moderation"
        value={id}
        onChange={(e) => setId(e.currentTarget.value)}
      />
      <Button variant="soft" disabled={!id.trim()} onClick={() => join(id)}>
        Join server
      </Button>
      {state ? (
        <Text size="1" color="gray">
          {state}
        </Text>
      ) : null}
    </Flex>
  );
}
