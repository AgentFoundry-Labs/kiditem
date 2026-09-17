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
| `scripts/bootstrap-authoritative-inventory-dev.ts` | verified-local DB bootstrap for the Sellpia-authoritative inventory baseline; requires `--coupang-vendor-id` and creates only organization and Wing/Rocket account metadata, plus the organization's absolute ABC formula when it has none | `npm run inventory:bootstrap:dev`, `docs/runbooks/sellpia-rocket-inventory-sync.md` |
| `scripts/bootstrap-local-auth-user.ts` | explicit loopback-DB-only bootstrap for one local User, Organization (with its absolute ABC formula when it has none), active admin membership, and stdin password; reruns revoke that user's sessions and never mint a login session | `npm run dev:bootstrap-user`, `docs/runbooks/local-development.md`, `docs/runbooks/auth-office-local.md` |
| `scripts/check-agent-os-contraction.mjs` | Enforced Agent OS clean-contraction guard for legacy runtime, transcript, and retired model surfaces | `npm run check:agent-os-contraction -- --enforce` |
| `scripts/check-agent-os-hexagonal.mjs` | AgentOS lane-first/capability-second dependency, input-port placement, and official module-size contract scanner; intentionally standalone until the KID-25 migration removes its live baseline violations | `npm run check:agent-os-hexagonal` |
| `scripts/check-agents-hygiene.mjs` | CLAUDE instruction hygiene gate and legacy AGENTS detector | `npm run check:agents-hygiene` |
| `scripts/check-business-date-arithmetic.mjs` | server business dates come from `apps/server/src/common/kst.ts`: millisecond-day arithmetic elsewhere in non-test server code fails unless the file records it as a non-business-date duration or a named follow-up, with a line ceiling that only ratchets down | `npm run check:business-date-arithmetic` |
| `scripts/check-copilotkit-train.mjs` | exact CopilotKit v2 and AG-UI platform-train guard | `npm run check:copilotkit-train` |
| `scripts/check-cross-owner-fk.mjs` | ADR-0013 cross-owner reference gate: a `@relation` between two domain owners must be on the allowlist in `scripts/cross-owner-fk.json`, and an allowlist entry whose relation is gone fails as stale. Organization/user scope, relations inside one owner, and `SourceImportRun` keep their foreign keys | `npm run check:cross-owner-fk` |
| `scripts/check-directory-architecture.mjs` | docs/ARCHITECTURE directory map drift gate | `npm run check:directory-architecture` |
| `scripts/check-frontend-db-boundary.sh` | frontend must not import DB/Prisma clients | `npm run check:web-db-boundary` |
| `scripts/check-identifier-contracts.mjs` | canonical resource-name and identifier-class boundary gate | `npm run check:identifier-contracts` |
| `scripts/check-operation-automation-cutover.mjs` | production producer ownership, source-to-ABC, and Operation/Automation legacy-reference guard | `npm run check:operation-automation-cutover` |
| `scripts/operation-automation-cutover-preflight.mjs` | read-only Office database inventory for the Operation/Automation hard cutover; emits bounded counts and catalog identities only | `npm run preflight:operation-automation-cutover`, `docs/runbooks/operation-automation-cutover.md` |
| `scripts/check-pr-reconstruction-contract.mjs` | high-risk reconstruction PR body gate | `npm run check:pr-reconstruction` |
| `scripts/check-pr-release-contract.mjs` | persisted schema/data/release PR body and migration-version gate | `npm run check:pr-release-contract` |
| `scripts/check-queryraw-tenancy.sh` | raw SQL organization-scope scanner | `npm run check:idor` |
| `scripts/check-raw-snapshot-read-models.sh` | raw snapshot read-model boundary scanner | `npm run check:raw-snapshot-read-models` |
| `scripts/check-ledger-readers.mjs` | enforces the exact reader, owner-publication, and time-bounded legacy-reader files declared for each ledger; `--require-no-legacy` proves the final reader-zero cutover gate | `npm run check:ledger-readers` |
| `scripts/check-schema-artifact-sync.mjs` | Prisma schema changes must include full and domain ERD updates | `npm run check:schema-artifact-sync` |
| `scripts/check-sourcing-long-running-actions.mjs` | sourcing collection must start through its source owner from an explicit control, with persisted reads and no retired browser/HTTP collection helpers | `npm run check:sourcing-long-running-actions`, `docs/runbooks/sourcing-collection-operations.md` |
| `scripts/check-cutover-data-blockers.mjs` | read-only survey of what a schema cutover would hit in a database that has data: unique indexes over existing duplicates, and NOT NULL columns added with no database default. Run it at the point `db push` would run — after the pre-schema migrations — or it reports work those migrations already do. The Office deployer runs it there and stops the cutover before `db push` on any non-zero exit | `npm run check:cutover-data-blockers`, `deploy/office/apply-deployment.ps1` cutover, `docs/runbooks/operation-automation-cutover.md` |
| `scripts/check-cutover-blocker-coverage.mjs` | PR-time counterpart of `check-cutover-data-blockers.mjs`: diffs the schema against `origin/release/office` offline with this checkout's Prisma CLI and no database, and fails while a change existing rows could stop (a required column without a database default, SET NOT NULL, a type change, or a unique, primary, or foreign key on an existing table) has no entry in `scripts/cutover-blocker-coverage.json`. A unique or foreign key over a new nullable column, and a unique key over a subset the base already holds unique, are cleared. It reads schemas only; the survey stays the gate for real duplicates. Exit 0 covered, 1 uncovered or invalid file, 2 cannot run (for example, `origin/release/office` not fetched) | `npm run check:cutover-blocker-coverage`, `.github/workflows/pr-checks.yml` |
| `scripts/check-script-inventory.mjs` | this inventory drift gate | `npm run check:scripts-inventory` |
| `scripts/check-server-type-baseline.mjs` | apps/server type-error ceiling for the TEST-INCLUSIVE `tsconfig.json`; the build config and vitest both skip spec type-checking, so this is the only gate that catches a spec left broken by a signature change (~17s) | `npm run check:server-type-baseline` |
| `scripts/check-shared-interface-names.mjs` | shared public Zod contract naming ratchet | `npm run check:shared-interface-names` |
| `scripts/check-shared-root-imports.sh` | shared root-barrel ratchet | `npm run check:shared-root-imports` |
| `scripts/check-tenant-scope.sh` | mutating service organization-scope scanner | `npm run check:tenant-scope` |
| `scripts/dev-data-coupang.ts` | coupang domain adapter for dev data bundles | `npm run data:dev:* -- --domain coupang` |
| `scripts/dev-data.ts` | dev data bundle CLI | `npm run data:dev:*` |
| `scripts/generate-channel-registry.mjs` | copies the channel registry (`packages/shared/src/channel-registry.ts`) into the extension's committed `extensions/kiditem-os/shared/channel-registry.js`; the extension has no build, so the generated file is committed and `--check` fails when it drifts | `npm run check:channel-registry-sync` (in `check:conventions`) |
| `scripts/generate-prisma-erd.mjs` | Prisma ERD markdown generator | `npm run db:erd` |
| `scripts/local-agent-gateway.mjs` | macOS local Gateway operator entrypoint; starts only the generated protected config or logs a bundled Codex/Claude provider into its isolated home | `npm run dev:gateway`, `npm run gateway:login:codex`, `npm run gateway:login:claude`, `docs/runbooks/local-development.md` |
| `scripts/office-deploy.mjs` | Windows Office operator entrypoint; final releases use aligned `origin/release/office`, explicitly authorized incident refs are provisional, and status reports release/runtime drift | `npm run deploy:office:local`, `npm run deploy:office:status`, `npm run deploy:office:rollback`, `docs/runbooks/office-deploy.md` |
| `scripts/manage-extension-release.mjs` | deterministic universal Chrome-extension bundle packager and manual GitHub Release publisher | `npm run extension:release`, `docs/runbooks/extension-releases.md` |
| `scripts/run-data-migrations.ts` | durable data migration runner; runs the registered units under root `VERSION` release folders such as `scripts/data-migrations/v0.1.31/` by phase, records each run in `data_migration_runs` with the SHA-256 of the source it executed (`details._runner`), and reports applied migrations whose source changed since (`status`; `up` warns, and `--fail-on-source-drift` makes either fail); every post-schema or `all` `up` then re-applies the idempotent `scripts/data-migrations/ensure/` steps, which write no ledger row | `npm run data:migrate`, `docs/runbooks/release-train-versioning.md`, `docs/runbooks/office-deploy.md` |
| `scripts/safe-prisma-db-push.mjs` | local `db:push` wrapper that blocks whole-schema `--force-reset`; the guarded production rebuild workflow keeps its direct Prisma entrypoint | `npm run db:push` |
| `scripts/seed-agent-os-browser-qa.ts` | clean-cutover-owned isolated browser-QA fixture: accepts only the helper-injected Testcontainer target, seeds the selected minimal QA profile plus the fixture organization's absolute ABC formula, and accepts the login password only from interactive stdin; the clean-cutover browser entrypoint explicitly uses the auth-only general-chat profile | `npm run seed:agent-os:browser-qa` through `npm run qa:agent-os:clean-cutover -- --serve-browser-qa --email <email>` |
| `scripts/seed-order-collection-mall-accounts.ts` | confirmation-gated, organization-scoped order-collection mall credential seed; encrypts complete `ID/PW/URL` triples into `ChannelAccount` and never creates a runtime env fallback | `npm run seed:order-collection-malls`, `docs/runbooks/environment-variables.md` |
| `scripts/qa-agent-os-clean-cutover.mjs` | provisions a guarded isolated PostgreSQL cutover fixture, verifies the one-model schema, and can serve the macOS browser-QA stack with the built-in stdin-only auth/business seed without exposing database credentials | `npm run qa:agent-os:clean-cutover` |
| `scripts/smoke-interaction-os.mjs` | exercises Gateway readiness, provider conversation/history, the five stateless MCP tools, one read, and one approval-pending mutation without executing it | `npm run smoke:interaction-os` |
| `scripts/run-local-development.mjs` | macOS local runtime orchestrator; completes idempotent setup and isolated Codex authentication before starting Core and Gateway together, with sibling cleanup on exit | `npm run dev:all`, `docs/runbooks/local-development.md` |
| `scripts/setup-macos-development.mjs` | idempotent fresh-clone setup for local env examples, protected Gateway config/token/home, Git hooks, and locked npm dependencies; never applies schema or stores provider credentials | `npm run setup:macos`, `docs/runbooks/local-development.md` |
| `scripts/sync-local-database.ts` | loopback-only developer-database sync in the Office cutover order: shared JS build, status, the open release's pre-schema migrations (`--release-version`, as the Office deployer runs them), survey, read-only DDL preview, a backup before accepted destructive DDL, `db:push`, generate, post-schema migrations of every release (that `up` also re-applies the ensure steps), final status. A database without the ledger table is pushed before its pre-schema step. Earlier releases' pre-schema migrations are reported as not applicable and never run. Destructive DDL needs `--accept-data-loss`; `--dry-run` only reads; Prisma AI consent is read from the caller's environment and passed only to `db push` | `npm run db:sync:local`, `docs/runbooks/local-development.md` |

