# Deployment Architecture Runbook

KidItem has one deployable runtime: Office. There is no hosted staging or
production lane. Office runs PostgreSQL, MinIO, API, worker, web, and nginx on
the operator-managed Windows host. A future move to a home server extends this
Office boundary; it does not introduce a second environment by default.

## Runtime Shape

```text
protected release/office SHA
  -> immutable API/web images + office-deployment.json
    -> Office operator guard
      -> local Docker Compose
        -> PostgreSQL + MinIO external volumes
        -> one API + one worker + one web + nginx
        -> API-owned Codex/Claude CLI profile + per-Attempt directories
```

The Office checkout is always `release/office`, tracking
`origin/release/office`. Product images are built once and identified by
immutable digest references. The Office host pulls those refs and performs a
guarded Compose recreate; it does not build product images during deployment.

Runtime configuration, deployment history, and stateful volumes stay under the
Office operator boundary. The repository contains no EC2 bootstrap, Terraform
host stack, public DNS contract, hosted Compose file, or hosted environment
secret contract.

### Nest process ownership

```text
main.ts   -> ApiApplicationModule         -> HTTP + domains + Operations
worker.ts -> AgentWorkerApplicationModule -> Agent OS queue/runtime only
MCP/CLI   -> AgentMcpApplicationModule    -> scoped Agent capabilities only
```

Office runs exactly one API container, one worker, and one web container.
Replicas and rolling API overlap are unsupported. The API alone owns the
Codex/Claude executable and private MCP socket; the worker owns durable
Operation/approval work but receives neither a CLI login profile nor a CLI
home. `AGENT_CLI_MAX_CONCURRENCY=4` is the only Agent capacity control. The
API has a 10-second stop grace period and its health check allows a 60-second
startup period for fail-closed lifecycle cleanup.

Only the API application graph reaches OperationsModule; ApiApplicationModule
owns OperationRun creation, scheduling, resource-class dispatch, browser
claims, startup cleanup, and shutdown cancellation. AgentWorkerApplicationModule
and MCP roots are Agent-runtime-only: they cannot import OperationsModule or
query/mutate OperationRun. A bounded Agent command reaches the one API owner
instead.

The API lifecycle is code-owned:

```text
BOOTSTRAPPING -> ACCEPTING -> STOPPING -> STOPPED
```

Before HTTP listening, the API obtains the database clock and has at most 30
seconds to cancel old active/waiting runs and advance missed schedules. Those
rows receive operation_server_lifecycle_expired. On graceful shutdown it first
closes intake, then has at most 5 seconds for the first/final cancellation
sweeps and handler cleanup; those rows receive operation_server_shutdown. A
cleanup failure logs operation_server_lifecycle_cleanup_failed and leaves the
next API boot fail-closed until its own startup sweep reaches zero. Maintenance,
restart, replacement, and an expired lease never reactivate, reclaim, or
requeue a cancelled row; a deliberate operator retry creates a new run only
after a single API is ACCEPTING.

The immutable API image includes pinned Codex and Claude CLI binaries. Only the
API root starts those local runtimes. Provider authentication remains in a
persistent, operator-initialized CLI home volume; KidItem never stores or
injects provider API/OAuth credentials or a runtime HMAC token. PostgreSQL owns
the durable Task/Attempt and mutation record; CLI processes and their
per-Attempt directories are current-container-only and never resume after
restart. Each child gets an isolated home plus only a symlinked read-only login
artifact, an allowlisted local environment, and a database-revalidated MCP
execution coordinate. A missing binary, incompatible version, or logged-out
profile makes that runtime unavailable and the owning Task fails closed.

The Office nginx edge returns 404 for `^~ /api/internal/` before ordinary API
proxying. Container-local access to an internal Agent command still requires a
valid bounded capability grant.

## Release Boundary

- Normal work merges to `develop`.
- An approved promotion PR updates the permanent protected
  `release/office` branch.
- Root `VERSION`, the full branch SHA, and API/web image digests identify the
  release.
