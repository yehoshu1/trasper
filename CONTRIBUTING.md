# Contributing

Thank you for improving Trasper. This project handles money and customer documents, so changes are reviewed with care — small,
focused pull requests are much easier to merge than large rewrites.

## Before you start

- Read [README.md](README.md) and [AGENTS.md](AGENTS.md).
- Search existing issues and pull requests before opening a new one.
- For a large change, open an issue first so the approach can be agreed.
- Never include real customer data, passport details, credentials, API keys or
  production database dumps in an issue, commit or screenshot.

## Development setup

Requirements: Node.js 24 or later, npm, and Git.

```bash
git clone https://github.com/yehoshu1/trasper.git
cd trasper
cp .env.example .env
# Set AUTH_SECRET and ADMIN_PASSWORD, then:
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

The app runs at <http://localhost:3000>. Sign in with `ADMIN_EMAIL` and
`ADMIN_PASSWORD`. Change the password after the first sign-in.

## The checks

Every pull request must pass the same checks as CI:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Browser tests are optional locally but required when changing the end-to-end
flow:

```bash
npm run test:e2e
```

When adding a domain rule, add a table-driven unit test. When fixing a PNR
parsing bug, add the failing input as a fixture in `src/lib/pnr/fixtures/`.
Pricing changes must keep the invariant that the sum of line prices equals the
quoted total exactly.

## Coding standards

- TypeScript strict mode; no `any` in the pricing, PNR or permission layers.
- Money is `BigInt` in minor units. Never use floats for money, rates or VAT.
- The pricing engine in `src/lib/pricing/` is pure: no database, file system,
  network or implicit clock. Pass dates and settings in as arguments.
- Keep server-only code under `src/server/`; shared pure helpers under
  `src/lib/`; print templates under `src/documents/`.
- Every form input has one Zod schema shared by the form and the server action.
- Every write is a server action that checks permission, validates input and
  writes the audit row in the same transaction.
- Do not add Prisma enums for statuses or roles; use validated strings.
- User-facing copy uses English (UK): `31 Oct 2026`, 24-hour times.
- Follow the existing formatting rather than reformatting unrelated files.

## Commit and pull-request conventions

- Write imperative commit subjects, for example
  `Add a configurable document footer`.
- Keep commits logically separate; do not mix refactors with behaviour changes.
- Describe the problem, the approach and the tests you ran in the pull-request
  description.
- Link the issue the change closes, if there is one.
- Update the README or CHANGELOG when behaviour or configuration changes.

## Database changes

SQLite is the supported production database. Keep migrations portable:

1. Edit `prisma/schema.prisma`.
2. Run `npm run db:migrate -- --name describe_the_change`.
3. Commit the generated migration together with the schema change.
4. Never edit an already-applied migration; add a new one.

Do not run destructive Prisma commands against a database that contains data
you care about.

## Releases

The project uses Semantic Versioning. `package.json` is the single source of
truth, and release tags are `vX.Y.Z`. CI rejects a tag that does not match
`package.json` and publishes the matching container tags.

From a clean `main`, with the release entries under `[Unreleased]` in
`CHANGELOG.md`, run:

```bash
npm run release:patch   # or release:minor / release:major
git push --follow-tags
```

The script updates `package.json`, `package-lock.json` and `CHANGELOG.md`,
commits them and creates the annotated tag. Do not tag a commit that has not
passed CI.

## Security reports

Do not open a public issue for a vulnerability. Follow
[SECURITY.md](SECURITY.md) instead.

## Licence

By contributing you agree that your contribution is licensed under the MIT
Licence in [LICENSE](LICENSE).