## Support Files

| path | purpose |
|---|---|
| `scripts/.server-type-baseline.txt` | per-file type-error ceiling for `check-server-type-baseline.mjs`; regenerate with `node scripts/check-server-type-baseline.mjs --regenerate` |
| `scripts/.shared-interface-names-baseline.txt` | existing exported Zod contracts not yet renamed to `FooSchema` |
| `scripts/.shared-root-imports-baseline.txt` | baseline for `check-shared-root-imports.sh` |
| `scripts/.tenant-scope-allowlist.txt` | narrow false-positive allowlist for `check-tenant-scope.sh` |
| `scripts/ledger-readers.json` | canonical ledger inventory: physical table, Prisma delegate/type, schema-checked reverse relation names, reader, exact owner-publication files, and legacy readers with removal issues |
| `scripts/cutover-blocker-coverage.json` | reviewed answers for `check-cutover-blocker-coverage.mjs`: per release `train`, a `table` (every change on it) or `keys`, answered by the pre-schema migration that removes or fixes the rows (`coveredBy`) or by why no row can stop the change (`acceptedRisk`); entries at or below the `release/office` VERSION are reported as prunable. Outside the paths the Office deployer scans, so editing it never forces a cutover |
| `scripts/_shared/prisma-ddl.mjs` | reader for the SQL `prisma migrate diff --script` prints: statements, `CREATE TABLE` and `ALTER TABLE` clauses, new-column defaults, constraints, and unique indexes, split only outside parentheses, quotes, and comments; shared by `check-cutover-data-blockers.mjs` and `check-cutover-blocker-coverage.mjs` |
| `scripts/vitest.config.ts` | isolated Vitest config for script helper tests |
| `scripts/__tests__/` | tests for script helpers and runbook automation |

## Retired

The old marketplace SQL seed, Langfuse DB init SQL, ad/traffic market-data
seeds, agent prompt SQL migrations, and matched-workbook database importer are
intentionally not present. Reference files may remain in dev-data bundles, but
owner runtime upload endpoints are the source-of-truth import paths. If a
workflow needs a durable script again, add it back as a named package script or
runbook step and update this inventory in the same PR.
