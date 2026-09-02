# Staging Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reversible, durable staging retirement operation that stops every KidItem staging container, blocks deploy and rollback while retired, and exposes evidence through GitHub Actions without deleting EC2, volumes, configuration, or data.

**Architecture:** The EC2 host owns the authoritative retirement marker at `deployments/retired.json`. The supported remote script writes that marker atomically before stopping the seven Compose services, refuses all future `deploy` calls while the marker exists, and restores only after an exact confirmation and a healthy restart. GitHub Actions exposes guarded `retire` and `restore` operations and verifies both remote state and public unavailability.

**Tech Stack:** Bash, Docker Compose, GitHub Actions YAML, Node.js built-in test runner, Markdown runbooks.

## Global Constraints

- Retirement applies only when `DEPLOY_ENVIRONMENT=staging`; the production wrapper must never expose this operation.
- Retirement must not run `docker compose down`, delete Docker volumes, delete `/opt/kiditem`, delete EC2 resources, or alter the database.
- The exact retired service set is `api-blue web-blue worker-blue api-green web-green worker-green nginx`.
- The durable marker is `$DEPLOYMENTS_DIR/retired.json` and must be written atomically before services are stopped.
- Every `deploy` invocation, including rollback, must fail before image pull, migration, seed, or `compose up` while the marker exists.
- Retirement requires `ALLOW_STAGING_RETIRE=RETIRE_STAGING`; restore requires `ALLOW_STAGING_RESTORE=RESUME_RETIRED_STAGING`.
- Restore keeps the retirement marker until the previously active slot and public endpoint are healthy.
- GitHub workflow dispatch identity remains bound to the full 40-character SHA and UUID correlation ID.

---

### Task 1: Durable remote retirement guard

**Files:**
- Create: `scripts/__tests__/staging-retirement-contract.test.mjs`
- Modify: `deploy/staging/remote-deploy.sh`

**Interfaces:**
- Consumes: existing `compose()`, `resume()`, `status()`, `DEPLOYMENTS_DIR`, and `DEPLOY_ENVIRONMENT` behavior in `deploy/staging/remote-deploy.sh`.
- Produces: commands `retire` and `restore`; `RETIREMENT_LOCK_FILE`; `assert_not_retired()` called by `deploy()`; retirement evidence printed by `status()`.

- [ ] **Step 1: Write the failing remote-script contract tests**

Add Node built-in tests that read `deploy/staging/remote-deploy.sh` and assert:

```js
assert.match(remote, /RETIREMENT_LOCK_FILE=.*retired\.json/);
assert.match(remote, /ALLOW_STAGING_RETIRE.*RETIRE_STAGING/);
assert.match(remote, /ALLOW_STAGING_RESTORE.*RESUME_RETIRED_STAGING/);
assert.match(remote, /compose stop api-blue web-blue worker-blue api-green web-green worker-green nginx/);
assert.match(remote, /deploy\(\)[\s\S]*assert_not_retired/);
assert.match(remote, /retire\)\n\s+retire/);
assert.match(remote, /restore\)\n\s+restore/);
assert.doesNotMatch(extractRetireFunction(remote), /compose down|docker volume|rm -rf/);
```

The test must also verify that `retire()` rejects non-staging environments, writes the marker before `compose stop`, `restore()` calls `resume` before removing the marker, and `status()` displays the marker.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test scripts/__tests__/staging-retirement-contract.test.mjs
```

Expected: FAIL because the remote script has no retirement marker, commands, or deploy guard.

- [ ] **Step 3: Implement minimal retirement behavior**

In `deploy/staging/remote-deploy.sh`:

- Declare `RETIREMENT_LOCK_FILE="${RETIREMENT_LOCK_FILE:-$DEPLOYMENTS_DIR/retired.json}"`.
- Extend `usage()` with `retire` and `restore`.
- Add `require_staging_retirement_operation()`, `assert_not_retired()`, an atomic JSON marker writer using Python, `retire()`, and `restore()`.
- Invoke `assert_not_retired` at the start of `deploy()` before Docker login, image pulls, database work, or candidate startup.
- Make `retire()` validate the exact confirmation, write GitHub run/SHA/correlation metadata without secrets, then stop the exact seven services.
- Make `restore()` validate the exact confirmation and existing marker, call `resume()`, and remove the marker only after health succeeds.
- Print marker contents or `not retired` in `status()`.
- Add command dispatch cases for `retire` and `restore`.

- [ ] **Step 4: Run remote-script verification and verify GREEN**

Run:

```bash
node --test scripts/__tests__/staging-retirement-contract.test.mjs
bash -n deploy/staging/remote-deploy.sh
shellcheck deploy/staging/remote-deploy.sh
```

Expected: all tests and static checks pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/__tests__/staging-retirement-contract.test.mjs deploy/staging/remote-deploy.sh
git commit -m "feat: add durable staging retirement guard"
```

