"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { audit } from "@/server/audit";
import { getCurrentUser, requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { actionError, actionOk, errorMessage, type ActionResult } from "@/server/actions/types";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  regenerateTwoFactorRecoveryCodes,
} from "@/server/auth";
import {
  consumeRateLimit,
  SENSITIVE_LIMIT,
  SENSITIVE_WINDOW_MS,
} from "@/server/rate-limit";

export async function startTwoFactorSetupAction(password: string): Promise<
  | { ok: true; totpURI: string; backupCodes: string[]; qrDataUrl: string }
  | { ok: false; error: string }
> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Please sign in again" };
    if (typeof password !== "string" || password.length === 0 || password.length > 200) {
      return { ok: false, error: "Check your password and try again." };
    }
    const limit = consumeRateLimit(`two-factor-setup:${user.id}`, {
      limit: 5,
      windowMs: SENSITIVE_WINDOW_MS,
    });
    if (!limit.allowed) {
      return { ok: false, error: "Too many setup attempts. Try again shortly." };
    }
    const result = await beginTwoFactorSetup(password);
    if (result.ok) {
      const { sendRecoveryCodes } = await import("@/server/system-email");
      await sendRecoveryCodes(user.email, result.backupCodes).catch(() => undefined);
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "startTwoFactorSetup",
          entity: "User",
          entityId: user.id,
          diff: JSON.stringify({ before: null, after: { method: "totp" } }),
        },
      });
    }
    return result;
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function confirmTwoFactorSetupAction(code: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return actionError("Please sign in again");
    if (typeof code !== "string" || code.length === 0 || code.length > 32) {
      return actionError("Enter the six-digit code from your authenticator");
    }
    const limit = consumeRateLimit(`two-factor-confirm:${user.id}`, {
      limit: SENSITIVE_LIMIT,
      windowMs: SENSITIVE_WINDOW_MS,
    });
    if (!limit.allowed) return actionError("Too many attempts. Try again shortly.");
    const result = await confirmTwoFactorSetup(code);
    if (!result.ok) return actionError(result.error);
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "enableTwoFactor",
        entity: "User",
        entityId: user.id,
        diff: JSON.stringify({ before: { twoFactorEnabled: false }, after: { twoFactorEnabled: true } }),
      },
    });
    revalidatePath("/settings/security");
    return actionOk("Two-factor authentication enabled");
  } catch (error) {
    return actionError(errorMessage(error));
  }
}

export async function disableTwoFactorAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const limit = consumeRateLimit(`two-factor-disable:${user.id}`, {
    limit: 5,
    windowMs: SENSITIVE_WINDOW_MS,
  });
  if (!limit.allowed) {
    redirect(`/settings/security?error=${encodeURIComponent("Too many attempts. Try again shortly.")}`);
  }
  const { getSettings } = await import("@/server/settings");
  const settings = await getSettings();
  if (settings.requireTwoFactorRoles.includes(user.role)) {
    redirect(`/settings/security?error=${encodeURIComponent("Your role requires two-factor authentication")}`);
  }
  const password = String(formData.get("password") ?? "");
  if (password.length === 0 || password.length > 200) {
    redirect(`/settings/security?error=${encodeURIComponent("Check your password and try again.")}`);
  }
  const result = await disableTwoFactor(password);
  if (!result.ok) redirect(`/settings/security?error=${encodeURIComponent(result.error)}`);
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "disableTwoFactor",
      entity: "User",
      entityId: user.id,
      diff: JSON.stringify({ before: { twoFactorEnabled: true }, after: { twoFactorEnabled: false } }),
    },
  });
  revalidatePath("/settings/security");
  redirect("/settings/security?saved=1");
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (sessionId.length === 0 || sessionId.length > 128) {
    redirect("/settings/security?error=Session%20not%20found");
  }
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId: user.id } });
  if (!session) redirect("/settings/security?error=Session%20not%20found");
  await prisma.$transaction(async (tx) => {
    await tx.session.delete({ where: { id: session.id } });
    await audit(tx, {
      userId: user.id,
      action: "revokeSession",
      entity: "Session",
      entityId: session.id,
      before: { ipAddress: session.ipAddress, userAgent: session.userAgent },
    });
  });
  revalidatePath("/settings/security");
  redirect("/settings/security?saved=1");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const user = await requireUser();
  const sessions = await prisma.session.findMany({ where: { userId: user.id } });
  await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(tx, {
      userId: user.id,
      action: "revokeAllSessions",
      entity: "User",
      entityId: user.id,
      before: { count: sessions.length },
    });
  });
  redirect("/login");
}

export async function saveTwoFactorPolicyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/settings/security?error=Only%20an%20admin%20can%20change%20the%20policy");
  const roles = [
    ...new Set(
      formData
        .getAll("roles")
        .map(String)
        .filter((role) => /^[a-z][a-z0-9_-]{1,39}$/.test(role)),
    ),
  ].slice(0, 50);
  const { saveSettings } = await import("@/server/settings");
  const { getSettings } = await import("@/server/settings");
  const before = await getSettings();
  await prisma.$transaction(async (tx) => {
    await saveSettings(tx, { requireTwoFactorRoles: roles });
    await audit(tx, {
      userId: user.id,
      action: "updateTwoFactorPolicy",
      entity: "Setting",
      entityId: "security",
      before: { requireTwoFactorRoles: before.requireTwoFactorRoles },
      after: { requireTwoFactorRoles: roles },
    });
  });
  revalidatePath("/settings/security");
  redirect("/settings/security?saved=1");
}

export async function regenerateRecoveryCodesClientAction(password: string): Promise<{
  ok: boolean;
  codes?: string[];
  error?: string;
}> {
  try {
    const user = await requireUser();
    if (typeof password !== "string" || password.length === 0 || password.length > 200) {
      return { ok: false, error: "Check your password and try again." };
    }
    const limit = consumeRateLimit(`recovery-codes:${user.id}`, {
      limit: 5,
      windowMs: SENSITIVE_WINDOW_MS,
    });
    if (!limit.allowed) {
      return { ok: false, error: "Too many attempts. Try again shortly." };
    }
    const result = await regenerateTwoFactorRecoveryCodes(password);
    if (!result.ok) return { ok: false, error: result.error };
    const { sendRecoveryCodes } = await import("@/server/system-email");
    await sendRecoveryCodes(user.email, result.backupCodes).catch(() => undefined);
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "regenerateRecoveryCodes",
        entity: "User",
        entityId: user.id,
        diff: JSON.stringify({ before: null, after: { count: result.backupCodes.length } }),
      },
    });
    return { ok: true, codes: result.backupCodes };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
