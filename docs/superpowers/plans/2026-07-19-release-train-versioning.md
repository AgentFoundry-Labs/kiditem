# Release Train Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make root `VERSION` change once per release train, permanently decouple historical release tests from the current version, and align the PR guard and operator runbooks with that policy.

**Architecture:** Keep the existing root `VERSION`, Git SHA image identity, Prisma schema hash, and `DataMigrationRun` ledger. Change only the policy boundary: compatible schema and persisted-data work joins the open train, while the next version opens after promotion. A focused PR guard enforces monotonic release-start changes; historical tests assert historical facts without pinning the repository's current version.

**Tech Stack:** Node.js ESM scripts, Node test runner, Vitest, Markdown runbooks, repository `AGENTS.md` conventions

## Global Constraints

- Root `VERSION` remains exactly `0.1.24` during this implementation; this work does not open a new release train.
- Root `VERSION` identifies one deployable release train, not an individual feature or Prisma diff.
- Compatible schema-only changes keep the open train version and record `db:push only, no data backfill` in the PR release decision.
- New data migrations use `scripts/data-migrations/v<VERSION>/`; migrations already promoted to `main` are immutable.
- Destructive schema changes still require expand, backfill, and contract staging; a version bump is not a rollback mechanism.
- Git SHA remains the immutable build identity, and Prisma schema hash remains the exact schema identity.
- Preserve all pre-existing worktree changes. Stage only the files named by the current task, except that the already-approved same-session optimization edits in root `AGENTS.md` remain in that file.
- Prefix shell commands with `rtk`.

---

## File Structure

### Tests and guard

- Modify `scripts/__tests__/run-data-migrations.spec.ts`: assert the historical `0.1.22` migration fact without reading root `VERSION`.
- Modify `scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs`: keep the historical rebuild contract without requiring current root `VERSION` to be `0.1.22`.
- Modify `scripts/__tests__/check-pr-release-contract.test.mjs`: lock compatible no-bump behavior and monotonic release-start behavior.
- Modify `scripts/check-pr-release-contract.mjs`: compare changed `VERSION` against the base ref for every PR while preserving promotion migration-range behavior.

### Durable policy and operations

- Modify `AGENTS.md`: replace the ambiguous per-change bump wording with the concise release-train contract.
- Create `docs/runbooks/release-train-versioning.md`: own train start, PR classification, migration assignment, promotion, blockers, verification, and final reporting.
- Modify `docs/runbooks/README.md`: index the new runbook.
- Modify `docs/runbooks/staging-deploy.md`: point release selection to the new authority and clarify that deployment does not bump the version.
- Modify `docs/runbooks/production-deploy.md`: point production promotion/deploy to the same authority.
- Modify `prisma/AGENTS.md`: connect compatible schema changes and data rewrites to the open train.
- Modify `scripts/data-migrations/README.md`: document open-train assignment and released-migration immutability.

---

### Task 1: Decouple Historical Release Contracts From Current VERSION

**Files:**

- Modify: `scripts/__tests__/run-data-migrations.spec.ts:1-59`
- Modify: `scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs:124-145`
- Test: `scripts/__tests__/run-data-migrations.spec.ts`
- Test: `scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs`

**Interfaces:**

- Consumes: `dataMigrations: DataMigration[]` and the static migration registry source.
- Produces: durable historical invariants for releases `0.1.8`, `0.1.19`, `0.1.21`, and `0.1.22` that do not depend on the current root version.

- [ ] **Step 1: Reproduce both stale-version failures**

```bash
rtk npx vitest run --config scripts/vitest.config.ts scripts/__tests__/run-data-migrations.spec.ts
rtk node --test scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
```

Expected: both commands fail because root `VERSION` is `0.1.24` while the tests expect `0.1.22`.

- [ ] **Step 2: Rewrite the data-migration registry test as a historical invariant**

Remove the `node:fs` and `node:path` imports and the `repoRoot` constant from `scripts/__tests__/run-data-migrations.spec.ts`. Replace the test at line 42 with:

