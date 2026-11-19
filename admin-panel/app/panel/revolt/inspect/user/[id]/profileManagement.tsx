"use client";

import { useEffect, useState } from "react";

import { useMutation } from "@tanstack/react-query";

import { BADGE_LABELS } from "./badgeLabels";
import { useRouter } from "next/navigation";

import { Badge, Button, Flex, Text, TextField } from "@radix-ui/themes";

import {
  forceLogoutAction,
  getActorRankAction,
  setDisplayNameAction,
  setUserBadgesAction,
  setUserNitroAction,
  setUserPrivilegedAction,
  setUsernameAction,
} from "./actions";

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ProfileManagement({
  id,
  username,
  discriminator,
  displayName,
  privileged,
  badges = 0,
  nitro = null,
}: {
  id: string;
  username: string;
  discriminator: string;
  displayName?: string | null;
  privileged?: boolean;
  badges?: number;
  nitro?: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(username);
  const [display, setDisplay] = useState(displayName ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rank, setRank] = useState<{ rank: string; isPlatformOwner: boolean }>({
    rank: "none",
    isPlatformOwner: false,
  });
  useEffect(() => {
    getActorRankAction().then(setRank).catch(() => undefined);
  }, []);
  const isOwnerRole = rank.rank === "owner";

  const saveBadges = useMutation({
    mutationFn: (next: number) => setUserBadgesAction(id, next),
    onSuccess: () => {
      setError("");
      setNotice("Badges updated.");
      router.refresh();
    },
    onError: (e) => {
      setNotice("");
      setError(message(e));
    },
  });

  const saveNitro = useMutation({
    mutationFn: (tier: "nitro" | "basic" | null) => setUserNitroAction(id, tier),
    onSuccess: () => {
      setError("");
      setNotice("Nitro updated.");
      router.refresh();
    },
    onError: (e) => {
      setNotice("");
      setError(message(e));
    },
  });

  const saveName = useMutation({
    mutationFn: () => setUsernameAction(id, name),
    onSuccess: () => {
      setError("");
      setNotice("Username updated.");
      router.refresh();
    },
    onError: (e) => {
      setNotice("");
      setError(message(e));
    },
  });

  const saveDisplay = useMutation({
    mutationFn: () => setDisplayNameAction(id, display),
    onSuccess: () => {
      setError("");
      setNotice("Display name updated.");
      router.refresh();
    },
    onError: (e) => {
      setNotice("");
      setError(message(e));
    },
  });

  const toggleAdmin = useMutation({
    mutationFn: () => setUserPrivilegedAction(id, !privileged),
    onSuccess: () => {
      setError("");
      setNotice(privileged ? "Admin access revoked." : "Admin access granted.");
      router.refresh();
    },
    onError: (e) => {
      setNotice("");
      setError(message(e));
    },
  });

  const logout = useMutation({
    mutationFn: () => forceLogoutAction(id),
    onSuccess: () => {
      setError("");
      setNotice("All sessions revoked.");
    },
    onError: (e) => {
      setNotice("");
      setError(message(e));
    },
  });

  const busy =
    saveName.isPending ||
    saveDisplay.isPending ||
    toggleAdmin.isPending ||
    saveBadges.isPending ||
    saveNitro.isPending ||
    logout.isPending;

  return (
    <Flex direction="column" gap="3">
      <Flex gap="2" align="center" wrap="wrap">
        <Badge color={privileged ? "ruby" : "gray"}>
          {privileged ? "Platform admin" : "Standard user"}
        </Badge>
        <Text size="1" color="gray">
          Tag #{discriminator}
        </Text>
      </Flex>

      <Flex gap="2" align="end" wrap="wrap">
        <Flex direction="column" gap="1" style={{ flexGrow: 1 }}>
          <Text size="1" color="gray">
            Username
          </Text>
          <TextField.Root
            value={name}
            maxLength={35}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </Flex>
        <Button
          disabled={busy || !name.trim() || name.trim() === username}
          onClick={() => saveName.mutate()}>
          Save username
        </Button>
      </Flex>

      <Flex gap="2" align="end" wrap="wrap">
        <Flex direction="column" gap="1" style={{ flexGrow: 1 }}>
          <Text size="1" color="gray">
            Display name
          </Text>
          <TextField.Root
            value={display}
            maxLength={32}
            placeholder="No display name"
            onChange={(e) => setDisplay(e.currentTarget.value)}
          />
        </Flex>
        <Button
          disabled={busy}
          variant="soft"
          onClick={() => saveDisplay.mutate()}>
          Save display name
        </Button>
      </Flex>

      <Flex direction="column" gap="1">
        <Text size="1" color="gray">
          Badges
        </Text>
        <Flex gap="2" wrap="wrap">
          {BADGE_LABELS.filter(
            (b) =>
              b.label !== "Owner" || rank.isPlatformOwner,
          ).map((b) => {
            const on = (badges & b.bit) !== 0;
            return (
              <Button
                key={b.bit}
                size="1"
                variant={on ? "solid" : "soft"}
                color={on ? "green" : "gray"}
                disabled={busy}
                onClick={() => saveBadges.mutate(on ? badges & ~b.bit : badges | b.bit)}>
                {on ? "✓ " : ""}
                {b.label}
              </Button>
            );
          })}
        </Flex>
      </Flex>

      <Flex gap="2" align="center" wrap="wrap">
        <Text size="1" color="gray">
          Nitro: {nitro ?? "none"}
        </Text>
        <Button size="1" variant="soft" disabled={busy} onClick={() => saveNitro.mutate("nitro")}>
          Grant Nitro
        </Button>
        <Button size="1" variant="soft" disabled={busy} onClick={() => saveNitro.mutate("basic")}>
          Grant Basic
        </Button>
        <Button size="1" variant="soft" color="red" disabled={busy || !nitro} onClick={() => saveNitro.mutate(null)}>
          Remove
        </Button>
      </Flex>

      <Flex gap="2" wrap="wrap">
        {isOwnerRole ? (
        <Button
          variant="soft"
          color={privileged ? "red" : "green"}
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                privileged
                  ? "Revoke platform admin access from this user?"
                  : "Grant this user platform admin access? They will be able to open this panel.",
              )
            )
              toggleAdmin.mutate();
          }}>
          {privileged ? "Revoke admin access" : "Grant admin access"}
        </Button>
        ) : null}
        <Button
          variant="soft"
          color="amber"
          disabled={busy}
          onClick={() => {
            if (confirm("Sign this user out of every session?")) logout.mutate();
          }}>
          Sign out all sessions
        </Button>
      </Flex>

      {notice ? (
        <Text size="1" color="green">
          {notice}
        </Text>
      ) : null}
      {error ? (
        <Text size="1" color="red">
          {error}
        </Text>
      ) : null}
    </Flex>
  );
}
