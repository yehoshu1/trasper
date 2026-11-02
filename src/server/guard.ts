import { hasCapability, type Capability } from "@/lib/permissions";
import { getCurrentUser, sessionNeedsTwoFactorEnrolment, type SessionUser } from "@/server/auth";
import { PermissionError } from "@/lib/permissions";
import { getSettings } from "@/server/settings";

/** Resolve the signed-in user for an action and enforce a capability. */
export async function actionUser(capability: Capability): Promise<SessionUser> {
  // Load settings first so the configured agency time zone is active before
  // any date, deadline or document number is calculated.
  await getSettings();
  const user = await getCurrentUser();
  if (!user) throw new PermissionError("Please sign in again");
  if (await sessionNeedsTwoFactorEnrolment(user)) {
    throw new PermissionError("Two-factor authentication enrolment is required");
  }
  if (!hasCapability(user, capability)) {
    throw new PermissionError("You do not have permission to do that");
  }
  return user;
}

export async function optionalActionUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (user && (await sessionNeedsTwoFactorEnrolment(user))) return null;
  return user;
}