```ts
it("keeps historical release 0.1.22 migration-free", () => {
  const releaseVersions = dataMigrations.map(
    (migration) => migration.releaseVersion,
  );

  expect(releaseVersions).toContain("0.1.19");
  expect(releaseVersions).toContain("0.1.21");
  expect(releaseVersions).not.toContain("0.1.22");
  for (const migration of dataMigrations) {
    expect(migration.id.startsWith(`v${migration.releaseVersion}:`)).toBe(
      true,
    );
  }
});
```

Keep `normalizeReleaseVersion` imported because the malformed-version unit test still exercises it.

- [ ] **Step 3: Remove only the current-root assertion from the Sellpia historical test**

In `scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs`, keep the test title and all migration-registry and removed-directory assertions, but delete:

```js
assert.equal(
  readFileSync(join(repoRoot, "VERSION"), "utf8").trim(),
  "0.1.22",
);
```

Do not remove `readFileSync`, `join`, or `repoRoot`; the file uses them elsewhere.

- [ ] **Step 4: Run both focused tests**

```bash
rtk npx vitest run --config scripts/vitest.config.ts scripts/__tests__/run-data-migrations.spec.ts
rtk node --test scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
```

Expected: both commands pass, and no assertion compares root `VERSION` with `0.1.22`.

- [ ] **Step 5: Commit the historical-test correction**

```bash
rtk git add scripts/__tests__/run-data-migrations.spec.ts scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
rtk git commit -m "test: decouple historical release contracts"
```

### Task 2: Enforce Monotonic Release-Train Starts

**Files:**

- Modify: `scripts/__tests__/check-pr-release-contract.test.mjs:34-81`
- Modify: `scripts/check-pr-release-contract.mjs:169-237`
- Test: `scripts/__tests__/check-pr-release-contract.test.mjs`

**Interfaces:**

- Consumes: `files`, `rootVersion`, `baseVersion`, PR body, migration index, and promotion metadata supplied to `analyzePrReleaseContract`.
- Produces: an error when a PR changes `VERSION` without increasing it over the base; unchanged compatible-schema PRs remain valid.

- [ ] **Step 1: Add failing monotonic-version tests**

Append before the promotion test:

```js
test('accepts a higher VERSION when starting a release train', () => {
  const result = analyzePrReleaseContract({
    files: ['VERSION'],
    prBody: 'Release decision: start VERSION 0.1.2 release train after 0.1.1 promotion\n',
    rootVersion: '0.1.2',
    baseVersion: '0.1.1',
    migrationIndex: '',
  });

  assert.deepEqual(result.errors, []);
});

test('rejects a VERSION change that does not increase the base version', () => {
  for (const rootVersion of ['0.1.1', '0.1.0']) {
    const result = analyzePrReleaseContract({
      files: ['VERSION'],
      prBody: `Release decision: start VERSION ${rootVersion} release train\n`,
      rootVersion,
      baseVersion: '0.1.1',
      migrationIndex: '',
    });

    assert.match(
      result.errors.join('\n'),
      /must be higher than base VERSION 0\.1\.1/,
    );
  }
});
```

- [ ] **Step 2: Run the guard test and confirm the rejection fails**

```bash
rtk node --test scripts/__tests__/check-pr-release-contract.test.mjs
```

Expected: the rejection test fails because `analyzePrReleaseContract` does not yet compare a changed root version with the base version.

- [ ] **Step 3: Add the monotonic VERSION guard**

Immediately after root SemVer validation in `scripts/check-pr-release-contract.mjs`, add:

```js
if (
  files.includes('VERSION') &&
  isSemver(version) &&
  isSemver(base) &&
  compareSemver(version, base) <= 0
) {
  errors.push(
    `Root VERSION ${version} must be higher than base VERSION ${base} when VERSION changes.`,
  );
}
```

This applies only when `VERSION` is in the changed-file set. A compatible Prisma PR that keeps the active version does not trigger it.

- [ ] **Step 4: Supply the base VERSION for normal and promotion PRs**

In `main()`, replace:

```js
baseVersion: allowHistoricalMigrationVersions ? readVersionAtRef(base) : '',
```

with:

```js
baseVersion: readVersionAtRef(base),
```

Keep `allowHistoricalMigrationVersions` unchanged so promotion PRs still accept the accumulated migration range.

- [ ] **Step 5: Run the focused guard test**

```bash
rtk node --test scripts/__tests__/check-pr-release-contract.test.mjs
```

