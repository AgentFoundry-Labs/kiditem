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

Use a staged, repository-owned bootstrap with one short happy path:

1. pin the recommended macOS Node runtime in the repository;
2. create missing local env files from committed examples before dependency
   installation;
3. initialize a protected, installation-local Gateway directory under
   `~/Library/Application Support/KidItem/AgentGateway`;
4. start pinned PostgreSQL and MinIO containers and apply the Prisma schema;
5. create or refresh one explicitly requested local user, organization, and
   membership through a local-database-only bootstrap with stdin password;
6. log the bundled Codex CLI into the isolated Gateway login home; and
7. run Web, API/Operation worker, and Gateway together. Python agents remain an
   explicit optional runtime.

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

### Reuse the developer's normal Codex/Claude home

This would make KidItem-owned conversations appear in the developer's normal
desktop/CLI history and couple application readiness to personal settings. The
Gateway receives an explicit isolated `loginRoot`; only the provider login is
copied by authenticating again inside that root.

## Runtime And File Ownership

### Repository runtime

- `.nvmrc` pins the recommended Node version. `package.json` remains the
  supported Node/npm range and package-manager contract.
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
```

The generated config uses absolute paths, the repository root as both bundled
runtime root and allowed workspace, and `http://127.0.0.1:4000` as the control
origin. Setup writes only the token *path* to `apps/server/.env`; it never
prints or persists the token value elsewhere.

### Local identity bootstrap

Fresh schema state has no `User` or `OrganizationMembership`. A dedicated
local-development script therefore upserts exactly one requested Organization,
User, and active membership, hashes a password received through stdin, and
revokes prior sessions for that user. It refuses non-loopback databases and
database names containing production or staging markers. It is not a login
bypass, does not mint a session, and does not run in Office.

## Development Commands

- `npm run setup:macos`: verify macOS/Node, create missing env files, initialize
  Gateway control files, install exact locked dependencies when absent, and
  install repository Git hooks.
- `docker compose up -d --wait`: start the pinned PostgreSQL/MinIO baseline.
- `npm run db:push`: apply the current schema to the local database.
- `npm run dev:bootstrap-user -- --email <email>`: interactive local identity
  and password bootstrap.
- `npm run gateway:login:codex`: authenticate the bundled Codex CLI inside the
  isolated provider home.
- `npm run dev:core`: Web plus API/Operation worker, without Agent OS Gateway.
- `npm run dev:gateway`: build and start the native Gateway with its generated
  config.
- `npm run dev:all`: Web, API/Operation worker, and Gateway.
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
- Setup and Gateway startup errors print stable, non-secret error messages.
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
- setup unit tests prove non-overwrite behavior, 0700/0600 Gateway permissions,
  exact config paths, valid bearer generation, and idempotent reruns;
- local identity tests prove loopback-only admission, normalized input,
  idempotent upsert shape, stdin-only password handling, and session revocation;
- Gateway command tests prove isolated login/start paths and redacted startup
  failures;
- script inventory, Docker Compose validation, relevant focused tests, and Web,
  server, shared, and Gateway builds pass; and
- the runbook documents a fresh-clone smoke sequence plus reset and blocker
  behavior without containing any real credentials.

