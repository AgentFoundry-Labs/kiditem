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

- [Local Development](local-development.md) — bootstrap a fresh macOS clone,
  protected native Gateway home, local login identity, Codex provider login,
  and the Web/API/Gateway development stack without sharing secrets.
- [Interaction Platform](interaction-platform.md) — operate the CopilotKit
  interaction plane, native provider conversations, Gateway registration, MCP
  authority, and restart/stop boundaries.
- [Warehouse API Provisioning](warehouse-api-provisioning.md) — safely read,
  create, update, verify, and delete organization-scoped Warehouse reference
  rows consumed by StockTransfers after standalone warehouse UI retirement.
- [Sellpia/Channel SKU Matching](channel-sellpia-matching.md) — import the
  Sellpia-authoritative MasterProduct snapshot and account-scoped Wing catalog,
  confirm exact ChannelSku component recipes, and verify the `0.1.8` baseline.
- [Sellpia Inventory And Rocket Read-Only Boundary](sellpia-rocket-inventory-sync.md)
  — operate the preserved inventory views and local-only reset/bootstrap while
  keeping Rocket PO monitoring read-only and delivery decisions deferred.
- [Environment Variables](environment-variables.md) — inventory of env vars,
  injection paths, verification commands, and feature-specific
  requirements for API, web, Agent OS, and Python agents.
- [Release Train Versioning](release-train-versioning.md) — open one root
  `VERSION` per deployable train, classify schema/data work, assign durable
  migrations, and promote the assembled train without another bump.
- [Sourcing Backend Normalized Cutover](sourcing-backend-cutover.md) — preserve
  canonical sourcing history and provenance while removing the lossy 1688
  hot-product storage and resetting only derived dashboard projections.
- [Sourcing Collection Operations](sourcing-collection-operations.md) — start and
  inspect a source-owner collection attempt, run the Office Chrome 1688 keyword
  search, and recover from provider failure, attention, and lost fences.
- [Office Deploy](office-deploy.md) — build and deploy one exact remote SHA on
  the Office host, verify runtime identity and health, manage disk pressure,
  and perform archived runtime-only rollback.
- [KidItem Local Authentication](auth-office-local.md) — operate Office
  email/password hashes, 30-day sessions, revocation, and extension token sync.
- [Deployment Architecture](deployment-architecture.md) — CI/CD architecture,
  Office runtime ownership, image immutability, secret boundaries, and
  rollback constraints.
- [Coupang Wing Catalog Collection](coupang-wing-catalog-collection.md) — collect
  authenticated Wing products, options, and provider media through the Chrome
  extension into registered products.
- [Chrome Extension Releases](extension-releases.md) — package the universal
  extension into one immutable application Release, then publish, install,
  verify, and roll them back.
- [Google Drive Dev Data](google-drive-dev-data.md) — set up `KidItem Dev Data`
  through Google Drive Desktop for profile sync and Coupang bundle pull.
- [Coupang Scraper Publish](coupang-scraper-publish.md) — export scraper output
  JSON files into a bundle for inspection and publish it to Google Drive.

Dev-data bundles may still carry reference workbooks for inspection. The former
generic replay adapter is retired; database source imports run through their
owner runtime upload endpoints rather than a standalone workbook importer.
