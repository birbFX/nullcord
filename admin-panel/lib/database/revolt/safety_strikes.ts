import { ulid } from "ulid";

import { createCollectionFn } from "..";

export type Strike = {
  _id: string;
  user_id: string;
  reason: string;

  case_id?: string;
  type?: "strike" | "suspension" | "ban";
  ban_message?: string;
  banned_until?: Date | string | null;
};

const strikesCol = createCollectionFn<Strike>("revolt", "safety_strikes");

export function fetchStrikes(user_id: string) {
  return strikesCol().find({ user_id }).toArray();
}

export async function createStrike(
  user_id: string,
  reason: string,
  type: Strike["type"],
  case_id?: string,
  extra: Pick<Strike, "ban_message" | "banned_until"> = {},
) {
  const strike: Strike = {
    _id: ulid(),
    user_id,
    reason,
    type,
    case_id,
    ...extra,
  };

  await strikesCol().insertOne(strike);
  return strike;
}
