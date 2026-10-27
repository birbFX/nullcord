"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  Badge,
  Button,
  Flex,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";

import {
  cancelAccountDeletionAction,
  clearAccountRecoveryCodesAction,
  disableAccountMfaAction,
  resetAccountLockoutAction,
  scheduleAccountDeletionAction,
  setAccountDisabledAction,
  setAccountEmailAction,
  verifyAccountEmailAction,
} from "./actions";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Text color="red" size="1" as="p">
      {errorMessage(error)}
    </Text>
  );
}

export function ManageAccount({
  id,
  attempts,
  disabled,
  deletion,
}: {
  id: string;
  attempts: number;
  disabled: boolean;
  deletion?: { status: string; after?: string } | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  const toggleDisabled = useMutation({
    mutationFn: () => setAccountDisabledAction(id, !disabled),
    onSuccess: () => {
      setError("");
      router.refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const resetLockout = useMutation({
    mutationFn: () => resetAccountLockoutAction(id),
    onSuccess: () => {
      setError("");
      router.refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const scheduleDeletion = useMutation({
    mutationFn: () => scheduleAccountDeletionAction(id),
    onSuccess: () => {
      setError("");
      router.refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const cancelDeletion = useMutation({
    mutationFn: () => cancelAccountDeletionAction(id),
    onSuccess: () => {
      setError("");
      router.refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const deletionScheduled = deletion?.status === "Scheduled";
  const busy =
    toggleDisabled.isPending ||
    resetLockout.isPending ||
    scheduleDeletion.isPending ||
    cancelDeletion.isPending;

  return (
    <Flex direction="column" gap="2">
      <Flex gap="2" align="center" wrap="wrap">
        <Badge color={disabled ? "red" : "green"}>
          {disabled ? "Disabled" : "Active"}
        </Badge>
        {deletion ? (
          <Badge color="orange">
            Deletion: {deletion.status}
            {deletion.after
              ? ` after ${new Date(deletion.after).toLocaleDateString()}`
              : ""}
          </Badge>
        ) : null}
      </Flex>

      <Flex direction="row" gap="2" wrap="wrap">
        <Button
          color={disabled ? "green" : "red"}
          variant="soft"
          disabled={busy || deletionScheduled}
          onClick={() => {
            if (
              confirm(
                disabled
                  ? "Re-enable this account?"
                  : "Disable this account and sign out all sessions?",
              )
            )
              toggleDisabled.mutate();
          }}
        >
          {disabled ? "Enable Account" : "Disable Account"}
        </Button>

        {deletionScheduled ? (
          <Button
            color="green"
            variant="soft"
            disabled={busy}
            onClick={() => {
              if (confirm("Cancel the scheduled deletion and re-enable the account?"))
                cancelDeletion.mutate();
            }}
          >
            Cancel Deletion
          </Button>
        ) : (
          <Button
            color="red"
            variant="soft"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "Schedule this account for deletion in 7 days? The account will be disabled immediately.",
                )
              )
                scheduleDeletion.mutate();
            }}
          >
            Queue Deletion
          </Button>
        )}

        <Button
          variant="soft"
          disabled={busy || attempts === 0}
          onClick={() => resetLockout.mutate()}
        >
          Reset Lockout {attempts > 0 ? `(${attempts})` : ""}
        </Button>
      </Flex>

      <ActionError error={error} />
    </Flex>
  );
}

export function ManageAccountEmail({
  id,
  email,
  verified,
}: {
  id: string;
  email: string;
  verified: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(email);

  const update = useMutation({
    mutationFn: () => setAccountEmailAction(id, value),
    onSuccess: () => router.refresh(),
  });

  const verify = useMutation({
    mutationFn: () => verifyAccountEmailAction(id),
    onSuccess: () => router.refresh(),
  });

  return (
    <Flex direction="column" gap="2">
      <Flex direction="row" gap="2" wrap="wrap">
        <TextField.Root
          value={value}
          className="grow"
          onChange={(e) => setValue(e.currentTarget.value)}
        />
        <Button
          disabled={update.isPending || !value.trim()}
          onClick={() => update.mutate()}
        >
          Update
        </Button>
        {verified ? (
          <Badge color="green">Email verified</Badge>
        ) : (
          <Button
            variant="soft"
            disabled={verify.isPending}
            onClick={() => verify.mutate()}
          >
            Verify
          </Button>
        )}
      </Flex>
      <ActionError error={update.error ?? verify.error} />
    </Flex>
  );
}

export function ManageAccountMFA({
  id,
  totp,
  recovery,
}: {
  id: string;
  totp: boolean;
  recovery: number;
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  const disableMfa = useMutation({
    mutationFn: () => disableAccountMfaAction(id),
    onSuccess: () => {
      setError("");
      router.refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const clearCodes = useMutation({
    mutationFn: () => clearAccountRecoveryCodesAction(id),
    onSuccess: () => {
      setError("");
      router.refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Flex direction="column" gap="2">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Method</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Action</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.RowHeaderCell>TOTP</Table.RowHeaderCell>
            <Table.Cell>
              <Badge color={totp ? "green" : "red"}>
                {totp ? "Enabled" : "Disabled"}
              </Badge>
            </Table.Cell>
            <Table.Cell>
              <Button
                size="1"
                color="red"
                variant="soft"
                disabled={!totp || disableMfa.isPending}
                onClick={() => {
                  if (confirm("Disable TOTP for this account?"))
                    disableMfa.mutate();
                }}
              >
                Disable
              </Button>
            </Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.RowHeaderCell>Recovery Codes</Table.RowHeaderCell>
            <Table.Cell>
              <Badge color={recovery ? "blue" : "red"}>
                {recovery} codes available
              </Badge>
            </Table.Cell>
            <Table.Cell>
              <Button
                size="1"
                color="red"
                variant="soft"
                disabled={recovery === 0 || clearCodes.isPending}
                onClick={() => {
                  if (confirm("Clear all recovery codes?")) clearCodes.mutate();
                }}
              >
                Clear
              </Button>
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
      <ActionError error={error} />
    </Flex>
  );
}
