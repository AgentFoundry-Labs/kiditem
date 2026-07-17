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
| `scripts/authoritative-inventory-rebuild.ts` | GitHub-Actions-only guard, selective Coupang scrape export/replay, minimum auth/account bootstrap, and fail-closed readiness verification for the 0.1.8 shared database rebuild | `npm run inventory:rebuild`, staging/production deploy workflows, `docs/runbooks/deployment-architecture.md` |
| `scripts/bootstrap-authoritative-inventory-dev.ts` | verified-local DB bootstrap for the Sellpia-authoritative inventory baseline; creates only organization and Wing/Rocket account metadata | `npm run inventory:bootstrap:dev`, `docs/runbooks/sellpia-rocket-inventory-sync.md` |
| `scripts/check-agents-hygiene.mjs` | AGENTS/CLAUDE instruction hygiene gate | `npm run check:agents-hygiene` |
| `scripts/check-sellpia-cutover-preflight.ts` | manual read-only diagnostic for the retired expand-release preservation/account/content/tenant assumptions; not part of current CI/CD | `npm run check:sellpia-cutover-preflight` |
| `scripts/check-sellpia-db-push-warning.mjs` | manual diagnostic for the retired additive/composite-key Prisma warning allowlist; not part of current CI/CD | direct operator troubleshooting only |
| `scripts/check-directory-architecture.mjs` | docs/ARCHITECTURE directory map drift gate | `npm run check:directory-architecture` |
| `scripts/check-frontend-db-boundary.sh` | frontend must not import DB/Prisma clients | `npm run check:web-db-boundary` |
| `scripts/check-pr-reconstruction-contract.mjs` | high-risk reconstruction PR body gate | `npm run check:pr-reconstruction` |
| `scripts/check-pr-release-contract.mjs` | persisted schema/data/release PR body and migration-version gate | `npm run check:pr-release-contract` |
| `scripts/check-queryraw-tenancy.sh` | raw SQL organization-scope scanner | `npm run check:idor` |
| `scripts/check-raw-snapshot-read-models.sh` | raw snapshot read-model boundary scanner | `npm run check:raw-snapshot-read-models` |
| `scripts/check-schema-artifact-sync.mjs` | Prisma schema changes must include ERD/Graphify generated navigation updates | `npm run check:schema-artifact-sync` |
| `scripts/check-script-inventory.mjs` | this inventory drift gate | `npm run check:scripts-inventory` |
| `scripts/check-shared-interface-names.mjs` | shared public Zod contract naming ratchet | `npm run check:shared-interface-names` |
| `scripts/check-shared-root-imports.sh` | shared root-barrel ratchet | `npm run check:shared-root-imports` |
| `scripts/check-tenant-scope.sh` | mutating service organization-scope scanner | `npm run check:tenant-scope` |
| `scripts/create-dev-preview-session.mjs` | local preview auth session helper | `./bin/dev-bootstrap.sh`, `docs/runbooks/dev-preview-with-auth.md` |
| `scripts/dev-data-coupang.ts` | coupang domain adapter for dev data bundles | `npm run data:dev:* -- --domain coupang` |
| `scripts/dev-data.ts` | dev data bundle CLI | `npm run data:dev:*` |
| `scripts/generate-prisma-erd.mjs` | Prisma ERD markdown generator | `npm run db:erd` |
| `scripts/generate-schema-graphify.py` | Graphify schema export generator | `npm run graphify:schema` |
| `scripts/prepare-coupang-extension.mjs` | staging browser-extension setup helper | `docs/runbooks/staging-deploy.md` |
| `scripts/run-data-migrations.ts` | durable data migration runner; migration units live under root `VERSION` release folders such as `scripts/data-migrations/v0.1.0/` and record `data_migration_runs` ledger rows | `npm run data:migrate`, `docs/runbooks/staging-deploy.md` |
| `scripts/safe-prisma-db-push.mjs` | local `db:push` wrapper that blocks whole-schema `--force-reset`; guarded staging/production rebuild workflows keep their direct Prisma entrypoint | `npm run db:push` |
| `scripts/seed-agent-os.ts` | local/dev Agent OS runtime seed wrapper | `npm run seed:agent-os` |
| `scripts/staging-db-baseline.ts` | staging DB baseline export/verify/restore CLI | `npm run staging:db` |
| `scripts/storage-cache-control.ts` | Supabase/S3 Storage cache-control inspection and staging backfill helper for public immutable image assets | `npm run storage:cache-control`, `docs/runbooks/storage-cache-control.md` |
| `scripts/sync-supabase-user.ts` | Supabase auth mirror helper | `docs/runbooks/auth-supabase.md` |

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
