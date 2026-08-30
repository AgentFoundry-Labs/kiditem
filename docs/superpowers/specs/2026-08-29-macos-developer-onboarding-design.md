# macOS Developer Onboarding Design

## Goal

A teammate with a fresh macOS clone must be able to reach a working KidItem
Dashboard, authenticated API, and Codex-backed Agent OS without copying another
developer's secrets or provider history. The repository documentation and
checked-in examples must describe the commands that actually work.

This is a shared developer-experience boundary. It intentionally crosses root
tooling, local authentication bootstrap, Web/API configuration, and the native
Agent Gateway, but does not change any business-domain lifecycle or Agent OS
runtime contract.

## Chosen Approach

Use staged, repository-owned bootstrap commands behind one short runtime entrypoint:

1. pin a recommended macOS Node runtime in the repository without requiring
   that exact patch release at setup time;
2. create missing local env files from committed examples before dependency
   installation;
3. initialize a protected, installation-local Gateway directory under
   `~/Library/Application Support/KidItem/AgentGateway`;
4. start pinned PostgreSQL and MinIO containers and apply the Prisma schema;
5. create or refresh one explicitly requested local user, organization, and
   membership through a local-database-only bootstrap with stdin password;
6. let `dev:all` ensure the bundled Codex CLI is authenticated inside the
   isolated Gateway login home, opening the interactive provider flow only when
   required; and
7. start Web, API/Operation worker, and Gateway only after setup and provider
   authentication succeed. Python agents remain an explicit optional runtime.

`README.md` is the concise entrypoint. `docs/runbooks/local-development.md`
owns the complete procedure and troubleshooting. The environment runbook owns
the variable inventory, grouped by environment and file. Checked-in examples
remain the executable defaults.

## Alternatives Rejected

### Documentation-only repair

Changing commands without adding a bootstrap contract leaves fresh clones
dependent on tribal knowledge. It would not fix the missing login identity,
Gateway token/config, isolated provider home, or install-before-env failure.

### One opaque command that mutates everything

A single command that starts containers, pushes schema, creates users, prompts
for provider login, and launches all processes would be difficult to audit and
unsafe to rerun. The selected flow automates deterministic file setup while
keeping database mutation and interactive provider login explicit.

`dev:all` is a thin runtime orchestrator rather than that rejected opaque
bootstrap. It composes the independently runnable setup, provider-auth, and
service-start stages. Docker startup, schema application, and local identity
creation remain explicit commands outside it.

### Shell-chain-only orchestration

Joining commands directly in `package.json` with shell operators makes stage
errors, cross-platform process behavior, and `Ctrl-C` cleanup difficult to test.
A repository-owned orchestrator instead owns sequencing and child-process
shutdown while delegating each stage to its existing command boundary.

### Authenticate during Gateway startup

Starting an interactive browser login from the long-running Gateway would mix
operator authentication with provider execution and make service restarts
potentially interactive. Authentication therefore completes before Gateway
startup; the Gateway start command only performs a non-interactive readiness
check.

### Reuse the developer's normal Codex/Claude home

This would make KidItem-owned conversations appear in the developer's normal
desktop/CLI history and couple application readiness to personal settings. The
Gateway receives an explicit isolated `loginRoot`; only the provider login is
copied by authenticating again inside that root.

## Runtime And File Ownership

### Repository runtime

- `.nvmrc` pins the recommended Node version. `package.json` remains the
  supported Node/npm range and package-manager contract.
- Setup accepts any Node release in the supported Node 22 range. It does not
  require equality with the `.nvmrc` minor or patch version. Other Node majors
  remain unsupported because the native Gateway runtime train requires major
  22.
- `.env` is used only by Prisma and root dev-data tooling.
- `apps/server/.env` is the Nest runtime configuration.
- `apps/web/.env.local` is public Web build/runtime configuration.
- `agents/.env` exists only when the optional Python service is enabled.

The setup command never overwrites an existing env file and never copies env
files from another checkout by default. An existing worktree-copy mode may be
used explicitly, but a fresh clone always falls back to committed examples.

### Native Gateway runtime

The macOS default is:

```text
~/Library/Application Support/KidItem/AgentGateway/
├── gateway-config.json       # mode 0600
├── secrets/                  # mode 0700
│   └── installation-token    # random 43-character bearer, mode 0600
├── state/                    # descriptors/preferences/provider MCP files
└── provider-home/            # isolated Codex/Claude login and history
    └── .codex/               # protected Codex home created before login
```

The generated config uses absolute paths, the repository root as both bundled
runtime root and allowed workspace, and `http://127.0.0.1:4000` as the control
origin. Setup writes only the token *path* to `apps/server/.env`; it never
prints or persists the token value elsewhere.

## Runtime Phase Boundaries

### Setup

`npm run setup:macos` is deterministic and idempotent. It validates macOS and
the supported Node major, creates missing env files and protected Gateway
directories, creates the isolated `.codex` directory before provider commands
use it, installs locked dependencies when absent, configures repository Git
hooks, and exits. It never starts provider authentication or a long-running
service.

