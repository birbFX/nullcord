import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import {
  checkAnyPermission,
  checkPermission,
  flattenPermissionsFor,
} from "./rbacEngine";

const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_TYPE === "none";

/**
 * Check whether the currently authorised user has a given scope and return them if such
 * @param scope Required scope
 * @returns User email
 */
export async function getScopedUser(scope: string) {
  if (AUTH_DISABLED) return "owner@example.com";
  const session = await getServerSession();
  if (!session?.user?.email) return redirect("/panel/access-denied");

  const permissions = await flattenPermissionsFor({
    email: session.user.email,
  });

  if (!checkAnyPermission(permissions, [scope])) {
    console.debug(`${session.user.email} rejected, lacking ${scope}`);
    return redirect("/panel/access-denied?missing=" + scope);
  }

  return session.user.email;
}

/**
 * Check whether the currently authorised user has a given scope and return them if such
 * @param scope Required scope
 * @returns User email
 */
export async function getMultiScopedUser(scopes: string[]) {
  if (AUTH_DISABLED) return "owner@example.com";
  const session = await getServerSession();
  if (!session?.user?.email) return redirect("/panel/access-denied");

  const permissions = await flattenPermissionsFor({
    email: session.user.email,
  });

  if (!checkAnyPermission(permissions, scopes)) {
    console.debug(`${session.user.email} rejected, lacking any of ${scopes}`);
    return redirect("/panel/access-denied?missing=" + scopes);
  }

  return session.user.email;
}

/**
 * Check which of the given scopes are allowed to the given user
 * @param scopes Scopes to check
 * @returns User email and scope information
 */
export async function getUserWithScopes<T extends string>(
  scopes: T[],
): Promise<[string, Record<T, boolean>]> {
  if (AUTH_DISABLED) {
    return [
      "owner@example.com",
      Object.fromEntries(scopes.map((s) => [s, true])) as Record<T, boolean>,
    ];
  }
  const session = await getServerSession();
  if (!session?.user?.email) return redirect("/panel/access-denied");

  const permissions = await flattenPermissionsFor({
    email: session.user.email,
  });

  return [
    session.user.email,
    scopes.reduce(
      (r, s) => ({ ...r, [s]: checkPermission(permissions, s) }),
      {} as Record<T, boolean>,
    ),
  ];
}