- Mutable `office-candidate` tags are pointers only; Office Compose consumes
  digest refs from `office-deployment.json`.
- Schema application is an explicit Office operator action and is never
  implied by pulling source code.

The current bundle publication entrypoint is
`.github/workflows/office-images.yml`. If CI execution moves to a self-hosted
runner, the same immutable SHA, digest, protected-branch, and operator approval
contracts still apply. Runner placement must not give untrusted pull requests
access to Office secrets or the Docker host.

## Runner Decision

Office keeps the current GitHub-hosted GitHub Actions jobs (`ubuntu-latest`). A
self-hosted runner was evaluated as a way to avoid metered hosted minutes, but
is not part of the current architecture. Configure the Actions budget to stop
paid overage and monitor included-minute usage before changing runner
placement.

If runner cost later justifies another review, preserve the same workflow,
GHCR digest, `release/office`, and operator-approval contracts. Any candidate
self-hosted runner must be a dedicated replaceable VM or machine with no Office
database, object-storage, env-file, or live Docker-host access. Do not install
it on the Office/home-server runtime itself.

## Runtime Guard

`deploy/office/apply-deployment.ps1` blocks deployment unless:

- branch/upstream are `release/office` / `origin/release/office`;
- local HEAD, the live remote branch, and the manifest SHA match;
- tracked Git state is clean;
- API/web refs are approved GHCR digest refs and OCI revision labels match;
- protected env files and PostgreSQL/MinIO external volumes exist;
- both Office and Docker data drives have at least 10 GB free;
- Compose contains no product `build:` entry;
- PostgreSQL, MinIO, API, worker, web, and nginx reach expected states;
- `/login` returns 200 and unauthenticated `/api/auth/me` returns 401.

Office uses controlled recreate instead of blue-green deployment because the
host has tight disk capacity and owns local state. The operator script restores
the prior runtime files when candidate health fails. Runtime rollback does not
undo Prisma schema changes, data migrations, marketplace writes, object-storage
changes, or queued jobs.

An incompatible schema contraction uses a full-stop maintenance window instead
of the normal runtime rollback path. Stop API, worker, web, and nginx before the
final database dump; keep them stopped through the destructive schema push and
relation verification. If the cutover fails, restore the verified pre-push dump
before starting the previous manifest. The database backup and prior runtime
are one recovery unit. The normal deployment wrapper is not used for this
cutover because its application-only runtime restore cannot roll back the
database.

## Security Boundary

- Office environment files remain outside Git and are never workflow inputs.
- Codex/Claude login material remains in the local `kiditem-cli-home` volume;
  it is never copied to an env file, image, workflow artifact, log, or backup.
- Office database and object storage are not exposed to the public Internet.
- The `office` GitHub Environment restricts bundle publication to the protected
  branch and may require reviewers.
- A future home server remains private by default. Remote access requires a
  separately reviewed HTTPS/VPN or zero-trust design before opening any port.
- Self-hosted CI must use an isolated runner account, ephemeral workspaces, and
  no execution of fork/untrusted PR code with release credentials.

## Disk Boundary

The only automated cleanup is bounded BuildKit cache pruning. Never run broad
Docker system/volume pruning and never place active Docker volumes or the live
repository on a NAS share. The NAS is a verified backup target only.

## Verification

Before changing this architecture:

```bash
npm run check:workflow-yaml
npm run test:scripts
powershell -NoProfile -Command '$tokens = $null; $errors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile("deploy/office/apply-deployment.ps1",[ref]$tokens,[ref]$errors); if ($errors.Count) { $errors; exit 1 }'
docker compose --env-file deploy/office/office.env.example --env-file deploy/office/digest.env.example -f deploy/office/compose.office.yml config --quiet
```

For release operation details, use [Office Deploy](office-deploy.md).

## Runner References

- [GitHub Actions billing and usage](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [GitHub self-hosted runners](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners)
- [Self-hosted runner security and ephemeral lifecycle](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [GitHub Packages and Container registry billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages)
