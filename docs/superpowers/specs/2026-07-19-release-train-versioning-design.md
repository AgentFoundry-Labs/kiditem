# Release Train Versioning Design

**Date:** 2026-07-19
**Status:** Approved for implementation

## Goal

Make root `VERSION` identify one deployable release train instead of one schema
or feature change. Multiple PRs that ship together share one version, while
Git SHA, Prisma schema hash, and the data-migration ledger continue to provide
exact build, schema, and persisted-data identities.

## Selected Approach

KidItem will use release-train versioning.

- Root `VERSION` is the human-facing identifier for the complete release train
  assembled on `develop` and promoted to `main`.
- A new train changes `VERSION` once, before feature work for that train is
  merged. Feature, schema, and backfill PRs in the open train keep that value.
- Promotion from `develop` to `main` preserves the train version. Promotion
  does not create another version bump.
- After a train is promoted, the next train starts with the next chosen SemVer
  value in a focused release-start PR.
- Git SHA remains the immutable build identity. The Prisma schema hash remains
  the exact deployed schema identity. `DataMigrationRun` remains the record of
  which persisted-data rewrites ran in each environment.

This keeps the existing single application release version and avoids adding a
second schema-version file or automatic version bumps for Prisma diffs.

## Current Repository Transition

The existing `develop` branch `VERSION` is `0.1.24`; it becomes the active
release-train identifier. Work that is intended to ship in this train keeps
`0.1.24`, including compatible schema changes and any required
`scripts/data-migrations/v0.1.24/` entries.

Historical bumps and migration directories remain unchanged. The repository
does not renumber or combine earlier releases. Once `0.1.24` is promoted, the
next train starts at `0.1.25` unless the team deliberately selects a different
higher SemVer value.

## Release Lifecycle

### Start a train

After the preceding train is promoted and branch ancestry is synchronized, a
focused PR targeting `develop` changes root `VERSION` to a higher SemVer value.
Its release decision identifies the new train. Product behavior, Prisma
changes, and data migrations should not be bundled into this release-start PR.

The temporary state where `develop` and `main` contain the same already
promoted version is a boundary between trains, not permission to append new
release data to the old version.

### Build the train

All PRs intended for the open train retain the root version. A Prisma change
does not cause a version bump by itself. PRs that touch persisted schema or data
must still provide an explicit `Release decision:` and state whether the change
requires only `db:push`, a durable data migration, or a staged compatibility
transition.

### Promote the train

The `develop` to `main` promotion carries the already selected version and all
registered migrations for that train. The promotion PR does not edit
`VERSION`. Deployment workflows continue to build and deploy immutable Git SHA
or digest references while reporting the train version as release metadata.

### Open the next train

After promotion, no new migration or persisted behavior is assigned to the
released version. The next release-start PR raises `VERSION` once, and all work
for that train shares the new value.

## Change Classification

| Change | VERSION decision | Required persisted-data action |
|---|---|---|
| Code-only behavior with no persisted contract change | Keep the open train version | None |
| Compatible additive Prisma schema change | Keep the open train version | Non-destructive `db:push`; no migration when no stored rows need rewriting |
| Backfill or persisted semantic rewrite for the open train | Keep the open train version | Add an idempotent migration under `scripts/data-migrations/v<VERSION>/` |
| New persisted rewrite after that version was promoted | Start the next train first | Add the migration only under the new train version |
| Destructive or backward-incompatible schema change | Keep each affected train version; do not bump per step | Use expand, backfill, and contract stages across one or more release trains |
| Dev-data fixture or baseline workflow change | Keep the open train version unless it starts a new train | Record the explicit release/data decision and update its owner runbook |

Deleting or renaming a field is not made safe by increasing `VERSION`. The old
and new application slots may overlap during blue-green deployment, so
incompatible changes require a compatibility sequence and a rollback decision
independent of the train number.

## PR Release Decisions

Persisted schema/data PRs use one of these concrete forms:

