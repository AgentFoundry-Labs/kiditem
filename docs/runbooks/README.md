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

- [Google Drive Dev Data](google-drive-dev-data.md) — set up `KidItem Dev Data`
  through Google Drive Desktop for profile sync and Coupang bundle replay.
- [Coupang Scraper Publish](coupang-scraper-publish.md) — export scraper output
  JSON files into a replayable bundle and publish it to Google Drive.
