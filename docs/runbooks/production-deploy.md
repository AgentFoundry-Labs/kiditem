# Production Deploy Runbook

Production deploy is manual through `.github/workflows/production-deploy.yml`.
It shares the same GHCR image build and blue-green remote deploy model as
staging, but requires explicit confirmation strings and never auto-accepts
destructive Prisma schema changes. The only warning-accepted schema rerun is
the exact, read-only-preflight-covered channel identity transition described
below.

## Human Prerequisites

- GitHub Environment `production` exists.
- Production host has Docker Engine, Docker Compose plugin, nginx or an
  external load balancer, and SSH access restricted to operators.
- Production Supabase DB/Auth/Storage are separate from staging.
- Production host nginx or load balancer routes public traffic to
  `127.0.0.1:8080`.
- Production SSH known hosts are pinned in GitHub secrets.

## GitHub Environment Variables

Required variables:

```text
PRODUCTION_HOST
PRODUCTION_USER
PRODUCTION_REMOTE_DIR
PRODUCTION_URL
PRODUCTION_NEXT_PUBLIC_SUPABASE_URL
PRODUCTION_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
PRODUCTION_SUPABASE_URL
PRODUCTION_CORS_ORIGINS
PRODUCTION_S3_REGION
PRODUCTION_S3_BUCKET
PRODUCTION_S3_ENDPOINT
PRODUCTION_S3_PUBLIC_URL
PRODUCTION_AI_TEXT_MODEL
PRODUCTION_AI_IMAGE_MODEL
PRODUCTION_AI_IMAGE_ANALYSIS_MODEL
PRODUCTION_AI_IMAGE_ANALYSIS_VERIFY_MODEL
PRODUCTION_AGENT_RUNTIME_WORKER_ENABLED
PRODUCTION_AGENT_DEFAULT_MODEL
```

Required secrets:

```text
PRODUCTION_SSH_KEY
PRODUCTION_SSH_KNOWN_HOSTS
PRODUCTION_DATABASE_URL
PRODUCTION_S3_ACCESS_KEY
PRODUCTION_S3_SECRET_KEY
PRODUCTION_CHANNEL_CREDENTIALS_ENCRYPTION_KEY
PRODUCTION_SOURCING_EXTENSION_TOKEN_SECRET
PRODUCTION_GEMINI_API_KEY
```

Optional provider secrets and variables mirror the staging names with the
`PRODUCTION_` prefix, for example `PRODUCTION_NAVER_SEARCHAD_API_KEY`.

## Deploy

Run the workflow manually:

```text
operation: deploy
confirm: DEPLOY_PRODUCTION
allow_downtime_for_space: false
```

The protected `production` job passes two independent data-migration
confirmations: `DATA_MIGRATION_CONFIRM=APPLY_DATA_MIGRATIONS` and
`DATA_MIGRATION_PRODUCTION_CONFIRM=DEPLOY_PRODUCTION` from the validated
workflow input. The runner additionally requires `GITHUB_ACTIONS=true`; a
local shell cannot authorize `--target production` with the ordinary
confirmation alone.

The database transition is strictly ordered:

1. run pre-schema data migrations;
2. run the read-only `npm run check:channel-sku-identity` and set the job-local
   marker only after exit `0`;
3. capture an ordinary `npx prisma db push` log;
4. on warning-only refusal, accept only a non-empty subset of
   `channel_listings_org_account_external_id_key`,
   `channel_listings_id_org_account_key`,
   `channel_listing_options_id_org_key`, and
   `channel_listing_options_org_account_external_option_key`;
5. generate the Prisma client;
6. run post-schema data migrations.

A drop, extra warning, unrecognized constraint, missing marker, or non-warning
failure stops the production deployment. Release `0.1.8` then backfills only
null child accounts from same-organization parents and verifies that populated
child accounts equal their parent account before images are deployed.

## Rollback

Runtime rollback requires an immutable git SHA image tag:

```text
operation: rollback
image_tag: <git-sha>
confirm: ROLLBACK_PRODUCTION
```

Rollback does not revert database schema or data migrations. Do not use it as
the recovery plan for non-backward-compatible schema changes.

## Status

```text
operation: status
```

The status job prints `deployments/current.json`, active color, slot image
refs, compose status, and local smoke endpoint status from the production host.

## Blockers

- `confirm` is missing or wrong.
- `PRODUCTION_DATABASE_URL` is not the intended production DB.
- Either data-migration confirmation is missing, the runner is outside GitHub
  Actions, or the production target guard rejects the run.
- The repeatable channel SKU identity report contains any violation.
- `npx prisma db push` requests a destructive or unrecognized change rather
  than only the four preflight-covered unique additions.
- Candidate API/web health fails.
- Worker service exits during candidate validation.
- Public `/login` or `/api/auth/me` smoke fails after nginx switch.
