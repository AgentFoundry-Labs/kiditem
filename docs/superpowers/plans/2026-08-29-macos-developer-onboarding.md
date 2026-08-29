# macOS Developer Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fresh macOS clone reproducibly runnable through authenticated Dashboard and Codex Agent OS using repository-owned setup, environment, and verification contracts.

**Architecture:** Keep local setup staged: deterministic files and protected Gateway state are automated, while schema mutation, local identity creation, and provider login remain explicit commands. README is the short entrypoint; dedicated runbooks and checked-in examples are the detailed authority.

**Tech Stack:** Node.js 22/npm 10, TypeScript/Node scripts, Bash interactive wrappers, Prisma/PostgreSQL, Docker Compose, NestJS, Next.js, native Codex/Claude Gateway.

---

### Task 1: Lock the developer-onboarding contract

**Files:**
- Create: `.nvmrc`
- Create: `scripts/__tests__/developer-onboarding-contract.test.mjs`
- Modify: `.env.example`
- Modify: `apps/server/.env.example`
- Modify: `agents/.env.example`
- Modify: `docker-compose.yml`
- Modify: `.github/workflows/pr-checks.yml`

- [x] **Step 1: Write the failing repository contract test**

Assert that `.nvmrc` is an exact Node 22 version, root/server DB URLs match the
Compose credentials and port, Compose images are pinned, the local server
example has no Office CDP hostname, Python provider keys are blank, the Windows
install job supplies a non-secret Prisma generate URL, and the README invokes
setup before dependency-driven Prisma generation.

- [x] **Step 2: Run the contract test and confirm RED**

Run: `rtk node --test scripts/__tests__/developer-onboarding-contract.test.mjs`

Expected: FAIL on the missing Node pin and current env/Compose/README drift.

- [x] **Step 3: Apply the minimal example and CI fixes**

Use `postgresql://kiditem:kiditem@localhost:5433/kiditem` in local examples,
blank local `SOURCING_PLAYWRIGHT_CDP_ENDPOINT`, add the dedicated sourcing
profile variables, pin the verified PostgreSQL/MinIO release tags, and provide
only a non-secret loopback `DATABASE_URL` to the Windows `npm ci` step.

- [x] **Step 4: Re-run the contract and Compose validation**

Run:

```bash
rtk node --test scripts/__tests__/developer-onboarding-contract.test.mjs
rtk docker compose config --quiet
```

Expected: PASS.

### Task 2: Add idempotent macOS file and Gateway setup

**Files:**
- Create: `scripts/setup-macos-development.mjs`
- Create: `scripts/local-agent-gateway.mjs`
- Create: `scripts/__tests__/setup-macos-development.spec.ts`
- Create: `scripts/__tests__/local-agent-gateway.spec.ts`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `scripts/README.md`
- Modify: `package.json`
- Modify: `bin/dev-bootstrap.sh`

- [x] **Step 1: Write failing setup and Gateway command tests**

Exercise exported helpers against temporary directories. Require example-copy
without overwrite, a 43-character token, 0700 directories, 0600 files, absolute
config paths, an isolated `provider-home`, one env-key update, idempotent rerun,
and provider/start commands that resolve only bundled entrypoints.

- [x] **Step 2: Run focused tests and confirm RED**

Run: `rtk npm exec vitest -- run --config scripts/vitest.config.ts scripts/__tests__/setup-macos-development.spec.ts scripts/__tests__/local-agent-gateway.spec.ts`

Expected: FAIL because the setup modules do not exist.

- [x] **Step 3: Implement the minimal setup modules**

`setup-macos-development.mjs` uses Node built-ins only so it can execute before
`npm install`. It creates missing env files, generates/preserves the protected
Gateway material, patches only `KIDITEM_AGENT_GATEWAY_TOKEN_FILE`, installs Git
hooks, and installs locked dependencies only when `node_modules` is absent.

`local-agent-gateway.mjs` supports exact `login codex`, `login claude`, and
`start` subcommands against the generated config. It never accepts alternate
executables, workspace paths, or raw shell commands.

