import { createCollectionFn } from "..";
import { col } from "@/lib/db";

export type RevoltAccount = {
  _id: string;
  email: string;
  email_normalised: string;

  verification: {
    status: "Verified" | "Pending" | "Moving";
  };

  deletion?:
    | {
        status: "WaitingForVerification" | "Deleted";
      }
    | {
        status: "Scheduled";
        after: string;
      };

  lockout?: {
    attempts: number;
    expiry: string;
  };

  mfa?: {
    totp_token?: {
      status: "Disabled" | "Pending" | "Enabled";
    };
    recovery_codes?: string[];
  };

  disabled: boolean;
  spam: boolean;
};

const accountCol = createCollectionFn<RevoltAccount>("revolt", "accounts");
const sessionCol = createCollectionFn<{ _id: string; user_id: string }>(
  "revolt",
  "sessions",
);

/**
 * Fetch an account by given ID
 * @param id ID
 * @returns Account if exists
 */
export function fetchAccountById(id: string) {
  return accountCol()
    .findOne(
      { _id: id },
      {
        projection: {
          password: 0,
          "mfa.totp.secret": 0,
        },
      },
    )
    .then((account) => {
      if (account?.mfa?.recovery_codes) {
        account.mfa.recovery_codes = account.mfa.recovery_codes.map(
          (_) => "CODE",
        );
      }
      return account;
    });
}


/** Enable or disable an account and invalidate its sessions. */
export async function setAccountDisabled(id: string, disabled: boolean) {
  await accountCol().updateOne({ _id: id }, { $set: { disabled } });
  if (disabled) {
    await sessionCol().deleteMany({ user_id: id });
  }
}

/** Clear failed-login lockout state. */
export async function resetAccountLockout(id: string) {
  await accountCol().updateOne({ _id: id }, { $unset: { lockout: "" } });
}

/** Update an account email and mark it verified. */
export async function setAccountEmail(id: string, email: string) {
  const normalised = email.trim().toLowerCase();
  await accountCol().updateOne(
    { _id: id },
    {
      $set: {
        email: email.trim(),
        email_normalised: normalised,
        verification: { status: "Verified" },
      },
    },
  );
}

/** Mark the account email as verified without changing it. */
export async function verifyAccountEmail(id: string) {
  await accountCol().updateOne(
    { _id: id },
    { $set: { verification: { status: "Verified" } } },
  );
}

/** Disable all MFA methods for the account. */
export async function disableAccountMfa(id: string) {
  await accountCol().updateOne(
    { _id: id },
    {
      $set: {
        "mfa.totp_token": { status: "Disabled" },
        "mfa.recovery_codes": [] as string[],
      },
    },
  );
}

/** Clear only the recovery codes. */
export async function clearAccountRecoveryCodes(id: string) {
  await accountCol().updateOne(
    { _id: id },
    { $set: { "mfa.recovery_codes": [] as string[] } },
  );
}

/** Schedule account deletion one week out and disable it immediately. */
export async function scheduleAccountDeletion(id: string) {
  const after = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await accountCol().updateOne(
    { _id: id },
    { $set: { deletion: { status: "Scheduled", after }, disabled: true } },
  );
  await sessionCol().deleteMany({ user_id: id });
}

/** Cancel a scheduled deletion and re-enable the account. */
export async function cancelAccountDeletion(id: string) {
  await accountCol().updateOne(
    { _id: id },
    { $set: { disabled: false }, $unset: { deletion: "" } },
  );
}

/** Count accounts in a deletion state for the developer dashboard. */
export async function countScheduledDeletions() {
  return col("accounts").countDocuments({ "deletion.status": "Scheduled" });
}
