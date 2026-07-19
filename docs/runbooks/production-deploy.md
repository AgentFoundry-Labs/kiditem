# Production Deploy Runbook

Production deploy is manual through `.github/workflows/production-deploy.yml`.
It shares the same GHCR image build and blue-green remote deploy model as
staging, but requires explicit confirmation strings and never auto-accepts
destructive Prisma schema changes. Release `0.1.8` has a separate exact-token
rebuild operation; there is no warning-accepted `--accept-data-loss` fallback.

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
PRODUCTION_REBUILD_ORGANIZATION_ID
PRODUCTION_REBUILD_ORGANIZATION_NAME
PRODUCTION_REBUILD_ORGANIZATION_SLUG
PRODUCTION_REBUILD_USER_ID
PRODUCTION_REBUILD_USER_NAME
PRODUCTION_REBUILD_COUPANG_ACCOUNT_ID
PRODUCTION_REBUILD_COUPANG_ACCOUNT_NAME
PRODUCTION_REBUILD_EXPECTED_ACTIVE_MASTERS
PRODUCTION_REBUILD_EXPECTED_LISTINGS
PRODUCTION_REBUILD_EXPECTED_CHANNEL_SKUS
```

Required secrets:

```text
PRODUCTION_SSH_KEY
PRODUCTION_SSH_KNOWN_HOSTS
PRODUCTION_DATABASE_URL
PRODUCTION_S3_ACCESS_KEY
PRODUCTION_S3_SECRET_KEY
PRODUCTION_CHANNEL_CREDENTIALS_ENCRYPTION_KEY
PRODUCTION_GEMINI_API_KEY
PRODUCTION_SUPABASE_SECRET_KEY
PRODUCTION_REBUILD_USER_EMAIL
PRODUCTION_REBUILD_COUPANG_EXTERNAL_ACCOUNT_ID
```

Optional provider secrets and variables mirror the staging names with the
`PRODUCTION_` prefix, for example `PRODUCTION_NAVER_SEARCHAD_API_KEY`.
An optional Rocket baseline requires all three of
`PRODUCTION_REBUILD_ROCKET_ACCOUNT_ID`,
`PRODUCTION_REBUILD_ROCKET_ACCOUNT_NAME`, and secret
`PRODUCTION_REBUILD_ROCKET_EXTERNAL_ACCOUNT_ID`.

## Deploy

The promoted commit already contains the selected release-train `VERSION`.
Follow [Release Train Versioning](release-train-versioning.md) before promotion;
the production workflow reports that version and does not change it.

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

Normal database transitions remain pre-schema migrations, non-destructive
`prisma db push`, Prisma generation, and post-schema migrations.

The one-release authoritative rebuild uses:

```text
operation: deploy
deployment_target: production
destructive_reset: RESET_PRODUCTION_DATA
confirm: DEPLOY_PRODUCTION
```

Inside protected GitHub Environment `production`, the workflow validates the
exact target/token. The destructive order is: quiesce application traffic,
export the selected Coupang account as sanitized replay payloads, upload the
private one-day artifact, then cross the reset boundary by force-rebuilding the
final schema. It next creates only the configured auth/account baseline and
deploys snapshot-required state. A wrong token fails before quiesce; an
export/upload failure resumes the previous runtime because it remains before
the reset boundary.

An authenticated operator then imports Sellpia at
`/inventory-hub?tab=sellpia-sync`, followed by Wing at
`/product-hub/matching`. After both runs complete and approved manifest counts
are present in `PRODUCTION_REBUILD_EXPECTED_*`, trigger:

```text
operation: finalize-rebuild
deployment_target: production
destructive_reset: RESET_PRODUCTION_DATA
rebuild_run_id: <originating deploy run ID>
```

This downloads only the originating production artifact, creates a temporary
operator session using the production Supabase secret, replays through
authenticated `POST /api/ads/extension/sync`, and verifies exact imports and
facts before marking ready. Any missing/mismatched input leaves production
snapshot-required. The artifact expires after one day; restart the guarded
rebuild rather than copying data or credentials outside this path.

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
- A non-empty reset input differs from `RESET_PRODUCTION_DATA`, the target is
  not `production`, or the job is outside protected GitHub Actions production.
- After traffic is quiesced, the private export/upload does not finish before
  the reset boundary.
- Sellpia and Wing are not completed in that order through authenticated routes.
- The originating run artifact, expected manifest counts, replay counts, or
  readiness record is missing or mismatched.
- Candidate API/web health fails.
- Worker service exits during candidate validation.
- Public `/login` or `/api/auth/me` smoke fails after nginx switch.