- [x] **Step 4: Wire package commands and retire the stale wrapper behavior**

Add `setup:macos`, `gateway:login:codex`, `gateway:login:claude`, `dev:core`,
`dev:gateway`, and make `dev:all` run Web, API/worker, and Gateway. Keep
`dev:agents` optional. Make `bin/dev-bootstrap.sh` a compatibility forwarder to
the repository-owned setup entrypoint rather than a second implementation.

- [x] **Step 5: Verify setup and inventory GREEN**

Run:

```bash
rtk npm run test:scripts
rtk npm run check:scripts-inventory
```

Expected: PASS, with no token value in output.

### Task 3: Add explicit fresh-database login bootstrap

**Files:**
- Create: `scripts/bootstrap-local-auth-user.ts`
- Create: `scripts/__tests__/bootstrap-local-auth-user.spec.ts`
- Create: `bin/bootstrap-local-auth-user.sh`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `scripts/README.md`
- Modify: `package.json`

- [x] **Step 1: Write the failing local-auth bootstrap tests**

Require loopback/non-production DB validation; strict `--email`, `--name`,
`--organization-name`, optional slug, and `--password-stdin`; normalized email
and slug; one Organization/User/Membership upsert plan; admin active membership;
password hashing; and revocation of existing sessions. Reject password argv.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `rtk npm exec vitest -- run --config scripts/vitest.config.ts scripts/__tests__/bootstrap-local-auth-user.spec.ts`

Expected: FAIL because the bootstrap does not exist.

- [x] **Step 3: Implement local-only idempotent bootstrap and prompt wrapper**

The TypeScript entrypoint uses Prisma in one transaction and imports the
existing auth password hasher. The Bash wrapper reads and confirms a password
without echo, then sends exactly one line on stdin. Neither layer creates an
AuthSession or prints a hash/database URL.

- [x] **Step 4: Verify focused scripts GREEN**

Run:

```bash
rtk npm run test:scripts
rtk npm run check:scripts-inventory
```

Expected: PASS.

### Task 4: Make Gateway startup failures actionable but secret-safe

**Files:**
- Modify: `apps/agent-gateway/src/main.spec.ts`
- Modify: `apps/agent-gateway/src/main.ts`

- [x] **Step 1: Add a failing startup-reporting regression test**

Require known `gateway_*` error codes to be printed, unknown errors to collapse
to `gateway_start_failed`, and secret/path-bearing messages never to be emitted.

- [x] **Step 2: Run and confirm RED**

Run: `rtk npm exec --workspace=apps/agent-gateway vitest -- run src/main.spec.ts`

Expected: FAIL because the current top-level catch is silent.

- [x] **Step 3: Implement the bounded error projection and verify GREEN**

Export a pure formatter used by the CLI catch. Allow only
`/^gateway_[a-z0-9_]+$/`; return `gateway_start_failed` otherwise.

Run: `rtk npm exec --workspace=apps/agent-gateway vitest -- run src/main.spec.ts`

Expected: PASS.

### Task 5: Rewrite the human setup and environment documentation

