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

- [Staging Deploy](staging-deploy.md) — build the initial EC2 staging runtime
  with Docker Compose, container nginx, host TLS proxy, Supabase staging DB/Auth,
  and Supabase Storage through its S3-compatible API.
- [Staging Seed Data](staging-seed-data.md) — push the staging schema and import
  pinned Google Drive seed artifacts into the dedicated staging environment.
- [Playwriter Wing Image Sync](playwriter-wing-image-sync.md) — set up the
  local Playwriter CLI/session required by `/thumbnails` image sync and Wing
  thumbnail registration.
- [Google Drive Dev Data](google-drive-dev-data.md) — set up `KidItem Dev Data`
  through Google Drive Desktop for profile sync and Coupang bundle replay.
- [Import Drive Reference Data](import-drive-reference-data.md) — load Drive
  `references/kiditem_list.xlsx` and `references/wing-inventory-matched.xlsx`
  into local DB baseline tables.
- [Coupang Scraper Publish](coupang-scraper-publish.md) — export scraper output
  JSON files into a replayable bundle and publish it to Google Drive.
