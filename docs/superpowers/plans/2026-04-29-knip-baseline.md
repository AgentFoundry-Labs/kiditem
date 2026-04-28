# Knip Baseline / Dependency Report

**Date:** 2026-04-29  
**Branch:** `chore/knip-baseline`  
**Command:** `npm run knip:report`

## Goal

Add a stable dead-code and dependency-reporting gate before any Phase 5 purge work. This PR intentionally deletes no application code and removes no dependencies.

## Scope

- Add `knip` as a root dev dependency.
- Add `npm run knip:report`.
- Add `knip.jsonc` for the root workspace, `apps/server`, `apps/web`, `packages/shared`, and `packages/templates`.
- Record the first baseline so later purge PRs can prove the count moves down instead of hiding findings.

## Config Policy

The config treats these as explicit entry/runtime surfaces instead of deletion candidates:

- `scripts/**/*` because import/data/diagnostic scripts are invoked by npm, shell, or humans.
- `extensions/**/*.{js,mjs,cjs}` because Chrome extension files are wired through manifests and browser events, not TypeScript imports.
- `packages/shared/src/**/*.spec.ts` because Vitest test files are valid entry points.

The config excludes generated or local-only surfaces that should not become dependency-cleanup work:

- build/test artifacts: `dist`, `.next`, `coverage`, `.turbo`, `.cache`
- generated navigation or source output: `graphify-out`, `**/generated/**`, `**/*.generated.*`
- local worktrees: `.claude/worktrees`, `.codex/worktrees`, `.worktrees`, `worktrees`, `tmp`
- fresh-volume database seed artifact: `prisma/init.sql.gz`

## Baseline Counts

`npm run knip:report` currently exits 0 by design (`--no-exit-code`). Counts below are individual package/symbol counts from the JSON reporter; the compact reporter groups some rows by file.

| Issue type | Count |
| --- | ---: |
| Unused files | 33 |
| Unused dependency packages | 12 |
| Unused devDependency packages | 11 |
| Unlisted dependencies | 50 |
| Unlisted binaries | 4 |
| Unresolved imports | 1 |
| Unused exported values | 80 |
| Unused exported types | 97 |
| Duplicate exports | 2 |

Grouped by workspace:

| Workspace | Files | Dependency packages | Dev dependency packages | Unlisted deps | Binaries | Unresolved | Exports | Types | Duplicates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `apps/server` | 8 | 1 | 1 | 4 | 1 | 0 | 35 | 60 | 0 |
| `apps/web` | 25 | 11 | 4 | 16 | 0 | 1 | 42 | 36 | 0 |
| root | 0 | 0 | 4 | 1 | 3 | 0 | 0 | 0 | 0 |
| `packages/templates` | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| `packages/shared` | 0 | 0 | 0 | 9 | 0 | 0 | 3 | 1 | 2 |
| `scripts` | 0 | 0 | 0 | 18 | 0 | 0 | 0 | 0 | 0 |
| `prisma/root` | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |

## Notable Findings

Potential unused files:

- Server: `channels/adapters/coupang/constants.ts`, `common/listing-select.ts`, dashboard/finance DTO barrels, panel adapter registry, and workflow action/executor catalogs.
- Web: product-hub component files, legacy product page components, thumbnail-editor components/hooks, and thumbnails page components/libs.

Potential unused dependency declarations:

- `apps/web`: several Radix packages, `class-variance-authority`, `dagre`, `dotenv`, `html2canvas`, `react-colorful`, `uuid`.
- `apps/server`: `@langchain/google-genai`.
- root: `@types/better-sqlite3`, `better-sqlite3`, `react`, `react-dom`.
- `packages/templates`: `@types/react-dom`, `react-dom`.

Dependency declaration gaps:

- `apps/web` imports `zod` directly in API/client/test files. This needs a product decision: either direct `zod` remains a web dependency, or those files move to shared/domain schema imports.
- Root scripts use direct runtime packages such as `dotenv`, `@prisma/client`, `@prisma/adapter-pg`, `xlsx`, `puppeteer`, and `vitest`.
- `apps/server` uses `cron`, `uuid`, and `zod` directly in source.
- Tooling config references `eslint-plugin-import`, `postcss-load-config`, and `@nestjs/schematics`.

Shared package export findings:

- Duplicate exports remain in `schemas/action-task.ts` and `schemas/marketplace.ts`.
- A few shared security/schema constants are exported but not consumed yet; remove only after checking intended external consumers.

## Recommended Purge Order

1. Dependency declaration PR: fix real unlisted direct dependencies and unresolved config imports without deleting behavior.
2. Web dependency PR: confirm each reported UI/package dependency with `rg`, then remove unused packages and run `npm run build --workspace=apps/web`.
3. Web dead-file PR: delete one frontend domain cluster at a time, starting with product-hub or thumbnails, and verify route/build behavior.
4. Server dead-file PR: delete one backend domain cluster at a time, starting with workflow/panel catalog files only after verifying no dynamic registry lookup uses them.
5. Shared export PR: remove duplicate exports and unused exported symbols after subpath-export consumers are checked.

## Guardrails

- Do not use `knip --fix` for application code removal.
- Do not delete Chrome extension files solely because Knip cannot see manifest/event wiring.
- Do not delete scripts solely because no TypeScript import reaches them.
- Every purge PR should include before/after `npm run knip:report` evidence plus the relevant workspace build.

## Verification

- `npm run knip:report` PASS, with the baseline findings above.
- `git diff --check` PASS.
- `npm run check:web-db-boundary` PASS.
- `npm run check:idor` PASS.
- `npm run check:tenant-scope` PASS.
- `DATABASE_URL=postgresql://kiditem:kiditem@localhost:5432/kiditem npx prisma generate` PASS.
- `cd packages/shared && npm run build` PASS.
- `npm exec --workspace=packages/templates -- tsup` PASS.
- `npm exec --workspace=packages/templates -- tailwindcss -i src/styles.css -o dist/styles.css --minify` PASS.
- `npm run build --workspace=apps/server` PASS after Prisma client generation.
- `npm run build --workspace=apps/web` PASS after shared/templates dist generation.
