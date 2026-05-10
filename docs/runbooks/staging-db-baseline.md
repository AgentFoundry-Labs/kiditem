# Staging DB Baseline Runbook

This runbook manages staging database state as immutable Supabase Storage
S3-compatible artifacts. It replaces Google Drive as the staging DB reset source.
Google Drive dev-data remains local developer input sharing only.

The baseline captures the PostgreSQL `public` schema with `pg_dump --format=custom`.
It intentionally excludes Supabase `auth` and `storage` schemas. Login users and
object storage assets must be bootstrapped or verified separately.

## Human Prerequisites

- A dedicated staging Supabase project, or explicit team approval if staging
  temporarily reuses a shared non-production project.
- A private Supabase Storage bucket, for example
  `kiditem-staging-db-baselines`. Do not reuse the public app asset bucket.
- Supabase Storage S3 access key pair for that bucket/project. The key is
  server/operator-only and must not be exposed to browser code.
- Staging database connection string through the Supabase session pooler or a
  network path available to the operator/GitHub runner.
- For restore: team announcement with staging URL, Supabase project ref,
  profile id, and expected data loss.

Never use production DB URLs, production service keys, or production storage
buckets for this workflow.

## Expected Files And Runtime Shape

```text
deploy/staging/env/db-baseline.env.example
deploy/staging/db-baseline.example.json
scripts/staging-db-baseline.ts

Supabase Storage bucket:
  kiditem-staging-db-baselines/
    staging-db-baselines/
      staging-smoke-YYYY-MM-DD-v1/
        public.dump.pgcustom
        manifest.json
        checksums.sha256

EC2 staging host:
  /opt/kiditem/deployments/current-db.json
  /opt/kiditem/deployments/db-history/<timestamp>-<profileId>.json
```

## Environment

Create an operator-only env file when running locally:

```bash
cp deploy/staging/env/db-baseline.env.example .env.staging.db-baseline
chmod 600 .env.staging.db-baseline
```

Required variables:

- `DATABASE_URL` — staging Postgres URL.
- `STAGING_DB_BASELINE_TARGET=staging` — required before export/restore.
- `STAGING_DB_BASELINE_SANITIZED=true` — required before export, asserting the
  dump contains no production/customer raw data.
- `STAGING_DB_BASELINE_BUCKET` — private Supabase Storage bucket.
- `STAGING_DB_BASELINE_S3_ENDPOINT` — Supabase S3-compatible endpoint.
- `STAGING_DB_BASELINE_S3_REGION` — region, usually `ap-northeast-2`.
- `STAGING_DB_BASELINE_S3_ACCESS_KEY`
- `STAGING_DB_BASELINE_S3_SECRET_KEY`
- `STAGING_DB_BASELINE_PREFIX=staging-db-baselines`
- `STAGING_DB_BASELINE_PROFILE_ID` — pinned id such as
  `staging-smoke-2026-05-10-v1`. Do not use `latest`.

## Agent Actions

Install dependencies if this is a fresh worktree:

```bash
DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem npm install
```

Load operator env:

```bash
set -a
source .env.staging.db-baseline
set +a
```

Check local tooling and schema hash without touching the DB:

```bash
npx tsx scripts/staging-db-baseline.ts help
npx tsx scripts/staging-db-baseline.ts status --skip-db
```

Check staging DB status:

```bash
npx tsx scripts/staging-db-baseline.ts status
```

Export a new immutable baseline:

```bash
npx tsx scripts/staging-db-baseline.ts export \
  --profile-id "$STAGING_DB_BASELINE_PROFILE_ID" \
  --target staging \
  --sanitized true
```

The `--sanitized true` acknowledgement is an operator assertion. Do not export a
baseline if the staging DB contains production/customer raw data.

Verify an existing baseline by downloading manifest, checksum, and dump:

```bash
npx tsx scripts/staging-db-baseline.ts verify \
  --profile-id "$STAGING_DB_BASELINE_PROFILE_ID"
```

Restore staging from a pinned baseline:

```bash
npx tsx scripts/staging-db-baseline.ts restore \
  --profile-id "$STAGING_DB_BASELINE_PROFILE_ID" \
  --target staging \
  --confirm RESET_STAGING_DB
```

The CLI refuses to restore without the exact confirmation string.
Restore resets the entire PostgreSQL `public` schema before replaying the dump,
then reapplies Supabase-compatible schema grants. This keeps restores exact:
objects created after the baseline are removed instead of lingering as drift.

## GitHub Actions

Use `.github/workflows/staging-db.yml` manually.

- `status` prints schema hash and row counts.
- `export-baseline` creates a new immutable artifact. It fails if the profile
  path already exists.
- `restore-baseline` downloads, verifies, and restores only after
  `confirm=RESET_STAGING_DB`.

Secrets and variables live in GitHub Environment `staging`.

Variables:

- `STAGING_DB_BASELINE_BUCKET`
- `STAGING_DB_BASELINE_S3_ENDPOINT`
- `STAGING_DB_BASELINE_S3_REGION`
- `STAGING_DB_BASELINE_PREFIX`
- `STAGING_HOST`
- `STAGING_USER`
- `STAGING_REMOTE_DIR`

Secrets:

- `STAGING_DATABASE_URL`
- `STAGING_DB_BASELINE_S3_ACCESS_KEY`
- `STAGING_DB_BASELINE_S3_SECRET_KEY`
- `STAGING_SSH_KEY`
- `STAGING_SSH_KNOWN_HOSTS`

## Success Criteria

- `status` prints a `prismaSchemaHash` and staging row counts.
- `export` uploads exactly three objects under the pinned profile path:
  `public.dump.pgcustom`, `manifest.json`, `checksums.sha256`.
- `verify` recomputes the dump sha256 and matches both manifest and checksum
  file.
- `restore` writes `/opt/kiditem/deployments/current-db.json` and a matching
  history file after the DB restore completes.
- After `restore`, the `public` schema contains the restored baseline state, not
  a merge of the baseline plus leftover staging-only objects.
- Supabase Auth users used for login still match `public.users.id` and have
  active `OrganizationMembership` rows.

## Blocker Criteria

Stop and report if:

- `DATABASE_URL` points to production or is ambiguous.
- The requested profile id is `latest` or already exists for export.
- Export data cannot be confirmed as sanitized/non-production.
- Supabase Storage S3 credentials are missing or point to the app asset bucket.
- `pg_dump`, `pg_restore`, or `psql` is unavailable.
- The manifest omits `auth` or `storage` from `excludedSchemas`.
- Restore would run without `--confirm RESET_STAGING_DB`.
- Auth users cannot log in after restoring `public.users` and memberships.

## Final Report Format

```text
Staging DB baseline operation complete
- operation: <status|export|verify|restore>
- profileId: <pinned profile>
- schemaGitSha: <git sha>
- prismaSchemaHash: <sha256>
- storage bucket: <bucket name>
- storage keys: public.dump.pgcustom, manifest.json, checksums.sha256
- row counts: <summary>
- current-db record: <path or n/a>
- verification: <commands and result>
- blockers: <none or details>
```