```text
Release decision: keep VERSION 0.1.24; compatible db:push only, no data backfill
Release decision: keep VERSION 0.1.24; add registered v0.1.24 data migration <id>
Release decision: keep VERSION 0.1.24; expand step, old and new runtimes remain compatible
```

A release-start PR uses:

```text
Release decision: start VERSION 0.1.25 release train after 0.1.24 promotion
```

A promotion PR uses:

```text
Release decision: promote develop VERSION 0.1.24 to main; no additional version bump
```

The PR checker continues to require a non-placeholder decision for Prisma,
data-migration, baseline, and `VERSION` changes. It accepts compatible Prisma
changes without a version bump, requires newly added migration files to match
the current train, and verifies that a changed root version is valid and higher
than the base version. Promotion PRs may include the historical migration
versions accumulated since the prior `main` release.

## Data Migration Immutability

Every durable data migration remains registered in
`scripts/data-migrations/index.ts` and uses the open train version in its path,
`id`, and `releaseVersion`.

Once a train has reached `main`, its migration set is immutable. A correction
is a new idempotent migration in a later train; operators do not edit an
already applied migration or append a new migration to a released version.
Repeated deploys remain safe because the ledger records migration identity,
Git SHA, Prisma schema hash, status, and affected-row details.

## Historical Contract Tests

Tests that describe a past release must not require the repository's current
root `VERSION` to equal that historical version.

- `scripts/__tests__/run-data-migrations.spec.ts` will assert that historical
  release `0.1.22` has no registered data migration without asserting that the
  current root version is `0.1.22`.
- `scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs` will
  retain the historical `0.1.8` through `0.1.22` reconstruction contract while
  removing its current-root-version assertion.
- Registry tests continue to verify migration ID and `releaseVersion`
  consistency.
- PR checker tests cover compatible schema changes with no bump, monotonic
  release-start bumps, migration/current-train matching, and promotion of the
  accumulated historical migration range.

This fixes the current `0.1.22` versus `0.1.24` failure permanently. Replacing
the literal with `0.1.24` would only postpone the same failure until the next
train.

## Documentation and Runbook Ownership

- Root `AGENTS.md` states the concise release-train contract and links the
  durable procedure.
- A dedicated `docs/runbooks/release-train-versioning.md` runbook owns train
  start, PR classification, migration assignment, promotion, verification,
  blockers, and final reporting.
- `docs/runbooks/README.md`, staging and production deploy guidance, Prisma
  guidance, and the data-migration README link to the same authority instead of
  duplicating divergent rules.
- The runbook reflects the current `develop`/`main`, GitHub Actions, GHCR
  digest, Prisma `db push`, and versioned data-migration flow. It does not
  introduce a local deployment path.

## Error Handling and Blockers

Stop the train or PR when any of these conditions holds:

- the proposed release-start version is not valid SemVer or is not higher than
  the base version;
- feature work is about to merge while `develop` still uses a version already
  promoted to `main`;
- a new data migration targets a version that has already reached `main`;
- a migration path, migration `id`, `releaseVersion`, and registry import do not
  agree;
- a destructive Prisma change lacks an expand/backfill/contract and rollback
  decision;
- a promotion PR changes `VERSION` instead of carrying the version already
  assembled on `develop`;
- the PR body omits or leaves the release decision as a placeholder.

## Verification

Implementation is complete when all of these pass:

```bash
rtk npm run test:scripts
rtk npm run check:scripts-inventory
rtk npm run check:agents-hygiene
rtk npm run check:conventions
rtk git diff --check
```

Focused tests must prove that current-root version changes no longer break
historical release contracts and that a compatible schema-only PR may retain
the active train version.

## Non-Goals

- No package-local version becomes a deploy boundary.
- No independent schema version or database version file is added.
- No automatic SemVer bump is inferred from a Prisma diff.
- No historical release or migration directory is renumbered.
- No deployment workflow, database mutation order, or blue-green rollback
  boundary changes as part of this policy cleanup.