**Files:**
- Create: `docs/runbooks/local-development.md`
- Modify: `README.md`
- Modify: `docs/runbooks/README.md`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/runbooks/auth-office-local.md`
- Modify: `docs/TESTING.md`

- [x] **Step 1: Expand the contract test with required documentation links and auth facts**

Require README to link the local-development and environment runbooks; the
runbook index to include Local Development and Interaction Platform; auth docs
to state HttpOnly cookie plus explicit extension handoff; and stale
`MasterProduct.currentStock`, JavaScript-readable browser token, missing import
runbook, and Claude-only AI stack claims to be absent.

- [x] **Step 2: Run and confirm RED**

Run: `rtk node --test scripts/__tests__/developer-onboarding-contract.test.mjs`

Expected: FAIL on stale documentation.

- [x] **Step 3: Write the concise README and executable local runbook**

Document fresh clone, Node selection, setup, Docker/schema, user bootstrap,
isolated Codex login, core/full start, ports, optional Python, shared dev data,
reset/blockers, and exact verification commands. Do not include real emails,
passwords, tokens, organization UUIDs, or provider output.

- [x] **Step 4: Organize environment variables by runtime profile**

Add explicit macOS core, macOS Agent OS, optional Python, and Windows Office
tables. For each file list owner, required local keys, optional feature keys,
secret status, and injection path. State that Gateway JSON/token/login state is
not an env file or PostgreSQL session.

- [x] **Step 5: Correct auth and data ownership text and verify GREEN**

Update auth documentation to the current cookie/me/extension-handoff contract,
correct Sellpia inventory ownership, link the actual Drive runbook, and include
the Interaction Platform runbook in the index.

Run: `rtk node --test scripts/__tests__/developer-onboarding-contract.test.mjs`

Expected: PASS.

### Task 6: Run deterministic and packaging gates

**Files:**
- Modify: `docs/superpowers/plans/2026-08-29-macos-developer-onboarding.md`

- [x] **Step 1: Run focused and repository contract gates**

```bash
rtk npm run test:scripts
rtk npm run check:scripts-inventory
rtk npm run check:agents-hygiene
rtk docker compose config --quiet
```

- [x] **Step 2: Run build gates**

```bash
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/agent-gateway
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

- [x] **Step 3: Verify a non-destructive temporary setup fixture**

Run the setup helpers against a temporary repository/home fixture, verify modes
and config values, rerun for idempotency, and confirm captured output contains
no bearer. Do not push schema to the existing developer database.

- [x] **Step 4: Record exact results and blockers**

Update this plan with the commands and outcomes. Report any existing local DB
schema mismatch separately from onboarding code and do not use
`--accept-data-loss` outside an isolated QA database.

## Verification Evidence (2026-08-29)

- `rtk npm run test:scripts`: PASS — 28 Vitest files/161 tests and 220 Node
  tests passed; one Windows-only test skipped. The existing Vite native-loader
  migration warning is non-blocking.
- `rtk npm run check:scripts-inventory`: PASS.
- `rtk npm run check:agents-hygiene`: PASS.
- `rtk npm run check:conventions`: PASS, including Agent OS contraction,
  hexagonal ownership, schema artifact, tenant scope, and frontend DB gates.
- `rtk docker compose config --quiet`: PASS with pinned PostgreSQL/MinIO images.
- `rtk npm run build --workspace=packages/shared`: PASS.
- `rtk npm run build --workspace=apps/agent-gateway`: PASS after the shared
  build completed.
- `rtk npm run build --workspace=apps/server`: PASS.
- `rtk npm run build --workspace=apps/web`: PASS; 49 routes generated.
- Temporary-directory setup and Gateway tests verified missing-file-only copy,
  mode `0700`/`0600`, stable rerun, absolute config, isolated provider home,
  malformed-token rejection, strict bundled entrypoints, and no secret output.
- A separate local Git clone with an isolated temporary `HOME` ran the public
  `npm run setup:macos` command from zero dependencies: `npm ci` installed the
  lockfile, Prisma Client generated, all three core env files appeared, and the
  checkout stayed Git-clean. A second `--skip-install` run was idempotent. The
  generated config had the exact six keys and absolute paths; Gateway root,
  state, and provider home were `0700`, while config and token were `0600`.
- Fresh install reported the unchanged lockfile's existing npm-audit inventory
  of 15 findings (7 low, 8 high). This is a dependency-security backlog, not a
  setup failure; no dependency range or lockfile was changed in this task.
- Public `--help` smoke checks passed for macOS setup, local Gateway, and local
  auth bootstrap entrypoints.
- The installed Codex `login --help` and Claude `auth login --help` command
  shapes both matched the strict local launcher plans; no live Claude login was
  required.
- No Prisma schema changed, so the existing developer database was not mutated
  and `--accept-data-loss` was not used.

The first attempt to run all workspace builds concurrently exposed a build
orchestration race: `packages/shared` cleans `dist` while Gateway resolves its
chunks. The documented and required sequential order (shared, Gateway, server,
web) passed completely; no runtime code change was needed.
