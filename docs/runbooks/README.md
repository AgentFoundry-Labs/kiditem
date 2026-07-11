# Runbooks

`docs/runbooks/` contains AI-executable setup and operations guides.

Use a runbook when the task is procedural: environment setup, external tool
setup, shared data sync, browser extension setup, deployment/sync setup, or
repeatable incident operations.

Runbooks are different from concept docs:

- Human prerequisites are listed first.
- Agent actions are explicit commands or file checks.
- Secrets are named but never recorded.
- Paths, env vars, directory shape, verification commands, success criteria,
  blocker criteria, and final report format are included.

Current runbooks:

- [Environment Variables](environment-variables.md) — inventory of env vars,
  injection paths, staging verification commands, and feature-specific
  requirements for API, web, Agent OS, and Python agents.
- [Staging Deploy](staging-deploy.md) — operate the EC2 staging runtime through
  GitHub Actions, GHCR image tags/digests, Docker Compose, container nginx, host
  TLS proxy, Supabase staging DB/Auth, and Supabase Storage through its
  S3-compatible API.
- [Production Deploy](production-deploy.md) — operate production deploy,
  rollback, status, confirmation strings, and production-only GitHub
  Environment variables.
- [Deployment Architecture](deployment-architecture.md) — CI/CD architecture,
  blue-green slot ownership, API/worker split, image immutability, rollback
  boundaries, and IaC baseline.
- [Staging DB Baseline](staging-db-baseline.md) — export, verify, and restore
  pinned staging DB baseline artifacts from a private Supabase Storage
  S3-compatible bucket.
- [Storage Cache-Control](storage-cache-control.md) — inspect and backfill
  Supabase Storage cache headers for staging public image assets.
- [Staging Seed Data](staging-seed-data.md) — historical first-rollout notes and
  non-destructive seed import guidance. Staging DB reset/restore now belongs to
  the DB baseline runbook.
- [Playwriter Wing Image Sync](playwriter-wing-image-sync.md) — set up the
  local Playwriter CLI/session required by `/product-pipeline/thumbnail-generation`
  image sync and Wing thumbnail registration.
- [Google Drive Dev Data](google-drive-dev-data.md) — set up `KidItem Dev Data`
  through Google Drive Desktop for profile sync and Coupang bundle replay.
- [Coupang Scraper Publish](coupang-scraper-publish.md) — export scraper output
  JSON files into a replayable bundle and publish it to Google Drive.

Dev-data bundles may still carry reference workbooks for inspection and replay.
Database source imports run through their owner runtime upload endpoints rather
than a standalone workbook importer.
