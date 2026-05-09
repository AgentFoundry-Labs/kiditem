# Staging Seed Data Runbook

Staging seed data is managed as pinned artifacts that match the current Prisma
schema. Google Drive remains the registry for the initial stage because the team
already uses it for shared development data.

If the first staging rollout reuses the shared dev Supabase project, treat this
runbook as non-destructive sync only. Do not run reset commands against the
shared dev DB.

## Initial Shared Supabase Baseline

As of the initial EC2 staging rollout, the current Supabase project is treated
as the staging DB/Auth source. That means staging deploys should point at the
existing Supabase project and should not import a seed profile by default.

Observed baseline on 2026-05-10:

- 1 active organization (`Dev Company`, slug `dev-company`).
- 4 app DB users and 4 active organization memberships.
- 4 Supabase Auth users.
- 1,990 active master products.
- 1,192 channel listing rows.
- 1,077 master product image rows.

For login to work, the Supabase Auth user id must match `public.users.id`, and
that user must have an active `OrganizationMembership`. The current usable
staging operator accounts are the Auth users whose ids match their app DB user
rows. Placeholder/local users whose email exists in both places but ids differ
are not valid staging login accounts until they are explicitly mirrored.

Treat Google Drive seed artifacts as recovery/reproduction snapshots for this
phase, not as a deploy-time import step.

The first EC2 staging DB was initialized on 2026-05-10 by pushing the Prisma
schema to the shared Supabase Postgres database, then copying only the smoke
test baseline from local dev Postgres. This was not a full DB clone. Copied
tables:

- Auth/workspace: `organizations`, `users`, `organization_memberships`.
- Catalog counters: `master_code_counters`.
- Product management: `master_products`, `product_options`, `inventory`,
  `channel_listings`, `master_product_images`.
- Product metrics snapshots: `channel_scrape_runs`,
  `channel_scrape_snapshots`, `channel_listing_daily_snapshots`,
  `channel_ad_target_daily_snapshots`.

Excluded tables include agent run history, workflow run history, action tasks,
alerts, content generation history, thumbnail generation history, orders,
returns, settlements, suppliers, and other domain data not required for the
initial `/product-hub` smoke test.

Verification after the copy:

- `GET /api/auth/me` returns 200 with the preview Supabase session.
- `GET /api/products/masters?page=1&limit=5&period=14&enriched=true` returns
  total `1,990`.
- `GET /api/products/pipeline-stats?period=14` returns total `1,990`,
  channel linked `1,077`, and channel unlinked `913`.
- `http://3.106.120.252/product-hub` shows product data and the logout button.

The rule is:

```text
Prisma schema version + pinned seed artifact profile -> repeatable staging DB state
```

Do not import "latest" data into staging. Use a named, pinned profile such as
`staging-smoke-2026-05-09`.

## Human Prerequisites

- Supabase project exists for the staging runtime. It may be the shared dev
  project for the first rollout.
- The DB URL is confirmed to be non-production.
- A pinned Google Drive seed profile exists under the shared dev-data root.
- A staging operator has permission to read the Google Drive seed artifacts.
- `.env.staging.seed` exists only on the operator machine or EC2 host.

Never use production service-role keys or production database URLs in this
runbook.

## Expected Local Files

```text
.env.staging.seed
deploy/staging/env/seed.env.example
docs/DEV_DATA_BUNDLES.md
docs/runbooks/google-drive-dev-data.md
prisma/schema.prisma
prisma/models/
```

Create the operator env file from the example:

```bash
cp deploy/staging/env/seed.env.example .env.staging.seed
chmod 600 .env.staging.seed
```

Fill `.env.staging.seed` with staging-only values.

Set `KIDITEM_DEV_USER_ID` and `KIDITEM_DEV_ORGANIZATION_ID` to the staging user
and organization that should own imported records.

## Initial Schema Push

Run from the repo root:

```bash
set -a
source .env.staging.seed
set +a

npx prisma db push
npx prisma generate
```

Use `db push` only when the target DB is safe to mutate. If staging reuses the
shared dev Supabase project, confirm with the team before pushing schema
changes. Production migration policy is separate.

## Seed Import

Use the existing Google Drive dev-data sync runbook and point it at staging:

```bash
set -a
source .env.staging.seed
set +a

npm run data:dev:doctor
npm run data:dev:sync -- --profile staging-smoke-2026-05-09 --api-url "$KIDITEM_API_URL" --yes
```

The profile name must be pinned. If the needed profile does not exist, create it
in Google Drive first and record the exact artifact IDs in the profile metadata.

## Supabase Auth Users

If the seed needs login users, create them in the staging Supabase project only.
Use the project dashboard or an approved admin script with
`SUPABASE_SECRET_KEY` loaded from `.env.staging.seed`.

Recommended initial accounts:

- One admin/operator account for manual verification.
- One member account for role/organization boundary checks.

## Verification

Run:

```bash
set -a
source .env.staging.seed
set +a

npx prisma validate
npm run data:dev:doctor
curl -fsS "$KIDITEM_API_URL/login" >/dev/null
```

Then log into the staging UI and verify:

- The seeded organization is visible.
- Seeded products/listings appear under the expected organization.
- Mutating actions remain scoped to the current organization.
- Coupang source images are stored as external `MasterProductImage.url`
  references with nullable `storageKey`.
- Uploaded or AI-generated assets point to the staging Supabase Storage bucket.

## Reset Policy

Staging DB reset is manual and explicit. Skip this section when staging reuses
the shared dev Supabase project.

```bash
set -a
source .env.staging.seed
set +a

npx prisma db push --force-reset
npm run data:dev:sync -- --profile staging-smoke-2026-05-09 --api-url "$KIDITEM_API_URL" --yes
```

Before running a reset, announce the staging URL, Supabase project ref, profile
name, and expected data loss to the team.

## Blocker Criteria

Stop and report if:

- `DATABASE_URL` points to production or is ambiguous.
- The requested seed profile uses "latest" instead of a pinned artifact set.
- Google Drive access is missing.
- The import creates records without `organizationId`.
- The staging API returns `502` or points browser requests at `localhost:4000`.

## Final Report Format

Report:

- Prisma schema commit used.
- Seed profile name and artifact IDs.
- Supabase staging project ref.
- Organization ID seeded.
- Verification commands and results.
