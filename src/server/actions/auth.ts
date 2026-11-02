"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { changePasswordSchema, loginSchema, passwordSchema } from "@/lib/schemas";
import { resolveAppUrl } from "@/lib/security-env";
import {
  auth,
  clearSession,
  getCurrentUser,
  requireUser,
  signInWithPassword,
  verifyTwoFactorCode,
} from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import {
  clientAddress,
  consumeRateLimit,
  LOGIN_EMAIL_LIMIT,
  LOGIN_IP_LIMIT,
  LOGIN_WINDOW_MS,
  peekRateLimit,
  recordRateLimitFailure,
  RESET_EMAIL_LIMIT,
  RESET_IP_LIMIT,
  RESET_WINDOW_MS,
  resetRateLimit,
  SENSITIVE_LIMIT,
  SENSITIVE_WINDOW_MS,
} from "@/server/rate-limit";
import { getSettings } from "@/server/settings";
import { actionError, actionOk, errorMessage, type ActionResult } from "@/server/actions/types";

export async function signInAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Check your details");
  }

  // Better Auth's HTTP rate limiter is bypassed when its server API is called
  // from an action, so throttle failures here as well.
  const email = parsed.data.email.trim().toLowerCase();
  const address = await clientAddress();
  const emailKey = `login:email:${email}`;
  const ipKey = `login:ip:${address}`;
  const emailRule = { limit: LOGIN_EMAIL_LIMIT, windowMs: LOGIN_WINDOW_MS };
  const ipRule = { limit: LOGIN_IP_LIMIT, windowMs: LOGIN_WINDOW_MS };
  const blocked = [peekRateLimit(emailKey, emailRule), peekRateLimit(ipKey, ipRule)].find(
    (decision) => !decision.allowed,
  );
  if (blocked) {
    const minutes = Math.max(1, Math.ceil(blocked.retryAfterSeconds / 60));
    return actionError(`Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  let requiresTwoFactor = false;
  let requiresSetup = false;
  try {
    const result = await signInWithPassword(email, parsed.data.password);
    if (!result.ok) {
      recordRateLimitFailure(emailKey, emailRule);
      recordRateLimitFailure(ipKey, ipRule);
      return actionError(result.error);
    }
    resetRateLimit(emailKey);
    requiresTwoFactor = Boolean(result.requiresTwoFactor);
    const signedIn = await prisma.user.findUnique({
      where: { email: parsed.data.email.trim().toLowerCase() },
    });
    const settings = await getSettings();
    requiresSetup = Boolean(
      signedIn &&
        !signedIn.twoFactorEnabled &&
        settings.requireTwoFactorRoles.includes(signedIn.role),
    );
    if (signedIn && !requiresTwoFactor) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: signedIn.id },
          data: { lastLoginAt: new Date() },
        });
        await audit(tx, {
          userId: signedIn.id,
          action: "signIn",
          entity: "User",
          entityId: signedIn.id,
          after: { at: new Date().toISOString() },
        });
      });
    }
  } catch (error) {
    return actionError(errorMessage(error));
  }
  if (requiresTwoFactor) redirect("/login/2fa");
  if (requiresSetup) redirect("/enrol-2fa?required=1");
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "signOut",
        entity: "User",
        entityId: user.id,
        diff: JSON.stringify({ before: null, after: { at: new Date().toISOString() } }),
      },
    });
  }
  await clearSession();
  redirect("/login");
}

export async function changePasswordAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Check your details");
  }
  const limit = consumeRateLimit(`password-change:${user.id}`, {
    limit: SENSITIVE_LIMIT,
    windowMs: SENSITIVE_WINDOW_MS,
  });
  if (!limit.allowed) {
    return actionError("Too many password attempts. Try again in a few minutes.");
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch {
    return actionError("Your current password is not correct");
  }

  await prisma.$transaction(async (tx) => {
    await audit(tx, {
      userId: user.id,
      action: "changePassword",
      entity: "User",
      entityId: user.id,
      before: { password: "unchanged" },
      after: { password: "changed" },
    });
  });
  return actionOk("Password changed. Other sessions have been signed out.");
}

export async function verifyTwoFactorLoginAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const code = String(formData.get("code") ?? "").trim();
  const recoveryCode = formData.get("recoveryCode") === "on";
  if (!code) return actionError("Enter your code");
  if (code.length > 32) return actionError("Enter the code from your authenticator");
  const address = await clientAddress();
  const limit = consumeRateLimit(`two-factor:ip:${address}`, {
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return actionError("Too many verification attempts. Try again later.");
  }
  const result = await verifyTwoFactorCode(code, formData.get("trustDevice") === "on", recoveryCode);
  if (!result.ok) return actionError(result.error);
  const user = await getCurrentUser();
  if (user) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await audit(tx, {
        userId: user.id,
        action: "signIn",
        entity: "User",
        entityId: user.id,
        after: { at: new Date().toISOString(), twoFactor: true, recoveryCode },
      });
    });
  }
  redirect("/dashboard");
}

export async function requestPasswordResetAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || email.length > 200 || !email.includes("@")) return actionError("Enter your email address");

  const address = await clientAddress();
  const allowedEmail = consumeRateLimit(`reset:email:${email}`, {
    limit: RESET_EMAIL_LIMIT,
    windowMs: RESET_WINDOW_MS,
  });
  const allowedIp = consumeRateLimit(`reset:ip:${address}`, {
    limit: RESET_IP_LIMIT,
    windowMs: RESET_WINDOW_MS,
  });
  // Always return the same message: never reveal whether an address exists or
  // whether that address is currently throttled.
  if (allowedEmail.allowed && allowedIp.allowed) {
    try {
      await auth.api.requestPasswordReset({
        body: {
          email,
          redirectTo: `${resolveAppUrl()}/login/reset`,
        },
        headers: await headers(),
      });
    } catch {
      // Never reveal whether the account exists.
    }
  }
  return actionOk("If that email is registered, a reset link has been sent.");
}

export async function resetPasswordWithTokenAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Check the password");
  if (String(formData.get("confirmPassword") ?? "") !== parsed.data) {
    return actionError("The passwords do not match");
  }
  if (!token) return actionError("The reset link is incomplete");
  if (token.length > 512) return actionError("That reset link is invalid or has expired. Request a new one.");
  const address = await clientAddress();
  const limit = consumeRateLimit(`reset-token:ip:${address}`, {
    limit: 10,
    windowMs: RESET_WINDOW_MS,
  });
  if (!limit.allowed) {
    return actionError("Too many attempts. Request a new reset link.");
  }
  try {
    await auth.api.resetPassword({ body: { newPassword: parsed.data, token }, headers: await headers() });
  } catch {
    return actionError("That reset link is invalid or has expired. Request a new one.");
  }
  redirect("/login?reset=1");
}
