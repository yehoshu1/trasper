/**
 * Optional per-role TOTP policy. A role listed in the setting must enrol
 * before using any staff page or server action; the policy is never enforced
 * only by hiding UI.
 */
export function requiresTwoFactorEnrolment(input: {
  role: string;
  enabled: boolean;
  requiredRoles: readonly string[];
}): boolean {
  return !input.enabled && input.requiredRoles.includes(input.role);
}
