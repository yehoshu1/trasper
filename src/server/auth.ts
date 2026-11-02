import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword } from "better-auth/crypto";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";

import type { Prisma } from "@/generated/prisma/client";
import { safeAvatarUrl } from "@/lib/avatar";
import { capabilitiesFor, hasCapability, parseCapabilities, type Capability } from "@/lib/permissions";
import { resolveAppUrl, resolveAuthSecret } from "@/lib/security-env";
import { requiresTwoFactorEnrolment } from "@/lib/two-factor-policy";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { sendPasswordReset } from "@/server/system-email";

/**
 * Authentication is delegated to Better Auth (email + password, database
 * sessions, rate limiting). The app keeps its own role/active columns on the
 * user record and enforces capabilities server-side.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  roleName: string;
  branch: string;
  branchName: string;
  active: boolean;
  twoFactorEnabled: boolean;
  image: string | null;
  capabilities: Capability[];
}

const appUrl = resolveAppUrl();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  secret: resolveAuthSecret(),
  baseURL: appUrl,
  trustedOrigins: [appUrl],
  emailAndPassword: {
    enabled: true,
    // Staff accounts are created by an admin only.
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 200,
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      const result = await sendPasswordReset(user.email, url);
      if (!result.ok && !result.skipped) {
        throw new Error(result.error ?? "Could not send the password reset email");
      }
    },
    resetPasswordTokenExpiresIn: 60 * 60,
    // A reset link may have been received because an account was compromised;
    // invalidate every existing session when the password changes.
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "viewer",
        input: false,
      },
      branch: {
        type: "string",
        required: false,
        defaultValue: "01",
        input: false,
      },
      active: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 60,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60 * 15, max: 5 },
    },
  },
  plugins: [
    twoFactor({
      issuer: process.env.APP_NAME?.trim() || "Trasper",
      totpOptions: { digits: 6, period: 30 },
      backupCodeOptions: { amount: 10, length: 10 },
    }),
    nextCookies(),
  ],
});

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  if (!session.user.active) return null;
  const roleKey = session.user.role ?? "viewer";
  const branchCode = session.user.branch ?? "01";
  const [roleRow, branchRow, userRow] = await Promise.all([
    prisma.role.findUnique({ where: { key: roleKey } }),
    prisma.branch.findUnique({ where: { code: branchCode } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true },
    }),
  ]);
  const capabilities = roleRow
    ? roleRow.active
      ? parseCapabilities(roleRow.capabilities)
      : []
    : capabilitiesFor(roleKey);
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: roleKey,
    roleName: roleRow?.name ?? roleKey,
    branch: branchCode,
    branchName: branchRow?.name ?? "",
    active: true,
    twoFactorEnabled: Boolean(userRow?.twoFactorEnabled),
    image: safeAvatarUrl(session.user.image),
    capabilities,
  };
});

export async function sessionNeedsTwoFactorEnrolment(user: SessionUser): Promise<boolean> {
  if (user.twoFactorEnabled) return false;
  const settings = await getSettings();
  return requiresTwoFactorEnrolment({
    role: user.role,
    enabled: user.twoFactorEnabled,
    requiredRoles: settings.requireTwoFactorRoles,
  });
}

export async function requireUser(): Promise<SessionUser> {
  await getSettings();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await sessionNeedsTwoFactorEnrolment(user)) redirect("/enrol-2fa");
  return user;
}

/** Role guard for pages: redirects to the dashboard when not permitted. */
export async function requireCapableUser(capability: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasCapability(user, capability)) redirect("/dashboard?denied=1");
  return user;
}

export type SignInResult =
  | { ok: true; requiresTwoFactor?: boolean }
  | { ok: false; error: string };

export async function signInWithPassword(
  emailRaw: string,
  password: string,
): Promise<SignInResult> {
  const email = emailRaw.trim().toLowerCase();
  try {
    const result = (await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    })) as { twoFactorRedirect?: boolean } | undefined;
    return { ok: true, requiresTwoFactor: Boolean(result?.twoFactorRedirect) };
  } catch {
    // Do not reveal whether the email exists.
    return { ok: false, error: "Invalid email or password" };
  }
}

/** Complete a 2FA challenge started by signInWithPassword. */
export async function verifyTwoFactorCode(
  code: string,
  trustDevice: boolean,
  recoveryCode = false,
): Promise<SignInResult> {
  try {
    if (recoveryCode) {
      await auth.api.verifyBackupCode({ body: { code }, headers: await headers() });
    } else {
      await auth.api.verifyTOTP({ body: { code, trustDevice }, headers: await headers() });
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "That code is not valid. Try the next one from your authenticator." };
  }
}

export async function beginTwoFactorSetup(password: string): Promise<
  | { ok: true; totpURI: string; backupCodes: string[]; qrDataUrl: string }
  | { ok: false; error: string }
> {
  try {
    const settings = await getSettings();
    const result = await auth.api.enableTwoFactor({
      body: { password, method: "totp", issuer: settings.companyName },
      headers: await headers(),
    });
    if (result.method !== "totp") return { ok: false, error: "TOTP setup failed" };
    const QRCode = await import("qrcode");
    const qrDataUrl = await QRCode.toDataURL(result.totpURI, { margin: 1, width: 240 });
    return { ok: true, totpURI: result.totpURI, backupCodes: result.backupCodes, qrDataUrl };
  } catch {
    return { ok: false, error: "Could not start 2FA setup. Check your password and try again." };
  }
}

export async function confirmTwoFactorSetup(code: string): Promise<SignInResult> {
  try {
    await auth.api.verifyTOTP({ body: { code }, headers: await headers() });
    return { ok: true };
  } catch {
    return { ok: false, error: "That code is not valid yet. Wait for the next one and try again." };
  }
}

export async function disableTwoFactor(password: string): Promise<SignInResult> {
  try {
    await auth.api.disableTwoFactor({ body: { password }, headers: await headers() });
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not disable 2FA. Check your password." };
  }
}

export async function regenerateTwoFactorRecoveryCodes(password: string): Promise<
  { ok: true; backupCodes: string[] } | { ok: false; error: string }
> {
  try {
    const result = await auth.api.generateBackupCodes({
      body: { password },
      headers: await headers(),
    });
    return { ok: true, backupCodes: result.backupCodes };
  } catch {
    return { ok: false, error: "Could not generate new recovery codes. Check your password." };
  }
}

export async function clearSession(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Already signed out.
  }
}

/** Create a staff account using Better Auth's own password hasher. */
export async function createUserWithPassword(
  input: {
    name: string;
    email: string;
    role: string;
    branch: string;
    password: string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ id: string; name: string; email: string; role: string; branch: string }> {
  const passwordHash = await hashPassword(input.password);
  const user = await client.user.create({
    data: {
      id: randomUUID(),
      name: input.name,
      email: input.email.toLowerCase(),
      role: input.role,
      branch: input.branch,
      active: true,
      emailVerified: true,
    },
  });
  await client.account.create({
    data: {
      id: randomUUID(),
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
    },
  });
  return { id: user.id, name: user.name, email: user.email, role: user.role, branch: user.branch };
}

/** Reset a password and sign the target out everywhere. */
export async function resetPasswordForUser(
  userId: string,
  password: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  const account = await client.account.findFirst({
    where: { userId, providerId: "credential" },
  });
  if (account) {
    await client.account.update({ where: { id: account.id }, data: { password: passwordHash } });
  } else {
    await client.account.create({
      data: {
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      },
    });
  }
  await client.session.deleteMany({ where: { userId } });
}