Expected: all tests pass, including compatible no-bump schema work, higher release-start versions, rejected unchanged/decreasing versions, migration folder matching, and promotion ranges.

- [ ] **Step 6: Commit the PR guard**

```bash
rtk git add scripts/check-pr-release-contract.mjs scripts/__tests__/check-pr-release-contract.test.mjs
rtk git commit -m "chore: enforce release train version progression"
```

### Task 3: Publish the Release-Train Runbook and Scoped Rules

**Files:**

- Create: `docs/runbooks/release-train-versioning.md`
- Modify: `docs/runbooks/README.md`
- Modify: `docs/runbooks/staging-deploy.md:351-353`
- Modify: `docs/runbooks/production-deploy.md:76-94`
- Modify: `AGENTS.md:97-106`
- Modify: `prisma/AGENTS.md:99-115`
- Modify: `scripts/data-migrations/README.md:7-27`

**Interfaces:**

- Consumes: protected `develop`/`main`, root `VERSION`, PR `Release decision:`, Prisma `db push`, versioned data migrations, GitHub Actions promotions, and immutable image refs.
- Produces: one operational authority plus concise links from scoped guides and deployment runbooks.

- [ ] **Step 1: Replace the ambiguous root release rule**

Replace root `AGENTS.md` `Release + Data` with:

```markdown
## Release + Data

- Root [`VERSION`](VERSION) identifies the active deployable release train, not
  an individual feature or schema diff. Open a higher SemVer once after the
  prior train is promoted; all PRs in the open train keep that version.
- Package-local `version` fields are package metadata, not release boundaries.
- Compatible schema-only changes keep the open train version and record the
  exact `db:push` / backfill decision in the PR `Release decision:` field.
- Durable data migrations live under
  `scripts/data-migrations/v<VERSION>/<sequence>_<name>.ts`. Once a train has
  reached `main`, its migration set is immutable; corrections use a later
  train.
- Pulling code does not update the DB; see
  [`prisma/AGENTS.md`](prisma/AGENTS.md#data--migration-flow). Follow
  [`docs/runbooks/release-train-versioning.md`](docs/runbooks/release-train-versioning.md)
  to start, build, and promote a train.
```

Preserve the existing same-session instruction-chain and `CLAUDE.md` hygiene edits elsewhere in root `AGENTS.md`.

- [ ] **Step 2: Create the AI-executable runbook**

Create `docs/runbooks/release-train-versioning.md` with:

```markdown
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
4. Use `Release decision: start VERSION 0.1.25 release train after 0.1.24 promotion`.
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
3. Make `id` start with `v<VERSION>:` and set `releaseVersion` to the same value without `v`.
4. Register the exact module in `scripts/data-migrations/index.ts`.
5. Run the migration twice against the intended non-production test target and confirm the second run is a safe no-op or ledger skip.
6. Record affected-row and rollback/blocker evidence in the PR.

Never edit an applied migration. A correction is a new idempotent migration in a later train.

## Promote The Train

1. Confirm the promotion diff, commit count, and merge ancestry are expected.
2. Keep the `develop` root `VERSION`; do not bump it in the promotion PR.
3. Use `Release decision: promote develop VERSION 0.1.24 to main; no additional version bump`.
4. Run both PR contract guards against `origin/main` and `HEAD`.
5. Verify all migrations accumulated after the prior `main` version are registered and deployable in order.
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
PR body through the live PR or supported body/event input.

## Blockers

- The new train version is invalid SemVer or is not higher than the base.
- `develop` still equals the version already promoted to `main` when feature work is ready to merge.
- A new migration targets a version already present on `main`.
- Migration path, `id`, `releaseVersion`, or registry import disagree.
- A destructive change lacks expand/backfill/contract or rollback evidence.
- A promotion PR edits `VERSION` instead of carrying the assembled train.
- The PR release decision is blank, placeholder text, or inconsistent with the changed files.

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
```

The angle-bracket fields are explicit operator inputs, not values to copy literally.

- [ ] **Step 3: Link the runbook from the index and deploy guides**

Add to `docs/runbooks/README.md` near deployment entries:

```markdown
- [Release Train Versioning](release-train-versioning.md) — open one root
  `VERSION` per deployable train, classify schema/data work, assign durable
  migrations, and promote the assembled train without another bump.
```

