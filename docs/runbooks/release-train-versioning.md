# Release Train Versioning Runbook

Root `VERSION` identifies the complete release train assembled on `develop`
and promoted to `main`. It does not identify an individual feature, schema
change, or build. Git SHA identifies an immutable build, Prisma schema hash
identifies schema shape, and `data_migration_runs` records applied persisted
rewrites.

## Human Prerequisites

- The preceding train is promoted from `develop` to `main` before the next
  train starts.
- The operator can create a branch and PR targeting protected `develop`.
- Schema/data PR authors can complete `.github/PULL_REQUEST_TEMPLATE.md`.
- Production-impacting destructive changes have an approved expand, backfill,
  contract, and rollback decision.

## Environment Variables

No environment variables are needed to classify or start a release train.
Deployment and production data-migration confirmations remain owned by the
staging and production deploy runbooks.

## Inspect The Train Boundary

```bash
rtk git fetch origin main develop
rtk git show origin/main:VERSION
rtk git show origin/develop:VERSION
rtk git log -1 --format='%H %s' origin/main
rtk git log -1 --format='%H %s' origin/develop
```

Equal versions mean the previous train was just promoted or no new train has
opened. Do not merge new feature, schema, or data-migration work until the next
train is opened. A greater `develop` version is the active train shared by all
PRs targeting `develop`.

## Start The Next Train

1. Confirm the prior promotion and branch synchronization are complete.
2. Choose a valid SemVer greater than both branch versions.
3. Create a focused branch from current `develop` and change only root
   `VERSION` plus directly required release notes or policy documentation.
4. Record the decision using this form, substituting the actual versions:

   ```text
   Release decision: start VERSION 0.1.25 release train after 0.1.24 promotion
   ```

5. Run the release contract guard against the current base and open a PR to
   `develop`.

Do not bundle product behavior, Prisma schema changes, or data migrations into
the release-start PR.

## Classify Work Inside The Open Train

| Change | VERSION | PR release decision |
|---|---|---|
| Code-only, no persisted contract | Keep | State no schema/data impact when the PR template calls for it |
| Compatible additive Prisma change | Keep | `keep VERSION <current>; compatible db:push only, no data backfill` |
| Backfill or persisted semantic rewrite | Keep | `keep VERSION <current>; add registered v<current> data migration <id>` |
| Expand or contract stage | Keep | Name the stage, runtime compatibility, migration, and rollback boundary |
| Work discovered after the train reached `main` | Open next train first | Never append it to the released version |

Increasing `VERSION` does not make a destructive schema change safe. Blue-green
slots may overlap, and runtime rollback does not revert schema or data.

## Add A Data Migration

1. Read root `VERSION`; it must be the open, unreleased train.
2. Create `scripts/data-migrations/v<VERSION>/<sequence>_<name>.ts`.
3. Make `id` start with `v<VERSION>:` and set `releaseVersion` to the same value
   without `v`.
4. Register the exact module in `scripts/data-migrations/index.ts`.
5. Run the migration twice against the intended non-production test target and
   confirm the second run is a safe no-op or ledger skip.
6. Record affected-row and rollback/blocker evidence in the PR.

Never edit an applied migration. A correction is a new idempotent migration in
a later train.

## Promote The Train

1. Confirm the promotion diff, commit count, and merge ancestry are expected.
2. Keep the `develop` root `VERSION`; do not bump it in the promotion PR.
3. Record the decision using this form, substituting the actual version:

   ```text
   Release decision: promote develop VERSION 0.1.24 to main; no additional version bump
   ```

4. Run both PR contract guards against `origin/main` and `HEAD`.
5. Verify all migrations accumulated after the prior `main` version are
   registered and deployable in order.
6. Merge with a merge commit, then use the GitHub Actions deployment runbooks.
7. Open the next train before merging new work into `develop`.

## Verification

```bash
rtk npm run test:scripts
rtk npm run check:scripts-inventory
rtk npm run check:agents-hygiene
rtk npm run check:conventions
rtk git diff --check
```

For an ordinary PR, also run:

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

For a promotion PR, use the same commands with `origin/main`. Supply a complete
PR body through the live PR or the checker's supported body/event input.

## Blockers

- The new train version is invalid SemVer or is not higher than the base.
- `develop` still equals the version already promoted to `main` when feature
  work is ready to merge.
- A new migration targets a version already present on `main`.
- Migration path, `id`, `releaseVersion`, or registry import disagree.
- A destructive change lacks expand/backfill/contract or rollback evidence.
- A promotion PR edits `VERSION` instead of carrying the assembled train.
- The PR release decision is blank, placeholder text, or inconsistent with the
  changed files.

## Final Report

```text
Train: <VERSION>
Boundary: <started | building | promoted>
Base -> head: <base VERSION> -> <head VERSION>
Schema decision: <none | compatible db:push | expand/backfill/contract>
Data migrations: <none | registered ids>
Build identity: <git SHA>
Verification: <commands and results>
Blockers: <none or exact blocker>
```
