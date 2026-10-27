"use client";

import type { RevoltUserInfo } from "@/lib/database/revolt";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Markdown from "react-markdown";
import { decodeTime } from "ulid";

import {
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  DropdownMenu,
  Flex,
  Heading,
  Text,
} from "@radix-ui/themes";

import { UserStrikeActions } from "./userManagement";
import { clearProfileAction, exportUserAction } from "./actions";
import type { ClearProfileField } from "./actions";

dayjs.extend(relativeTime);

const AUTUMN = process.env.NEXT_PUBLIC_AUTUMN_URL?.replace(/\/$/, "");

export function UserCard({
  user,
  showProfile,
  showActions,
}: {
  user: RevoltUserInfo;
  showProfile?: boolean;
  showActions?: "none" | "short" | "all";
}) {
  const router = useRouter();
  const [notice, setNotice] = useState("");

  const clear = useMutation({
    mutationFn: (field: ClearProfileField) =>
      clearProfileAction(user._id, field),
    onSuccess: () => {
      setNotice("Profile field cleared.");
      router.refresh();
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : String(error)),
  });

  const download = useMutation({
    mutationFn: () => exportUserAction(user._id),
    onSuccess: (json) => {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nullcord-user-${user._id}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Export downloaded.");
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : String(error)),
  });

  const avatarSrc =
    user.avatar && AUTUMN ? `${AUTUMN}/avatars/${user.avatar._id}` : undefined;

  return (
    <Card>
      <Flex gap="3" direction="column">
        <Flex gap="3" align="center">
          <Avatar
            size="3"
            src={avatarSrc}
            fallback={user.username.substring(0, 1)}
          />

          <Box>
            <Text as="div" size="2" weight="bold">
              {user.username}#{user.discriminator}
            </Text>
            <Flex gap="2" wrap="wrap">
              {user.display_name && (
                <Badge color="gray">{user.display_name}</Badge>
              )}
              {user.status?.text && (
                <Badge color="gray">{user.status.text}</Badge>
              )}
              <Badge
                suppressHydrationWarning
                title={new Date(decodeTime(user._id)).toISOString()}
              >
                Created {dayjs(decodeTime(user._id)).fromNow()}
              </Badge>
              {user.privileged && <Badge color="ruby">admin</Badge>}
              {user.bot && <Badge color="gold">Bot</Badge>}
              {user.relations.friends > 0 && (
                <Badge>{user.relations.friends} friends</Badge>
              )}
            </Flex>
          </Box>
        </Flex>

        {(showActions === "short" || showActions === "all") && (
          <Flex gap="2" wrap="wrap">
            {showActions === "all" && (
              <UserStrikeActions id={user._id} flags={user.flags || 0} />
            )}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <Button variant="soft" disabled={clear.isPending}>
                  Clear Profile
                  <DropdownMenu.TriggerIcon />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.Item
                  onSelect={() => clear.mutate("avatar")}
                >
                  Avatar
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => clear.mutate("banner")}
                >
                  Profile Banner
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => clear.mutate("display_name")}
                >
                  Display Name
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => clear.mutate("bio")}>
                  Bio
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => clear.mutate("status")}>
                  Status
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={() => clear.mutate("all")}>
                  All
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <Button
              variant="soft"
              disabled={download.isPending}
              onClick={() => download.mutate()}>
              {download.isPending ? "Exporting…" : "Export JSON"}
            </Button>
          </Flex>
        )}

        {notice ? (
          <Text size="1" color="gray">
            {notice}
          </Text>
        ) : null}

        {showProfile && (
          <Flex direction="column" gap="2">
            <Heading size="2">Profile Bio</Heading>
            <Card>
              <Markdown>{user.profile?.content ?? "No profile bio."}</Markdown>
            </Card>
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
