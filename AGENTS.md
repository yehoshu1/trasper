# AGENTS.md

Trasper is an agency-neutral travel quotation system: a pasted PNR or a hand-built quote → branded quotation with options → itinerary → pro forma invoice → payments. A quotation can be priced and sent before any booking exists, and itineraries may also be created standalone without a quotation or prices. It is designed for staff of any travel agency; no company identity is hard-coded.

**Stack:** Next.js (App Router) · TypeScript · Prisma · SQLite · Zod · Tailwind · Luxon · Node's built-in test runner · Playwright.

The app is a working product, not a greenfield scaffold. Read the code before changing it, keep the existing domain rules, and do not add features from the out-of-scope list without being asked.

## Where to look

| Topic | Location |
| --- | --- |
| Setup, configuration, deployment | `README.md`, `.env.example` |
| Public landing page | `src/app/page.tsx`, `src/app/landing.module.css`, `public/screenshots/` |
| Documentation site | `content/docs/`, `src/app/docs/` |
| Contribution workflow | `CONTRIBUTING.md` |
| Pricing engine and invariants | `src/lib/pricing/` |
| Quotation/editor logic | `src/lib/quotation.ts`, `src/server/quotations.ts` |
| PNR parsing and conversion | `src/lib/pnr/`, `src/server/ai/pnr.ts` |
| Document snapshots and templates | `src/lib/documents.ts`, `src/server/documents.ts`, `src/documents/` |
| Settings and company identity | `src/server/settings.ts`, `src/app/(staff)/settings/` |
| Auth, roles and capabilities | `src/lib/permissions.ts`, `src/server/auth.ts`, `src/server/guard.ts` |
| Server actions | `src/server/actions/` |
| Schema and migrations | `prisma/schema.prisma`, `prisma/migrations/` |
| Deployment | `Dockerfile`, `Dockerfile.dev`, `docker-compose.*.yml`, `deploy/Caddyfile` |
| Tests | `tests/`, `tests/e2e/` |

## Non-negotiable domain rules

- **Money is `BigInt` in minor units** (tambala/cents). Never `Int`, `Decimal`, or floating point for money. Exchange rates are scaled integers (`rateMicro`, rate × 1,000,000); percentage margins and VAT are basis points.
- **The pricing engine is pure** (`src/lib/pricing`): no database, no I/O, no implicit clock. Inputs in, result out; table-driven tests are mandatory.
- **Calculation order is fixed:** convert cost lines at the option's stored rate → cost total → markup → VAT **on markup only** → enabled optional taxes (on cost, markup or subtotal as configured) → total → round once at the end. VAT is never charged on cost or taxes.
- **Line prices must add up exactly** to the total: allocate markup/VAT/taxes proportionally to cost, last line absorbs the rounding remainder. The customer-facing layout is configurable (lump sum per line, supplier price plus service fee, itemised cost/fee/tax, per-person or single total); every layout is presentation-only and must still sum to the same total.
- **VAT is calculated on markup only.** The default quotation layout keeps VAT inside the lump sum and does not print a VAT row. An agency can mark taxes as included (hidden or with a note) or NOT included, in which case a combined tax row or itemised VAT/optional taxes are added before the total; this never changes the calculation base. Internal views always show cost, markup, VAT, taxes, total, profit. Profit is markup; VAT is a liability, not profit. A pro forma can show VAT explicitly when configured.
- **Statuses and roles are plain strings validated by Zod** — no Prisma enums. Roles and capabilities are stored in the `Role` table.
- **Every write is a server action:** check role → validate with Zod → write and audit in one transaction. Nothing writes from the browser. Permissions are enforced server-side, not by hiding buttons; viewers must never receive cost, markup or profit data.
- **Issued documents are frozen:** snapshot JSON and totals are copied when a quotation is sent or a document issued. Later setting, rate or reference-data changes never alter them. Sent quotations are locked; changes go through "Revise", which supersedes and raises the revision.
- **Itineraries are either quotation-linked or standalone.** A linked itinerary comes from the accepted quotation option. A standalone itinerary has its own contact, branch and frozen flight snapshot, but no quotation, option, prices or pro forma. Pro formas still require an accepted quotation option.
- **Payments are append-only:** correct mistakes with a reversing entry, never edit or delete. Future dates and overpayments are blocked. Pro forma status is derived from the payments, never typed.
- **Contacts and passengers are archived, never deleted** once referenced by a document.
- **No customer mailbox:** the in-app mail client is not part of this build. Transactional system mail (2FA, recovery, password reset and staff invites) goes through Resend only.
- **AI is limited to PNR conversion:** the deterministic parser runs first; Vercel AI SDK is only the fallback for free-form itineraries. AI settings live in Settings → AI, the API key is encrypted at rest, and both the AI proposal and final PNR must pass Zod validation.
- **Document numbers come from `Sequence` inside a transaction** and are never reused, even after cancellation.
- **Time:** document dates are stored as UTC calendar dates and displayed in the configured agency time zone (`Settings → Company` or `APP_TIMEZONE`). Flight times are local wall-clock strings at each airport — never converted. Durations and layovers use Luxon with IANA zone names, never hand-written DST rules.