After the root-version paragraph in `docs/runbooks/staging-deploy.md`, add:

```markdown
Select and advance that value through the
[Release Train Versioning](release-train-versioning.md) runbook. A staging
deployment reports the already assembled train version; deployment itself does
not bump it. Git SHA and digest refs remain the exact runtime identity.
```

At the start of `docs/runbooks/production-deploy.md` `Deploy`, add:

```markdown
The promoted commit already contains the selected release-train `VERSION`.
Follow [Release Train Versioning](release-train-versioning.md) before promotion;
the production workflow reports that version and does not change it.
```

- [ ] **Step 4: Align Prisma and data-migration scoped guidance**

After the commands in `prisma/AGENTS.md` `Data + Migration Flow`, add:

```markdown
Compatible schema changes share the open root release-train `VERSION`; they do
not bump it per Prisma diff. Use a versioned data migration only when persisted
rows need an idempotent rewrite. Never append a new migration to a train already
promoted to `main`; open the next train first. See
[`docs/runbooks/release-train-versioning.md`](../docs/runbooks/release-train-versioning.md).
```

After the introduction in `scripts/data-migrations/README.md`, add:

```markdown
## Release Train Assignment

Root `VERSION` is the open deployable release train. Multiple compatible schema
and data PRs may share it; do not bump it for each migration. A migration added
before promotion uses the open train version in its directory, `id`, and
`releaseVersion`. Once that train reaches `main`, its migration set is
immutable. Fixes use a new idempotent migration in the next train. Follow
[`docs/runbooks/release-train-versioning.md`](../../docs/runbooks/release-train-versioning.md).
```

- [ ] **Step 5: Run documentation and convention gates**

```bash
rtk npm run check:agents-hygiene
rtk npm run check:conventions
rtk git diff --check
```

Expected: all checks pass; active `AGENTS.md` chains remain under the repository limit.

- [ ] **Step 6: Commit the policy and runbook**

Review root `AGENTS.md` before staging because it contains approved same-session optimization edits. Do not stage unrelated `docs/runbooks/channel-sellpia-matching.md` or unrelated `CLAUDE.md` shims in this commit.

```bash
rtk git add AGENTS.md prisma/AGENTS.md scripts/data-migrations/README.md docs/runbooks/README.md docs/runbooks/release-train-versioning.md docs/runbooks/staging-deploy.md docs/runbooks/production-deploy.md
rtk git diff --cached --check
rtk git commit -m "docs: adopt release train versioning"
```

### Task 4: Run Full Repository-Automation Verification

**Files:**

- Verify: all files changed in Tasks 1-3
- Do not modify: `VERSION`

**Interfaces:**

- Consumes: historical-contract tests, PR release guard, scoped instructions, and release-train runbook.
- Produces: evidence that the original stale-current-version failure is gone and the policy is internally consistent.

- [ ] **Step 1: Run the complete script suite**

```bash
rtk npm run test:scripts
```

Expected: all Vitest and Node script tests pass, including both formerly pinned historical tests.

- [ ] **Step 2: Run inventory and convention gates**

```bash
rtk npm run check:scripts-inventory
rtk npm run check:agents-hygiene
rtk npm run check:conventions
```

Expected: all commands exit zero.

- [ ] **Step 3: Prove there is no current-root historical pin**

```bash
rtk rg -n -U 'readFileSync\([^)]*VERSION[^)]*\)[\s\S]{0,120}0\.1\.22|rootVersion\)\.toBe\("0\.1\.22"\)' scripts/__tests__
```

Expected: no matches. Historical `0.1.22` literals may remain where they assert migration history.

- [ ] **Step 4: Verify the release value and final diff**

```bash
rtk git diff --check
rtk git status --short
rtk git diff -- VERSION
```

Expected: no whitespace errors, `VERSION` has no diff and remains `0.1.24`, and only known files are modified or untracked.

- [ ] **Step 5: Report completion evidence**

```text
Train: 0.1.24
Policy: one VERSION per release train
Historical contract tests: pass without current-root pin
PR release guard: compatible no-bump accepted; non-increasing bump rejected
Runbook: linked from root, Prisma, migration, staging, and production guidance
Verification: <exact command results>
Unrelated worktree changes preserved: <paths or count>
```
