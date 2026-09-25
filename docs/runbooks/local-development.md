# Local Development (macOS)

This runbook brings a fresh macOS clone to an authenticated Dashboard and an
optional Codex-backed Agent OS. It is the executable local setup authority;
`README.md` contains only the short path.

## Supported Boundary

- Current development/support target: macOS.
- Local infrastructure: PostgreSQL and MinIO in Docker Desktop.
- Host processes: Next.js, NestJS, and the native Agent Gateway.
- Optional process: Python 3.11+ Agent helper server.
- Browser auth: HttpOnly `kiditem_session` cookie issued by Nest.
- Provider auth/history: isolated native CLI home under macOS Application
  Support, never PostgreSQL and never the normal Codex Desktop home.

Windows Office setup is separate. Follow [Office Deploy](office-deploy.md);
do not copy local env or Gateway paths to Office.

## Human Prerequisites

1. GitHub repository access.
2. Docker Desktop installed and running.
3. A Node version manager such as `nvm`, `fnm`, or `mise`.
4. For Agent OS live chat, an OpenAI account that can log into the bundled
   Codex CLI. Claude login is optional while no paid Anthropic subscription is
   available.
5. For shared screen data only, access to the team Google Drive development
   bundle.

Do not ask a teammate to send `.env`, a Gateway bearer, a provider home, or a
database dump through Git, chat, or a PR.

## 1. Clone And Select Node

```bash
git clone https://github.com/AgentFoundry-Labs/kiditem.git
cd kiditem
nvm install
nvm use
node --version
npm --version
```

`.nvmrc` recommends Node `22.23.2` as the reproducible local baseline.
`package.json` defines the supported runtime as Node `>=22.22.3 <23` and npm major
10; npm itself is pinned as `npm@10.9.8` in `packageManager`.

Setup requires Node 22.22.3 or later within major 22 for Nest 12's build tooling.
The native Gateway
train likewise validates Node major 22 while keeping bundled provider packages
exactly pinned.

## 2. Initialize Local Files

```bash
npm run setup:macos
```

This command runs before repository dependencies are required. It:

1. verifies macOS and the supported Node major;
2. creates `.env`, `apps/server/.env`, and `apps/web/.env.local` from committed
   examples only when missing;
3. creates the protected Gateway tree shown below;
4. writes only the Gateway token file path into `apps/server/.env`;
5. configures `.githooks`; and
6. runs `npm ci --legacy-peer-deps` only when `node_modules` is absent.

It never overwrites an existing env or valid token. An invalid existing token
is a blocker and is not silently rotated.

```text
~/Library/Application Support/KidItem/AgentGateway/
├── gateway-config.json       0600
├── secrets/                  0700
│   └── installation-token    0600
├── state/                    0700
└── provider-home/            0700
    └── .codex/               0700
```

The generated config contains absolute paths and exactly:

```json
{
  "controlOrigin": "http://127.0.0.1:4000",
  "tokenFile": "/absolute/path/to/installation-token",
  "stateRoot": "/absolute/path/to/state",
  "runtimeRoot": "/absolute/path/to/kiditem",
  "workspace": "/absolute/path/to/kiditem",
  "loginRoot": "/absolute/path/to/provider-home"
}
```

Paths in the actual file differ per user. The bearer value is not placed in
the JSON, env, logs, or docs.

Options:

```bash
npm run setup:macos -- --skip-install
npm run setup:macos -- --with-python-agents
npm run setup:macos -- --from-checkout /absolute/path/to/another/kiditem
```

`--from-checkout` is explicit and copies only missing env files. Prefer examples
for a new teammate; use this option only for the same developer's trusted local
worktrees.

## 3. Start Local Infrastructure And Apply Schema

```bash
docker compose up -d --wait
docker compose ps
npm run db:sync:local
```

Expected services:

- PostgreSQL 17.9 on `localhost:5433` with local-only
  `kiditem`/`kiditem` credentials.
- MinIO on `localhost:9000`; console on `localhost:9001`.
- An idempotent `kiditem` bucket initialization container that exits 0.

