# Staging Seed Data Runbook

Staging seed data is managed as pinned artifacts that match the current Prisma
schema. Google Drive remains the registry for the initial stage because the team
already uses it for shared development data.

If the first staging rollout reuses the shared dev Supabase project, treat this
runbook as non-destructive sync only. Do not run reset commands against the
shared dev DB.

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
