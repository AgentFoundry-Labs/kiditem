# Scripts

This is the human map for repo automation. The team uses Codex and Claude
together, so agent-facing rules live in [`AGENTS.md`](AGENTS.md), while this
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
| `scripts/check-agent-os-hexagonal.mjs` | AgentOS lane-first/capability-second dependency, input-port placement, and official module-size contract scanner; intentionally standalone until the KID-25 migration removes its live baseline violations | `npm run check:agent-os-hexagonal` |
| `scripts/check-agent-session-deletion.mjs` | live complete-deletion contraction guard for retired lifecycle concepts, raw artifact references, duplicate deletion schedulers, lifecycle write fences, and session-owned OperationRuns | `npm run check:agent-session-deletion` |
| `scripts/check-agents-hygiene.mjs` | AGENTS/CLAUDE instruction hygiene gate | `npm run check:agents-hygiene` |
| `scripts/check-copilotkit-train.mjs` | exact CopilotKit v2 and AG-UI platform-train guard | `npm run check:copilotkit-train` |
| `scripts/check-directory-architecture.mjs` | docs/ARCHITECTURE directory map drift gate | `npm run check:directory-architecture` |
| `scripts/check-frontend-db-boundary.sh` | frontend must not import DB/Prisma clients | `npm run check:web-db-boundary` |
| `scripts/check-identifier-contracts.mjs` | canonical resource-name and identifier-class boundary gate | `npm run check:identifier-contracts` |
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
| `scripts/manage-extension-release.mjs` | deterministic universal Chrome-extension bundle packager and manual GitHub Release publisher | `npm run extension:release`, `docs/runbooks/extension-releases.md` |
| `scripts/run-data-migrations.ts` | durable data migration runner; migration units live under root `VERSION` release folders such as `scripts/data-migrations/v0.1.0/`, record `data_migration_runs` ledger rows, and export/restore the hash-bound ledger baseline for an authoritative reset | `npm run data:migrate`, `docs/runbooks/release-train-versioning.md` |
| `scripts/safe-prisma-db-push.mjs` | local `db:push` wrapper that blocks whole-schema `--force-reset`; the guarded production rebuild workflow keeps its direct Prisma entrypoint | `npm run db:push` |
| `scripts/seed-agent-os.ts` | local/dev Agent OS runtime seed wrapper | `npm run seed:agent-os` |
| `scripts/seed-order-collection-mall-accounts.ts` | confirmation-gated, organization-scoped order-collection mall credential seed; encrypts complete `ID/PW/URL` triples into `ChannelAccount` and never creates a runtime env fallback | `npm run seed:order-collection-malls`, `docs/runbooks/environment-variables.md` |

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
