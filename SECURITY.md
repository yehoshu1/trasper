# Security policy

## Supported versions

Security fixes are made on the latest release on the `main` branch. Older
releases may not receive fixes; upgrade to the latest version before
reporting a problem.

| Version | Supported |
| --- | --- |
| Latest `main` / newest release | Yes |
| Older releases | Best effort |

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report it privately using the repository host's private vulnerability
reporting or security-advisory feature. If that is unavailable, contact the
maintainers through the private address listed on the repository profile.

Please include:

- A description of the issue and its impact.
- Steps to reproduce, including the affected route or server action.
- The version or commit you tested.
- Any proof-of-concept request or payload (redact real customer data).
- Whether the issue is already public.

You can expect an acknowledgement within 5 working days and a decision on
severity and remediation within 10 working days. We will coordinate disclosure
with you and credit you in the release notes unless you prefer otherwise.

## Scope

This application is a staff-only, single-tenant quotation system. In scope:

- Authentication, session handling and two-factor authentication.
- Authorization bypasses, including exposure of cost, margin or profit data to
  roles that should not see it.
- SQL injection, cross-site scripting, CSRF, SSRF and unsafe file uploads.
- Leakage of secrets, password hashes or customer data.
- PDF/Word/CSV export injection or path traversal.
- Issues that let a user change or delete an issued document or a payment
  contrary to the append-only rules.

Out of scope:

- Findings that require an already-compromised server, database or
  administrator account.
- Missing security headers on a reverse proxy that is not part of this
  repository.
- Denial of service through unrealistic resource consumption on a
  self-hosted installation.
- Reports from automated scanners without a demonstrated impact.

## Deployment responsibilities

The repository provides secure defaults, but the operator is responsible for:

- Using a strong, unique `AUTH_SECRET` and `CRON_SECRET`.
- Serving the app over HTTPS (`APP_URL` must be `https://` in production).
- Restricting the staff network and keeping the host patched.
- Protecting backups, which contain password hashes and customer data.
- Keeping `RESEND_API_KEY`, AI provider keys and database files out of source
  control.
- Reviewing the audit log and rotating credentials after any suspected
  compromise.

## Built-in protections

- Passwords are hashed by Better Auth; roles and capabilities are enforced on
  the server for every page, action and download.
- Login, password reset, 2FA, AI conversion and document downloads are rate
  limited. Repeated failed sign-ins are throttled per account and client.
- Uploaded images are validated by magic bytes. Attachments are served only
  through an authorised route.
- CSV exports neutralise spreadsheet formula injection.
- Responses carry a nonce-based CSP and hardening headers. PDFium is
  self-hosted, so previews make no third-party requests.
- Issued documents are frozen snapshots. Payments are append-only and
  corrections require a reversing entry.
