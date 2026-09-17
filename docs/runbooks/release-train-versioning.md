# Release Train Versioning Runbook

Root `VERSION` identifies the complete release train assembled on `develop`
and promoted to `release/office` and `main`. It does not identify an
individual feature, schema change, or build. Git SHA identifies an immutable
build, Prisma schema hash identifies schema shape, and `data_migration_runs`
records applied persisted rewrites.

The promoted `VERSION` is the higher of the `release/office` and `main`
versions. Office deploys from `release/office`, which root `CLAUDE.md` keeps as
the live operational anchor. A train on that branch may already be in the
Office migration ledger while `main` still carries an older train.

## Human Prerequisites

- The preceding train is promoted from `develop` to `release/office` or `main`
  before the next train starts.
- The operator can create a branch and PR targeting protected `develop`.
- Schema/data PR authors can complete `.github/PULL_REQUEST_TEMPLATE.md`.
- Office-impacting destructive changes follow the
  [data-loss policy](deployment-architecture.md#data-loss-policy).

## Environment Variables

No environment variables are needed to classify or start a release train.
Office deployment and data-migration confirmations remain owned by the
[Office deploy runbook](office-deploy.md).

## Inspect The Train Boundary

```bash
rtk git fetch origin main develop release/office
rtk git show origin/release/office:VERSION
rtk git show origin/main:VERSION
rtk git show origin/develop:VERSION
rtk git log -1 --format='%H %s' origin/release/office
rtk git log -1 --format='%H %s' origin/main
rtk git log -1 --format='%H %s' origin/develop
```

If `develop` equals the promoted version, the previous train was just promoted
or no new train has opened. Do not merge new feature, schema, or data-migration
work until the next train is opened. A greater `develop` version is the active
train shared by all PRs targeting `develop`.

The release contract guard reads the same refs. If `origin/release/office` is
missing, the guard prints a warning, takes the promoted version from `main`
alone, and rejects lineage whose baseline only `release/office` contains.

## Start The Next Train

1. Confirm the prior promotion and branch synchronization are complete.
2. Choose a valid SemVer greater than the `develop` version and the promoted
   version.
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
| Destructive cleanup under the data-loss policy | Keep | `keep VERSION <current>; destructive cleanup per ADR-0010, pre-schema cleanup migration <id>` |
| Work discovered after the train reached `release/office` or `main` | Open next train first | Never append it to the released version |

Increasing `VERSION` does not make a destructive schema change safe. Blue-green
slots may overlap, and runtime rollback does not revert schema or data.

## Add A Data Migration

1. Read root `VERSION`; it must be the open, unreleased train.
2. Create `scripts/data-migrations/v<VERSION>/<sequence>_<name>.ts`.
3. Make `id` start with `v<VERSION>:` and set `releaseVersion` to the same value
   without `v`.
4. Register the exact module in `scripts/data-migrations/index.ts`.
5. Run the migration twice against `local`, using the local QA database
   `kiditem-qa-pg` for data-bearing checks, and confirm the second run is a safe
   no-op or ledger skip.
6. Record the local affected-row counts in the PR.

Never edit an applied migration. A correction is a new idempotent migration in
a later train.

When an approved hard cutover removes the Prisma model needed by a promoted
migration, keep the historical source file byte-for-byte and remove only its
executable registration. Add an entry to
`scripts/data-migrations/retired.json` with the source SHA-256, the full
promoted baseline commit, and the active replacement migration ids and paths.
The baseline commit has the migration's release as `VERSION`, registers the
exact module with the same bytes, and is an ancestor of the checked head,
`origin/release/office`, or `origin/main`. The status command reports this
inactive lineage separately; it does not mark the historical migration as
applied. The release contract guard accepts a newly removed promoted
registration only when the baseline, source bytes, hash, and executable
replacements all match. Open-train migrations may still be replaced before
promotion without entering this catalog. Existing catalog entries are
immutable and must remain present in later changes. The guard checks every
entry again on each run.

If a promoted registration was already removed without an entry, add the entry
in a later PR. The guard accepts this late lineage only when the migration's
release is at or below the promoted version and neither the base nor the
candidate registry still runs it. The same baseline, byte, hash, and
replacement checks apply. A promotion diff may include a source file that has
an entry but no registration; its entry proves the file's bytes, so the file
takes no `Applied migration baseline` declaration.

Registrations removed before the catalog existed are exempt and have no entry:
v0.1.0–v0.1.3 and `v0.1.7:002` (removed in #325) and `v0.1.21:001` (removed in
#481).

If an ordinary PR must carry an already-applied migration from an older train,
add one exact declaration to the PR body:

```text
Applied migration baseline: <40-character lowercase commit SHA> scripts/data-migrations/v<release>/<migration>.ts
```

The declared commit must be an ancestor of the checked head, its `VERSION` must
match the migration's release directory, and its migration index must register
the exact module. The candidate migration file must also match the baseline
commit byte-for-byte. Deleting or renaming a migration named by a declaration,
or omitting the declaration for an ordinary historical migration, fails the
release contract guard. Promotion PRs from `develop` to `release/office` or
`main` retain their historical migration allowance; if they include a
declaration, the same immutable checks still apply.

## Promote The Train

A promotion PR merges `develop` into `release/office`, which Office then
deploys, or into `main`. The release contract guard treats either as a
promotion.

1. Confirm the promotion diff, commit count, and merge ancestry are expected.
2. Keep the `develop` root `VERSION`; do not bump it in the promotion PR.
3. Record the decision using this form, substituting the actual version and
   target branch:

   ```text
   Release decision: promote develop VERSION 0.1.31 to release/office; no additional version bump
   ```

4. Run both PR contract guards against the target branch and `HEAD`, as shown
   under Verification.
5. Verify that every migration added after the target branch's previous
   version is either registered and deployable in order or has an entry in
   `retired.json`.
6. Merge with a merge commit, then use the
   [Office deployment runbook](office-deploy.md).
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
rtk git fetch origin main develop release/office
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

For a promotion PR, pass the target branch (`origin/release/office` or
`origin/main`) as `--base`. Also set `GITHUB_BASE_REF` and `GITHUB_HEAD_REF`,
or pass `--event`, so the release contract guard knows the PR comes from
`develop`:

```bash
GITHUB_BASE_REF=release/office GITHUB_HEAD_REF=develop \
  rtk npm run check:pr-release-contract -- --base origin/release/office --head HEAD
```

Supply a complete PR body through the live PR or the checker's supported
body/event input. PR checks run only these guards' unit tests, so run the
guards locally before waiting for checks.

## Blockers

- The new train version is invalid SemVer or is not higher than the base.
- `develop` still equals the promoted version when feature work is ready to
  merge.
- A new migration targets a version already present on `release/office` or
  `main`.
- `origin/release/office` is not fetched. The guard then rejects lineage whose
  baseline only that branch contains.
- Migration path, `id`, `releaseVersion`, or registry import disagree.
- A destructive change deletes rows the data-loss policy carries forward.
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
