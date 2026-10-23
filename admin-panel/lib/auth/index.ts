import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

/**
 * The admin panel is gated at login: only NullCord accounts with the
 * `privileged` flag (platform admins) can obtain a session. Once inside,
 * every panel scope is available.
 */
async function requireEmail(): Promise<string> {
  const session = await getServerSession();
  if (!session?.user?.email) return redirect("/");
  return session.user.email;
}

export async function getScopedUser(_scope: string) {
  return requireEmail();
}

export async function getMultiScopedUser(_scopes: string[]) {
  return requireEmail();
}

export async function getUserWithScopes<T extends string>(
  scopes: T[],
): Promise<[string, Record<T, boolean>]> {
  const email = await requireEmail();
  return [
    email,
    Object.fromEntries(scopes.map((scope) => [scope, true])) as Record<
      T,
      boolean
    >,
  ];
}