## Agency identity and configuration

- Company name, address, email, phone, website, tax ID, footer, logo, letterhead and time zone live in the `Setting` table and are edited under **Settings → Company**.
- Deployment values belong in the environment: `APP_URL`, `APP_DOMAIN`, `AUTH_SECRET`, `DATABASE_URL`, `UPLOAD_DIR`, `BACKUP_DIR`, `CRON_SECRET`, `RESEND_API_KEY`, `SYSTEM_FROM_*` and AI provider settings. See `.env.example`.
- Seed-only values (`SEED_COMPANY_*`, `BASE_CURRENCY`, `VAT_*`, pricing defaults) initialise a fresh database. They are never read again once the admin saves the corresponding setting.
- Never put an agency's name, domain, logo, bank details or time zone back into source code, templates or a theme name.

## Structure and conventions

- `prisma/` schema and migrations.
- `src/app` routes; `src/app/page.tsx` is the public landing page at `/`, and `app/(staff)` is the authenticated shell with its dashboard at `/dashboard`.
- `src/server` actions, permissions, audit, numbering and database access.
- `src/lib/{pricing,pnr,time}` pure domain helpers.
- `src/documents` print templates used by both live preview and the PDF route.
- `src/components` UI components.
- `uploads/` persistent volume (never committed).

TypeScript strict; no `any` in the pricing, PNR or permission layers. User-facing text and documentation use **English (UK)**: `31 Oct 2026`, 24-hour times. One Zod schema per input, shared by form and server action. Use the shared audit and numbering helpers rather than writing to `AuditLog` or `Sequence` directly. Keep SQLite portable: string statuses, integer money, WAL mode and busy timeout.

Print templates must render from the frozen snapshot in both the live preview and the headless PDF route. A4 layout; totals never split from the last line.

## Testing

- `npm test` runs the compiled unit suite with Node's built-in test runner.
- `npm run test:e2e` runs Playwright (needs Chromium).
- Every domain rule has an automated test. Totals must equal the sum of line prices in every pricing case.
- Each new PNR parse failure becomes a fixture; the parser never guesses — unreadable input is left for manual entry.
- Cover overnight flights, date-line crossings and a daylight-saving date-change case.

## Commands

All commands run through npm so the Node 24 runtime is used.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with webpack (`next dev --webpack`) |
| `npm run build` | Production build (`next build --webpack`) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint 9 flat config (`eslint.config.mjs`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Compile with `tsconfig.test.json` into `.test-dist`, run Node's test runner |
| `npm run test:e2e` | Playwright suite in `tests/e2e` |
| `npm run version:check` | Validate `package.json` SemVer and an optional release tag |
| `npm run release:patch` | Bump, changelog, commit and tag a patch release (also `release:minor` / `release:major`) |
| `npm run db:generate` | Regenerate the Prisma client into `src/generated/prisma` |
| `npm run db:migrate` | Create/apply a dev migration (`prisma migrate dev`) |
| `npm run db:deploy` | Apply migrations (`prisma migrate deploy`) — use in CI/Docker |
| `npm run db:seed` | Seed reference data, settings and the first admin (`scripts/seed.mjs`) |
| `npm run backup` | Snapshot DB with `VACUUM INTO`, gzip, copy uploads, prune backups |
| `npm run cron` | Call the guarded `/api/cron` route every 15 minutes |
| `npm run logos:fetch` | Download airline logos from Wikimedia Commons into `uploads/airlines/` |

Helpers: `scripts/smoke-quotation.mjs` creates a draft quotation with two options for manual testing; `scripts/smoke-documents.mjs` advances it through itinerary and pro forma; `scripts/create-viewer.mjs` creates/resets a viewer account for the cost-visibility check.

## Do not

- Add out-of-scope features (live PNR lookup, final invoices/receipts, customer email, extra reports, Word export as a customer deliverable) or swap the approved stack without asking.
- Store passport data.
- Use a serverless host or anything without a persistent disk for SQLite.
- Put secrets in code or commit `.env`, database files, backups or uploads.
- Run destructive Prisma commands against anything but a local development database.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