`db:sync:local` is explicit because it mutates the selected database. On a
fresh volume it creates the schema and then applies the data migrations
described [below](#sync-after-pulling-schema-or-data-migration-changes).
It never passes `--force-reset`. Do not pass `--accept-data-loss` for a
developer DB without first reviewing the statements it prints and getting
explicit approval. The previous authorization for isolated Testcontainer QA
does not apply here. The local QA database `kiditem-qa-pg` (port 5434) is
disposable for cutover rehearsal and QA under the
[data-loss policy](deployment-architecture.md#data-loss-policy).

The root and server `DATABASE_URL` values must both be:

```text
postgresql://kiditem:kiditem@localhost:5433/kiditem
```

### Sync After Pulling Schema Or Data-Migration Changes

Pulling code or generating the Prisma client applies neither schema nor data
migrations. Run the same command after every pull that changes `prisma/` or
`scripts/data-migrations/`. It applies the
[Office cutover order](operation-automation-cutover.md#approved-cutover-sequence)
to the developer database. Do not run `db push` first: a destructive push
drops columns that pre-schema migrations still read, and those migrations
then record `succeeded` over zero rows.

Prerequisites:

- `DATABASE_URL` in the root `.env` names a loopback host. The command refuses
  any other host, a database name containing `prod` or `staging`, and query
  parameters that override the host, port, database or credentials.
- Stop the API, workers and Gateway so nothing writes while the schema
  changes.
- For the automatic backup, Docker is running and exactly one container
  publishes the `DATABASE_URL` port (`kiditem-postgres` for 5433).

```bash
npm run db:sync:local -- --dry-run   # read-only preview
npm run db:sync:local
```

The command runs these steps in order and stops at the first one that fails:

1. Refuse a non-local target, and refuse Windows.
2. Build the `@kiditem/shared` JavaScript that the migration runner imports.
   Type declarations are left as they are; run
   `npm run build --workspace=packages/shared` when you need fresh ones.
3. Read `npm run data:migrate -- status`.
4. Apply the pre-schema data migrations of the open release train (the root
   `VERSION`), with the same `--release-version` filter the Office deployer
   passes.
5. Run the cutover survey (`npm run check:cutover-data-blockers`).
6. Preview the DDL with `prisma migrate diff`, which only reads. An empty
   diff skips the push.
7. Back up the database, but only when the DDL drops a table or column or
   changes a column type and `--accept-data-loss` is given.
8. Run `npm run db:push`, then `prisma generate`.
9. Apply the post-schema data migrations of every release. The same
   `data:migrate -- up` then re-applies the
   [ensure steps](../../scripts/data-migrations/README.md#ensure-steps),
   and a failing step stops the command here.
10. Read the final status. Every migration of the open release and every
    post-schema migration must have succeeded. Ensure steps write no ledger
    row, so this status does not list them.

When step 3 finds no `data_migration_runs` table (a new volume), there is no
ledger for step 4 to write to yet, so step 4 runs after step 8 instead. A
database that has rows but an empty ledger, such as one that only ever ran
`db:push`, takes the normal order and passes the same survey and DDL gates.

Pre-schema migrations of earlier releases never run here. The status lines
list them as `not applicable to this database`, and the final check leaves
them out. Such a migration prepared rows for its own release's schema change;
a database created or pushed past that change cannot run it (for example,
`v0.1.30:003` reads `product_variant_components`, which the schema no longer
has). The consequence: a database that skipped an earlier release's pre-schema
data transformations cannot catch up through this command. Restore it from a
copy that has been through that release, such as a fresh dump of a database
that ran it, or recreate it and sync again. When such migrations are pending
and the DDL is destructive, the preview warns that the dropped tables or
columns may still hold rows those migrations would have moved.

A second run changes nothing: the migration phases skip every id they have
already recorded, the ensure steps find their state in place, and an empty
diff skips the push.

| Flag | Effect |
|---|---|
| `--dry-run` | Runs only steps 1, 3, 5 and 6, so nothing is built, migrated, backed up or pushed. The survey then measures the database before any pre-schema migration, so it can report rows those migrations would remove. Ensure steps are not previewed; the real run applies whatever they find missing. |
| `--accept-data-loss` | Confirms DDL that drops a table or column or changes a column type, and is passed on to `db push`. Give it only after reviewing the `DESTRUCTIVE` statements from a previous run. Prisma also asks for it before adding a unique index or primary key to a table that has rows. The survey checks new unique indexes for duplicates first, and no backup is taken for that case alone. |
| `--no-backup` | Skips step 7. Take your own backup first. |
| `--help` | Prints the steps, flags, environment and exit codes. |

| Exit | Meaning |
|---|---|
| `0` | Done, or already in sync. With `--dry-run`: nothing would stop the real run. |
| `1` | Stopped for a decision: survey blockers, destructive DDL without `--accept-data-loss`, Prisma data-loss warnings, missing AI-agent consent, or source drift that `DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT` refuses. |
| `2` | Refused target, invalid usage, or a failed step. |

Step 3 lists
[source drift](../../scripts/data-migrations/README.md#source-drift) as a
warning. With `DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT=1` in the shell or `.env`,
`data:migrate -- up` refuses a phase that selects a drifted migration, so the
command stops after step 3, before any change, when step 4 or 9 would select
one. Other drift still only warns.

When an AI agent runs the command with `--accept-data-loss`, Prisma refuses
the push unless `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` holds the
user's exact consent text. The command reads that variable only from its own
environment and passes it only to the `db push` process. It never creates,
defaults or prints the value. A value stored in `.env` is ignored.

Verification after a sync:

```bash
npm run db:sync:local -- --dry-run   # expect: Result: in sync. Nothing to apply.
npm run data:migrate -- status
```

Recovery:

- Survey blockers: do not delete the rows by hand. Report the missing cleanup
  against the open release train, as KID-239 did for v0.1.31, so that a
  pre-schema migration removes the rows on every database. Rerun after that
  migration lands.
- A failed data migration is recorded as `failed` and runs again on the next
  sync. Fix the cause, then rerun.
- The backup is `.data/db-backups/<database>-<UTC time>.dump`, in `pg_dump`
  custom format (`.data/` is gitignored). To return `kiditem-postgres` to that
  state, stop the API, workers and anything else connected to the database
  (Prisma Studio, `psql`), then run:

  ```bash
  docker exec -i kiditem-postgres pg_restore --clean --if-exists --create --no-owner \
    --username kiditem --dbname postgres < .data/db-backups/<file>.dump
  ```

  `--create` drops and recreates the database named in the backup, so tables
  the push added do not survive. The restored database matches the code that
  was checked out before the sync. Check that code out again, or rerun the
  sync.

## 4. Create A Local Login Identity

A fresh schema intentionally contains no login user. Create one explicitly:

```bash
npm run dev:bootstrap-user -- --email you@example.com
```

The wrapper prompts for display name and password without echoing the password.
It creates or updates exactly:

- one active `Organization` (default name `KidItem Dev` and slug
  `kiditem-dev`);
- one active human `User` with a scrypt password hash;
- one active admin `OrganizationMembership` selected for the user; and
- when the organization has none, the current absolute ABC formula and a
  formula state attached to it, the same rows every post-schema
  `data:migrate -- up`, and so every `db:sync:local`, ensures for every
  organization
  ([ensure steps](../../scripts/data-migrations/README.md#ensure-steps)).

Rerunning with the same email/organization is idempotent and revokes that
user's prior sessions. It does not create an `AuthSession`; a session is created
only by a successful normal login. The script refuses non-loopback databases
and database names containing production/staging markers.

Optional identity arguments:

```bash
npm run dev:bootstrap-user -- --email you@example.com --name "Local Developer" --organization-name "KidItem Dev" --organization-slug kiditem-dev
```

To change only an existing user's password, run:

```bash
npm run auth:password -- --email you@example.com
```

See [KidItem Local Authentication](auth-office-local.md) for the session and
extension handoff contract.

## 5. Authenticate The Isolated Provider Home

Codex:

```bash
npm run gateway:auth:codex
```

This first checks the exact bundled `@openai/codex` package's login status. A
valid isolated login exits without opening a browser. Otherwise it starts the
provider's browser/device flow and verifies login status again before
succeeding. It uses:

```text
HOME=~/Library/Application Support/KidItem/AgentGateway/provider-home
CODEX_HOME=~/Library/Application Support/KidItem/AgentGateway/provider-home/.codex
```

Complete the provider's browser/device flow. Do not copy the normal
`~/.codex` directory. KidItem conversations then remain separate from Codex
Desktop's normal history.

To force the interactive Codex login flow for recovery:

```bash
npm run gateway:login:codex
```

Claude is optional:

```bash
npm run gateway:login:claude
```

The same isolated `HOME` is used. A missing paid Claude login makes only the
Claude provider unavailable; deterministic Gateway contracts and Codex can
still run.

## 6. Start KidItem

Full Dashboard and Agent OS:

```bash
npm run dev:all
```

This single entrypoint runs these boundaries in order:

1. idempotent `setup:macos`;
2. isolated Codex authentication check, with interactive login only when
   required; and
3. `dev:core` plus `dev:gateway` only after both earlier stages succeed.

An existing valid login skips the browser flow on repeat runs. Setup or
authentication failure starts no long-running service. If Web, API, or Gateway
later exits with a failure, the local process owner terminates its remaining
siblings instead of leaving a partial stack running. The running stack is:

```text
Next.js Web
  + NestJS API with Operation worker enabled
  + native Agent Gateway
```

The Gateway has no listening port. It maintains a protected outbound long-poll
to Nest and immediately posts queued runtime events. Provider children call the
private Nest MCP v2 endpoint through the process-scoped transport token. The
browser only calls same-origin `/api/copilotkit`.

Core Dashboard without Agent OS provider runtime:

```bash
npm run dev:core
```

Individual processes:

```bash
npm run dev
npm run dev:server
npm run dev:gateway
```

Direct `dev:gateway` use never opens a login flow. It fails with
`gateway_provider_unauthenticated` until `gateway:auth:codex` succeeds.

Open [http://localhost:3000/login](http://localhost:3000/login), log in with the
local identity, and verify `GET /api/auth/me` through the UI. Agent OS readiness
must show Codex available after the Gateway registers.

## 7. Optional Python Runtime

Python is not part of the default path. Use it only for a feature that calls the
optional FastAPI helper runtime.

```bash
npm run setup:macos -- --with-python-agents
python3.11 --version
python3.11 -m venv agents/.venv
agents/.venv/bin/pip install -r agents/requirements.txt
npm run dev:agents
```

Fill only the required variables in `agents/.env`. The default Sourcing URL
scrape remains Nest TypeScript Playwright and does not require this process.

## 8. Optional Shared Development Data

After creating the local organization, follow
[Google Drive Dev Data](google-drive-dev-data.md). Obtain the organization ID
from the authenticated app/API or Prisma Studio; do not commit it.

```bash
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/.../KidItem Dev Data"
export KIDITEM_DEV_ORGANIZATION_ID="<local organization uuid>"
npm run data:dev:setup -- --drive-root "$KIDITEM_DEV_DATA_DRIVE_DIR"
npm run data:dev:sync -- --profile workspace --yes
```

Drive bundles do not replace owner-domain imports. Sellpia inventory and
Coupang Wing catalog are restored through their dedicated runbooks.

## Verification

Configuration and process checks:

```bash
node --test scripts/__tests__/developer-onboarding-contract.test.mjs
npm run test:scripts
npm run check:scripts-inventory
docker compose config --quiet
npm run db:sync:local -- --dry-run
npm run data:migrate -- status
npm run build --workspace=packages/shared
npm run build --workspace=apps/agent-gateway
npm run build --workspace=apps/server
npm run build --workspace=apps/web
```

Manual smoke:

1. `/login` accepts the bootstrapped account.
2. Dashboard loads and refresh preserves the HttpOnly session.
3. Agent OS lists Codex as ready.
4. A new general conversation can send two turns using the same provider-local
   conversation.
5. KidItem conversation history does not appear under the normal Codex Desktop
   home.
6. Stopping and restarting `dev:gateway` restores provider-local descriptors
   from the isolated state directory and re-registers with the API.

Never include bearer values, cookies, passwords, provider raw output, or
private reasoning in verification evidence.

## Blockers And Recovery

| Symptom | Check | Recovery |
|---|---|---|
| `setup_node_version_mismatch` | `node --version`, `package.json` | install/use Node 22.22.3 or later within major 22; `.nvmrc` remains the recommended baseline |
| Prisma env error during install | `.env` exists before install | rerun `npm run setup:macos`; do not start with raw `npm install` |
| Docker services unhealthy | Docker Desktop and `docker compose ps` | start Docker; inspect service logs without deleting volumes |
| `gateway_installation_token_invalid` | token file length/mode, never print value | move the malformed file aside manually, rerun setup, then restart API/Gateway |
| `gateway_provider_package_missing` | locked npm install and Gateway build | rerun setup, then `npm run build --workspace=apps/agent-gateway` |
| `gateway_provider_unauthenticated` | isolated provider login status | run `npm run gateway:auth:codex`, then restart Gateway |
| `gateway_provider_status_check_failed` | provider status command exceeded 10 seconds or could not start cleanly | inspect the bundled provider process/state, then rerun `npm run gateway:auth:codex`; no login flow is opened automatically |
| `gateway_provider_auth_failed` | browser/device login completion | rerun `npm run gateway:auth:codex`; use `gateway:login:codex` only for forced recovery |
| `local_development_setup_failed` | preceding setup error | resolve the reported setup blocker, then rerun `npm run dev:all` |
| `local_development_provider_auth_failed` | preceding provider-auth error | complete `npm run gateway:auth:codex`, then rerun `npm run dev:all` |
| `user_not_found` from `auth:password` | fresh DB has no identity | run `npm run dev:bootstrap-user` first |
| Prisma table missing at API boot | local schema is stale | stop API, run `npm run db:sync:local`; never force-reset silently |
| `db:sync:local` stops at survey blockers (exit 1) | its `BLOCKER` and `PENDING` lines | do not delete rows by hand; report the missing cleanup against the open release train (as KID-239 did), then rerun after it lands |
| `db:sync:local` stops at destructive DDL (exit 1) | its `DESTRUCTIVE` lines | review the statements, then rerun with `--accept-data-loss`; the backup is taken first |
| `db:sync:local` stops at Prisma data-loss warnings (exit 1) | the preview's unique-index or primary-key line and Prisma's warning list | the survey already checked new unique indexes for duplicates; review the warnings, then rerun with `--accept-data-loss` |
| `db:sync:local` stops at Prisma consent (exit 1) | an AI agent ran `--accept-data-loss` | whoever runs it sets `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` to the user's exact consent text, then reruns |
| `db:sync:local` stops at source drift (exit 1) | `DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT` is set and an applied migration it would run was edited | report the edit (the fix needs a new migration id), or unset the variable to continue with a warning |
| `db:sync:local` backup fails (exit 2) | Docker is running and exactly one container publishes the port | start Docker or stop the extra container; otherwise take your own backup and rerun with `--no-backup` |

Do not delete `pgdata`, `minio-data`, or the Gateway root as a generic fix.
Deleting them destroys local data, object assets, provider login, and
conversation history respectively.

## Final Report

For team handoff, report only:

- git SHA;
- Node/npm versions;
- whether Docker services, schema apply, login, API/Web, and Codex readiness
  passed;
- whether optional Python/Claude was skipped; and
- stable error codes for blockers.

Do not report database URLs, local absolute user paths, credentials, token
lengths/values, cookies, provider session IDs, or transcripts.
