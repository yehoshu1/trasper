/**
 * Transactional/platform email. Deliberately separate
 * from customer correspondence: Resend owns its own SPF/DKIM domain and is used
 * for 2FA codes, recovery codes, password reset, staff invites and notices.
 * Never used for quotations or pro formas.
 */

export interface SystemMailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  id?: string;
}

export interface SystemMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Overrides the company name used in the From header. */
  companyName?: string;
}

/** The agency name used in system mail; settings win over the env fallback. */
export async function systemCompanyName(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const configured = env.SYSTEM_FROM_NAME?.trim();
  if (configured) return configured;
  try {
    const { getSettings } = await import("@/server/settings");
    const settings = await getSettings();
    return settings.companyName || "Travel Agency";
  } catch {
    return "Travel Agency";
  }
}

export function systemMailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && (env.SYSTEM_FROM_EMAIL || env.RESEND_FROM_EMAIL));
}

export function systemFrom(env: NodeJS.ProcessEnv = process.env, companyName?: string): string {
  const email = env.SYSTEM_FROM_EMAIL ?? env.RESEND_FROM_EMAIL ?? "no-reply@example.invalid";
  const name = companyName?.trim() || env.SYSTEM_FROM_NAME?.trim() || "Travel Agency";
  return `${name} <${email}>`;
}

export async function sendSystemEmail(
  mail: SystemMail,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SystemMailResult> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.SYSTEM_FROM_EMAIL ?? env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return {
      ok: false,
      skipped: true,
      error: "System email is not configured (RESEND_API_KEY / SYSTEM_FROM_EMAIL)",
    };
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const companyName = mail.companyName ?? (await systemCompanyName(env));
    const result = await resend.emails.send({
      from: systemFrom(env, companyName),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html ?? `<p>${escapeHtml(mail.text).replace(/\n/g, "<br />")}</p>`,
    });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Resend call failed" };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendTwoFactorCode(to: string, code: string): Promise<SystemMailResult> {
  const companyName = await systemCompanyName();
  return sendSystemEmail({
    to,
    companyName,
    subject: `Your ${companyName} verification code`,
    text: `Your verification code is ${code}. It expires shortly. If you did not try to sign in, contact an administrator.`,
  });
}

export async function sendRecoveryCodes(to: string, codes: string[]): Promise<SystemMailResult> {
  const companyName = await systemCompanyName();
  return sendSystemEmail({
    to,
    companyName,
    subject: `Your ${companyName} recovery codes`,
    text: [
      "Keep these recovery codes somewhere safe. Each code can be used once if you lose your authenticator.",
      "",
      ...codes,
      "",
      "If you did not request these, contact an administrator immediately.",
    ].join("\n"),
  });
}

export async function sendPasswordReset(to: string, resetUrl: string): Promise<SystemMailResult> {
  const companyName = await systemCompanyName();
  return sendSystemEmail({
    to,
    companyName,
    subject: `Reset your ${companyName} password`,
    text: `Use this link to reset your password: ${resetUrl}\n\nIf you did not request a reset, you can ignore this email.`,
  });
}

export async function sendStaffInvite(to: string, inviteUrl: string, invitedBy: string): Promise<SystemMailResult> {
  const companyName = await systemCompanyName();
  return sendSystemEmail({
    to,
    companyName,
    subject: `You are invited to ${companyName}`,
    text: [
      `${invitedBy} invited you to the ${companyName} quotation system.`,
      "",
      `Sign in at ${inviteUrl} using the temporary password your administrator gives you. Change it immediately from Settings → Security.`,
    ].join("\n"),
  });
}

export async function sendSystemNotice(to: string, subject: string, body: string): Promise<SystemMailResult> {
  return sendSystemEmail({ to, subject, text: body });
}