### Provider authentication

`npm run gateway:auth:codex` uses the exact bundled Codex CLI and the isolated
`HOME`/`CODEX_HOME`. It first runs the provider's non-interactive login-status
command. An authenticated home succeeds without opening a browser. Otherwise,
it starts the normal interactive browser/device login, waits for the operator's
approval, and verifies login status again before succeeding. KidItem reads only
the process exit status; it never reads, copies, or prints provider credential
bytes.

The existing `gateway:login:codex` command remains available to force the
provider's interactive recovery flow directly.

### Gateway execution and orchestration

`npm run dev:gateway` builds and starts the Gateway only after a non-interactive
setup and Codex-auth readiness check. It never initiates login itself.

`npm run dev:all` is the normal entrypoint and owns this sequence:

1. run idempotent macOS setup;
2. ensure isolated Codex authentication;
3. start `dev:core` and `dev:gateway` together only after both prior stages
   succeed; and
4. forward termination and clean up both long-running children on `Ctrl-C`.

Repeated runs preserve existing env, Gateway control material, and provider
login. They skip browser authentication when the isolated login is still valid.

### Local identity bootstrap

Fresh schema state has no `User` or `OrganizationMembership`. A dedicated
local-development script therefore upserts exactly one requested Organization,
User, and active membership, hashes a password received through stdin, and
revokes prior sessions for that user. It refuses non-loopback databases and
database names containing production or staging markers. It is not a login
bypass, does not mint a session, and does not run in Office.

## Development Commands

- `npm run setup:macos`: verify macOS/Node 22 compatibility, create missing env
  files, initialize Gateway control files, install exact locked dependencies
  when absent, and install repository Git hooks.
- `docker compose up -d --wait`: start the pinned PostgreSQL/MinIO baseline.
- `npm run db:push`: apply the current schema to the local database.
- `npm run dev:bootstrap-user -- --email <email>`: interactive local identity
  and password bootstrap.
- `npm run gateway:auth:codex`: ensure the bundled Codex CLI is authenticated
  inside the isolated provider home, prompting only when needed.
- `npm run gateway:login:codex`: force the interactive Codex recovery flow.
- `npm run dev:core`: Web plus API/Operation worker, without Agent OS Gateway.
- `npm run dev:gateway`: non-interactively verify setup/auth readiness, then
  build and start the native Gateway with its generated config.
- `npm run dev:all`: run setup, ensure Codex authentication, then start Web,
  API/Operation worker, and Gateway.
- `npm run dev:agents`: optional Python runtime after a Python 3.11+ venv is
  explicitly prepared.

## Environment Profiles

The environment documentation is organized around four profiles rather than
one global list:

1. **macOS core:** root, server, and Web env files; PostgreSQL/MinIO defaults.
2. **macOS Agent OS:** core plus the protected Gateway config/token and provider
   login home. Gateway material is not represented as `.env` credentials.
3. **optional Python agents:** `agents/.env` and Python 3.11+ only.
4. **Windows Office:** protected host files and Docker secrets described by the
   Office deployment runbook.

Local sourcing examples must not point at the Office-only CDP hostname. Local
URL scrape can use a dedicated Playwright user-data directory; Office keeps its
managed CDP endpoint in `deploy/office/office.env.example`.

## Error Handling And Security

- Existing env, token, and provider-login files are preserved.
- A malformed existing Gateway token is a blocker, not silently rotated.
- Setup, provider-auth, and Gateway-start failures are stage-specific,
  non-zero, and print stable, non-secret error messages.
- Setup or authentication failure starts no long-running service. Cancelling
  provider login is an authentication failure and does not start Gateway.
- Direct `dev:gateway` use fails closed when setup or Codex authentication is
  unavailable and points the operator to the corresponding setup/auth command.
- Provider login commands inherit only the small environment needed for the
  interactive CLI and use the pinned bundled provider binary.
- Passwords are never accepted in argv or env, and tokens/passwords are never
  printed.
- Schema application remains an explicit command. Setup does not delete Docker
  volumes or pass Prisma data-loss flags.

## Verification

The change is complete when:

- a contract test proves examples, README order, Node pin, Compose credentials,
  local sourcing defaults, package scripts, and CI postinstall env agree;
- setup unit tests prove Node 22 range acceptance without exact patch matching,
  non-overwrite behavior, protected `.codex` creation, 0700/0600 Gateway
  permissions, exact config paths, valid bearer generation, and idempotent
  reruns;
- local identity tests prove loopback-only admission, normalized input,
  idempotent upsert shape, stdin-only password handling, and session revocation;
- Gateway command tests prove isolated auth-status/login/start paths, auth skip
  and re-verification behavior, and redacted startup failures;
- orchestration tests prove setup → auth → service order, short-circuiting before
  service start, repeat-run auth skipping, and complete child cleanup on signal;
- script inventory, Docker Compose validation, relevant focused tests, and Web,
  server, shared, and Gateway builds pass; and
- the runbook documents a fresh-clone smoke sequence plus reset and blocker
  behavior without containing any real credentials.
