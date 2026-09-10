# Scripts

This is the human map for repo automation. The team uses Codex and Claude
together, so agent-facing rules live in [`CLAUDE.md`](../CLAUDE.md), while this
file answers the practical question: "what is this script for, and how do I run
or verify it?"

Every kept script is either exposed through `package.json`, referenced by a
runbook, or used as a CI/test guard. Scratch work and one-time coordination
notes should stay outside git.

When a PR touches this directory, run:

```bash
npm run check:scripts-inventory
npm run test:scripts
```

## Operational Scripts

| path | owner / purpose | entrypoint |
|---|---|---|
| `scripts/bootstrap-authoritative-inventory-dev.ts` | verified-local DB bootstrap for the Sellpia-authoritative inventory baseline; requires `--coupang-vendor-id` and creates only organization and Wing/Rocket account metadata | `npm run inventory:bootstrap:dev`, `docs/runbooks/sellpia-rocket-inventory-sync.md` |
| `scripts/bootstrap-local-auth-user.ts` | explicit loopback-DB-only bootstrap for one local User, Organization, active admin membership, and stdin password; reruns revoke that user's sessions and never mint a login session | `npm run dev:bootstrap-user`, `docs/runbooks/local-development.md`, `docs/runbooks/auth-office-local.md` |
| `scripts/check-agent-os-contraction.mjs` | Enforced Agent OS clean-contraction guard for legacy runtime, transcript, and retired model surfaces | `npm run check:agent-os-contraction -- --enforce` |
| `scripts/check-agent-os-hexagonal.mjs` | AgentOS lane-first/capability-second dependency, input-port placement, and official module-size contract scanner; intentionally standalone until the KID-25 migration removes its live baseline violations | `npm run check:agent-os-hexagonal` |
| `scripts/check-agents-hygiene.mjs` | CLAUDE instruction hygiene gate and legacy AGENTS detector | `npm run check:agents-hygiene` |
| `scripts/check-copilotkit-train.mjs` | exact CopilotKit v2 and AG-UI platform-train guard | `npm run check:copilotkit-train` |
| `scripts/check-directory-architecture.mjs` | docs/ARCHITECTURE directory map drift gate | `npm run check:directory-architecture` |
| `scripts/check-frontend-db-boundary.sh` | frontend must not import DB/Prisma clients | `npm run check:web-db-boundary` |
| `scripts/check-identifier-contracts.mjs` | canonical resource-name and identifier-class boundary gate | `npm run check:identifier-contracts` |
| `scripts/check-operation-automation-cutover.mjs` | production producer ownership, source-to-ABC, and Operation/Automation legacy-reference guard | `npm run check:operation-automation-cutover` |
| `scripts/operation-automation-cutover-preflight.mjs` | read-only Office database inventory for the Operation/Automation hard cutover; emits bounded counts and catalog identities only | `npm run preflight:operation-automation-cutover`, `docs/runbooks/operation-automation-cutover.md` |
| `scripts/check-pr-reconstruction-contract.mjs` | high-risk reconstruction PR body gate | `npm run check:pr-reconstruction` |
| `scripts/check-pr-release-contract.mjs` | persisted schema/data/release PR body and migration-version gate | `npm run check:pr-release-contract` |
| `scripts/check-queryraw-tenancy.sh` | raw SQL organization-scope scanner | `npm run check:idor` |
| `scripts/check-raw-snapshot-read-models.sh` | raw snapshot read-model boundary scanner | `npm run check:raw-snapshot-read-models` |
| `scripts/check-schema-artifact-sync.mjs` | Prisma schema changes must include full and domain ERD updates | `npm run check:schema-artifact-sync` |
| `scripts/check-sourcing-long-running-actions.mjs` | sourcing collection must start through Operations, with persisted reads and no retired browser/HTTP collection helpers | `npm run check:sourcing-long-running-actions`, `docs/runbooks/sourcing-collection-operations.md` |
| `scripts/check-script-inventory.mjs` | this inventory drift gate | `npm run check:scripts-inventory` |
| `scripts/check-shared-interface-names.mjs` | shared public Zod contract naming ratchet | `npm run check:shared-interface-names` |
| `scripts/check-shared-root-imports.sh` | shared root-barrel ratchet | `npm run check:shared-root-imports` |
| `scripts/check-tenant-scope.sh` | mutating service organization-scope scanner | `npm run check:tenant-scope` |
| `scripts/dev-data-coupang.ts` | coupang domain adapter for dev data bundles | `npm run data:dev:* -- --domain coupang` |
| `scripts/dev-data.ts` | dev data bundle CLI | `npm run data:dev:*` |
| `scripts/generate-prisma-erd.mjs` | Prisma ERD markdown generator | `npm run db:erd` |
| `scripts/local-agent-gateway.mjs` | macOS local Gateway operator entrypoint; starts only the generated protected config or logs a bundled Codex/Claude provider into its isolated home | `npm run dev:gateway`, `npm run gateway:login:codex`, `npm run gateway:login:claude`, `docs/runbooks/local-development.md` |
| `scripts/office-deploy.mjs` | Windows Office operator entrypoint; final releases use aligned `origin/release/office`, explicitly authorized incident refs are provisional, and status reports release/runtime drift | `npm run deploy:office:local`, `npm run deploy:office:status`, `npm run deploy:office:rollback`, `docs/runbooks/office-deploy.md` |
| `scripts/manage-extension-release.mjs` | deterministic universal Chrome-extension bundle packager and manual GitHub Release publisher | `npm run extension:release`, `docs/runbooks/extension-releases.md` |
| `scripts/run-data-migrations.ts` | durable data migration runner; migration units live under root `VERSION` release folders such as `scripts/data-migrations/v0.1.0/`, record `data_migration_runs` ledger rows, and export/restore the hash-bound ledger baseline for an authoritative reset | `npm run data:migrate`, `docs/runbooks/release-train-versioning.md` |
| `scripts/safe-prisma-db-push.mjs` | local `db:push` wrapper that blocks whole-schema `--force-reset`; the guarded production rebuild workflow keeps its direct Prisma entrypoint | `npm run db:push` |
| `scripts/seed-agent-os-browser-qa.ts` | clean-cutover-owned isolated browser-QA fixture: accepts only the helper-injected Testcontainer target, seeds the selected minimal QA profile, and accepts the login password only from interactive stdin; the clean-cutover browser entrypoint explicitly uses the auth-only general-chat profile | `npm run seed:agent-os:browser-qa` through `npm run qa:agent-os:clean-cutover -- --serve-browser-qa --email <email>` |
| `scripts/seed-order-collection-mall-accounts.ts` | confirmation-gated, organization-scoped order-collection mall credential seed; encrypts complete `ID/PW/URL` triples into `ChannelAccount` and never creates a runtime env fallback | `npm run seed:order-collection-malls`, `docs/runbooks/environment-variables.md` |
| `scripts/qa-agent-os-clean-cutover.mjs` | provisions a guarded isolated PostgreSQL cutover fixture, verifies the one-model schema, and can serve the macOS browser-QA stack with the built-in stdin-only auth/business seed without exposing database credentials | `npm run qa:agent-os:clean-cutover` |
| `scripts/smoke-interaction-os.mjs` | exercises Gateway readiness, provider conversation/history, the five stateless MCP tools, one read, and one approval-pending mutation without executing it | `npm run smoke:interaction-os` |
| `scripts/run-local-development.mjs` | macOS local runtime orchestrator; completes idempotent setup and isolated Codex authentication before starting Core and Gateway together, with sibling cleanup on exit | `npm run dev:all`, `docs/runbooks/local-development.md` |
| `scripts/setup-macos-development.mjs` | idempotent fresh-clone setup for local env examples, protected Gateway config/token/home, Git hooks, and locked npm dependencies; never applies schema or stores provider credentials | `npm run setup:macos`, `docs/runbooks/local-development.md` |

## Support Files

| path | purpose |
|---|---|
| `scripts/.shared-interface-names-baseline.txt` | existing exported Zod contracts not yet renamed to `FooSchema` |
| `scripts/.shared-root-imports-baseline.txt` | baseline for `check-shared-root-imports.sh` |
| `scripts/.tenant-scope-allowlist.txt` | narrow false-positive allowlist for `check-tenant-scope.sh` |
| `scripts/vitest.config.ts` | isolated Vitest config for script helper tests |
| `scripts/__tests__/` | tests for script helpers and runbook automation |

## Retired

The old marketplace SQL seed, Langfuse DB init SQL, ad/traffic market-data
seeds, agent prompt SQL migrations, and matched-workbook database importer are
intentionally not present. Reference files may remain in dev-data bundles, but
owner runtime upload endpoints are the source-of-truth import paths. If a
workflow needs a durable script again, add it back as a named package script or
runbook step and update this inventory in the same PR.
