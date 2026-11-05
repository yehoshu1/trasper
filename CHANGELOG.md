# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- A built-in Fumadocs documentation site at `/docs`, split into a user guide
  (staff, administration and operations) and a developer guide (architecture,
  data model, HTTP routes, testing and contribution).
- Configurable agency time zone under Settings → Company, with `APP_TIMEZONE`
  as the seed and fallback value.
- `SEED_COMPANY_*`, `BASE_CURRENCY` and VAT seed variables so a deployment can
  start with its own identity and tax rules.
- Open-source project files: MIT licence, contribution guide, security policy
  and issue/PR templates.
- Product screenshots in the README.
- Configurable customer price layouts per quotation and per agency: lump sum,
  supplier price plus service fee, itemised cost/fee/tax, per-person and single
  total. Every layout is presentation-only and still adds up to the same total.
- Configurable tax presentation: included, included with a note, one combined
  tax row, or each VAT/optional tax itemised. VAT remains calculated on markup.
- Optional tax percentage bases: converted cost, service fee (markup) or
  subtotal, alongside fixed taxes.
- Accommodation and service quantities with units (night, room/night,
  person/night, person, room, day, package), optional unit cost and printed
  room/board/supplier details.
- Generalised option types (flight, accommodation, package, tour, cruise,
  other) so land-only quotations no longer require flight segments.
- Settings → Pricing presentation with agency-default layouts and editable
  labels for service fee, taxes, VAT/GST, total and per-person price.
- Optional standalone itineraries that can be created from a pasted PNR
  without a quotation, option or prices. Quotation-linked itineraries continue
  to work as before; pro formas still require an accepted quotation.
- Automated GHCR publishing from CI after verification and end-to-end tests
  pass. Pushes to `main` publish `latest`, `main` and `sha-<commit>`; `v*` tags
  publish semantic-version tags as well.
- Separate development and production Compose stacks. Development builds
  `Dockerfile.dev` with hot reload; production pulls the pinned GHCR image.
- Semantic versioning with `package.json` as the source of truth, a release
  script that updates the changelog and creates `vX.Y.Z` tags, and CI
  validation that the tag matches the package version.
- `APP_VERSION` is baked into the production image and reported by
  `/api/health`.
- Configurable quotation validity statement, printed below the options and
  frozen into the snapshot. The default is the 24-hour wording.
- Branded 404 and runtime error pages for the public app, staff workspace and
  documentation, with retry actions and an error reference when available.
- Unreferenced customers and passengers can now be permanently deleted;
  records referenced by documents remain archive-only.
- Administrators can cancel an accepted quotation with a reason from the admin control above the
  quotation editor. Issued documents and payments are left unchanged and must be handled separately.
- Quotations and pro formas can be archived and restored. Archiving is a visibility flag only:
  closed quotations and fully paid or cancelled pro formas leave the active list without changing
  their status, documents, payments, numbers or report totals.
- Administrators can also permanently delete an issued itinerary; its number is not reused and the
  linked quotation is left unchanged.
- The standalone itinerary form now has an always-visible **Import a PNR or itinerary** panel with
  **Read / convert**, matching the quotation editor. The old "Already booked?" wording stays removed.
- **+ Add passenger** on a draft quotation now works for any active passenger, not only passengers
  already linked to the customer. Linked passengers are offered first and unlinked ones are marked.
- Added **Dodoma International Airport (DOD)** to the airport seed data and as a reference-data
  migration so existing databases receive it on upgrade.
- A public product landing page at `/`, focused on the workflow, features and
  value proposition. The authenticated staff dashboard now lives at
  `/dashboard`, and all post-sign-in redirects, navigation links and end-to-end
  tests use the new route.

### Changed

- The project and application are now named **Trasper**.
- The application is agency-neutral. Company name, address, contact
  details, footer, letterhead, logo and time zone live in Settings rather than
  in source code.
- Theme names, storage keys and cookie names no longer contain the original
  agency's name.
- Email subjects, TOTP issuer, Word metadata, report headers and export
  filenames use the configured company name.
- Docker and Caddy configuration use `APP_DOMAIN`, `ACME_EMAIL` and neutral
  volume names.
- `docker-compose.yml` is replaced by `docker-compose.dev.yml` (local build)
  and `docker-compose.prod.yml` (pinned GHCR image).
- Existing installations are moved to the new 1-day validity default once; the
  value remains editable in Settings → Company.
- New quotations and revisions now default to one day's validity.
- The quotation editor's PNR import panel is visible by default; the
  “Already booked?” prompt has been removed.
- Default currency is USD and VAT is off until an administrator configures the
  agency's tax rules.

### Removed

- The original implementation plan and post-launch planning documents, which
  described a specific deployment rather than the open-source product.
- Hard-coded demo bank accounts from the seed; banks are configured in
  Settings → Bank accounts.
