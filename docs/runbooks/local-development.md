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
`package.json` defines the supported runtime as Node `>=22 <23` and npm major
10; npm itself is pinned as `npm@10.9.8` in `packageManager`.

Setup accepts any Node 22 release and blocks other majors. The native Gateway
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
npm run db:push
```

Expected services:

- PostgreSQL 17.9 on `localhost:5433` with local-only
  `kiditem`/`kiditem` credentials.
- MinIO `RELEASE.2025-09-07T16-13-09Z` from `quay.io/minio/minio` on
  `localhost:9000`; console on `localhost:9001`.
- An idempotent `kiditem` bucket initialization container
  (`quay.io/minio/mc`) that exits 0.

`db:push` is explicit because it mutates the selected database. The wrapper
blocks `--force-reset`. Do not pass `--accept-data-loss` for a developer DB
without first reviewing the schema diff and getting explicit approval. The
previous authorization for isolated Testcontainer QA does not apply here. The
local QA database `kiditem-qa-pg` (port 5434) is disposable for cutover
rehearsal and QA under the [data-loss policy](deployment-architecture.md#data-loss-policy).

The root and server `DATABASE_URL` values must both be:

```text
postgresql://kiditem:kiditem@localhost:5433/kiditem
```

## 4. Create A Local Login Identity

A fresh schema intentionally contains no login user. Create one explicitly:

```bash
npm run dev:bootstrap-user -- --email you@example.com
```

The wrapper prompts for display name and password without echoing the password.
It creates or updates exactly:

- one active `Organization` (default name `KidItem Dev` and slug
  `kiditem-dev`);
- one active human `User` with a scrypt password hash; and
- one active admin `OrganizationMembership` selected for the user.

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
| `setup_node_version_mismatch` | `node --version`, `package.json` | install/use any supported Node 22 release; `.nvmrc` remains the recommended baseline |
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
| Prisma table missing at API boot | local schema is stale | stop API, review and run `npm run db:push`; never force-reset silently |

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