---

### Task 2: Guarded GitHub Actions operator and runbooks

**Files:**
- Modify: `scripts/__tests__/staging-retirement-contract.test.mjs`
- Modify: `.github/workflows/staging-deploy.yml`
- Modify: `docs/runbooks/staging-deploy.md`
- Modify: `docs/runbooks/deployment-architecture.md`
- Modify: `tools/codex/skills/staging-deploy-operator/SKILL.md`

**Interfaces:**
- Consumes: Task 1 remote commands and exact confirmation environment variables.
- Produces: workflow operations `retire` and `restore`, a staging-environment job that syncs the supported script and invokes the remote command, operator commands, and verification rules.

- [ ] **Step 1: Extend the contract test and verify RED**

Add assertions that the workflow:

```js
assert.match(workflow, /- retire/);
assert.match(workflow, /- restore/);
assert.match(workflow, /retirement_confirmation/);
assert.match(workflow, /deploy\/staging\/remote-deploy\.sh retire/);
assert.match(workflow, /deploy\/staging\/remote-deploy\.sh restore/);
```

Also assert that the retirement job needs `identity_guard`, declares `environment: staging`, passes the exact confirmation only to the selected operation, does not need build jobs, prints remote `status`, and treats public HTTP 200 as retirement failure. Assert that the runbooks and operator skill document the durable marker, exact confirmation values, final status query, and no-data-deletion boundary.

Run:

```bash
node --test scripts/__tests__/staging-retirement-contract.test.mjs
```

Expected: FAIL because workflow and runbooks do not expose retirement.

- [ ] **Step 2: Add workflow inputs and retirement job**

In `.github/workflows/staging-deploy.yml`:

- Add `retire` and `restore` operation choices.
- Add optional string input `retirement_confirmation`.
- Add one job gated by `inputs.operation == 'retire' || inputs.operation == 'restore'`, with `needs: identity_guard`, `environment: staging`, checkout at the guarded SHA, SSH setup, sync of the supported remote script/assets, and a remote invocation that maps the confirmation to only `ALLOW_STAGING_RETIRE` or `ALLOW_STAGING_RESTORE`.
- Invoke remote `status` after the operation.
- For retirement, probe `${STAGING_URL}/login` and fail if it still returns HTTP 200; for restore, require the existing healthy public smoke contract.
- Do not add build, image-pull, migration, database reset, or tag steps to this job.

- [ ] **Step 3: Document operator boundaries and exact commands**

Update both runbooks and the project operator skill with exact `gh workflow run` examples for:

```text
operation=retire  retirement_confirmation=RETIRE_STAGING
operation=restore retirement_confirmation=RESUME_RETIRED_STAGING
```

Document `deployments/retired.json`, stopped services, deploy/rollback rejection, retained EC2/volumes/data/configuration, public probe expectations, and the separate later Terraform/Supabase destruction boundary.

- [ ] **Step 4: Run focused and full script verification**

Run:

```bash
node --test scripts/__tests__/staging-retirement-contract.test.mjs
node --test scripts/__tests__/guarded-authoritative-rebuild-workflow.test.mjs scripts/__tests__/product-pipeline-db-model-contract.test.mjs
npm run test:scripts
bash -n deploy/staging/remote-deploy.sh
shellcheck deploy/staging/remote-deploy.sh
git diff --check
```

Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/__tests__/staging-retirement-contract.test.mjs .github/workflows/staging-deploy.yml docs/runbooks/staging-deploy.md docs/runbooks/deployment-architecture.md tools/codex/skills/staging-deploy-operator/SKILL.md
git commit -m "ops: expose guarded staging retirement"
```

---

## Operational completion after landing on `main`

The controller, not an implementation subagent, performs these external steps after review and merge:

1. Dispatch `operation=retire` from the immutable `origin/main` SHA with `retirement_confirmation=RETIRE_STAGING` and a generated UUID correlation ID.
2. Watch the exact run selected by SHA plus correlation ID and inspect failed logs if needed.
3. Dispatch a separate `operation=status` run from the same immutable workflow SHA.
4. Confirm `deployments/retired.json` exists, all seven Compose services are stopped, and public `/login` is not HTTP 200.
5. Do not destroy Terraform or Supabase resources until Office local auth is implemented and verified.
