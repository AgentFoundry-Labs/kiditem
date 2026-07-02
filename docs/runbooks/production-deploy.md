# Production Deploy Runbook

Production deploy is manual through `.github/workflows/production-deploy.yml`.
It shares the same GHCR image build and blue-green remote deploy model as
staging, but requires explicit confirmation strings and never auto-accepts
destructive Prisma schema changes.

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

The workflow builds API and web images, runs pre-schema data migrations, runs
`npx prisma db push`, runs post-schema data migrations, renders production env
files, uploads compose assets, deploys the digest refs to the inactive slot,
switches nginx, and verifies the public URL.

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
- `npx prisma db push` requests destructive changes.
- Candidate API/web health fails.
- Worker service exits during candidate validation.
- Public `/login` or `/api/auth/me` smoke fails after nginx switch.
