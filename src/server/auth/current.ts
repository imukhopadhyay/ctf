import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "./session";
import { hasPlatformPermission, type PlatformPermission } from "../domain/permissions";

/** Current user for server components (memoized per request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return validateSessionToken(store.get(SESSION_COOKIE)?.value);
});

export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return user;
}

export async function requirePlatformPermission(permission: PlatformPermission): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPlatformPermission(user.role, permission)) redirect("/dashboard?denied=1");
  return user;
}
