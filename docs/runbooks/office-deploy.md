# Office Deploy Runbook

This runbook operates the always-on Windows office runtime at
`C:\workspace\kiditem`. GitHub Actions builds API and web images once, pushes
them to GHCR, and publishes a manifest containing immutable digest references.
The office PC only pulls and recreates containers; it never builds product
images during deployment.

## Human Prerequisites

- `release/office` exists permanently on GitHub, is protected against deletion
  and force pushes, and the repository setting `delete_branch_on_merge` is
  disabled. Never select **Delete branch** after a PR involving this branch.
- The live checkout is exactly `C:\workspace\kiditem`, on `release/office`,
  tracking `origin/release/office`, and has no tracked changes.
- Docker Desktop, Git, GitHub CLI, and PowerShell 5.1 or later are installed.
- The operator can read the private GHCR packages
  `kiditem-api` and `kiditem-web`.
- `C:\ProgramData\Kiditem\.env.office` and the API env file referenced by
  `OFFICE_API_ENV_FILE` exist locally and remain outside Git.
- External Docker volumes `kiditem_pgdata` and `kiditem_minio-data` exist and
  have a recent backup on the NAS. The NAS is a backup target, not a live
  Docker data root.
- The GitHub `office` Environment exists and restricts deployments to protected
  branches. Add required reviewers there when the office approval roster is
  defined.

Start from [office.env.example](../../deploy/office/office.env.example) when a
new machine is provisioned. Replace every placeholder without printing the
populated file in logs or chat.

## Architecture And Ownership

```text
protected release/office SHA
  -> GitHub Actions BuildKit cache
    -> API + web images in GHCR
      -> digest-only office-deployment.json artifact
        -> Windows operator guard
          -> pull + OCI revision verification
              -> optional approved Prisma schema push
                -> Compose recreate + health/smoke checks
```

GitHub owns image building and release identity. `C:\ProgramData\Kiditem` owns
local runtime configuration, deployment history, Compose/nginx copies, and
rollback manifests. PostgreSQL and MinIO stay in their existing external
Docker volumes. Terraform does not manage this one Windows workstation; add
Terraform only after moving the office runtime to a long-lived remote host
whose provisioning must be reproducible.

The office lane is deliberately not blue-green because the host has tight disk
capacity and retains local state. It uses a controlled recreate with automatic
runtime-file restoration on a failed health check. An approved schema change is
applied explicitly with `-ApplySchema`; database changes remain outside runtime
rollback and must be assessed separately for every release.

## Promote The Office Branch

Normal work still merges into `develop`. Promote an approved `develop` commit
to `release/office` through a reviewed PR. Before merging, require both
`PR Checks / PR hygiene` and the required local verification from `AGENTS.md`.
Run `Develop Validation / Develop full validation` manually only when an
independent cloud verification is needed. The office branch is a persistent
environment branch, not a disposable feature branch. After the merge, verify:

```powershell
git ls-remote --heads origin refs/heads/release/office
gh api repos/AgentFoundry-Labs/kiditem/branches/release%2Foffice --jq '{name,protected}'
gh api repos/AgentFoundry-Labs/kiditem --jq '{delete_branch_on_merge}'
```

Block the release if the ref is absent, `protected` is false, or
`delete_branch_on_merge` is true.

## Build The Immutable Bundle

Read the exact remote SHA, generate a correlation UUID, and dispatch the
workflow from the persistent branch:

```powershell
$officeSha = (git ls-remote origin refs/heads/release/office).Split()[0]
$correlation = [guid]::NewGuid().ToString()
gh workflow run office-images.yml --ref release/office `
  -f expected_git_sha=$officeSha `
  -f dispatch_correlation_id=$correlation
gh run list --workflow office-images.yml --branch release/office `
  --json databaseId,status,conclusion,displayTitle,url,headSha
```

Select only the run whose title contains the generated correlation UUID and
whose `headSha` equals `$officeSha`. Wait for success. The workflow artifact is
named `office-deployment-<full SHA>` and contains:

- `office-deployment.json`
- `compose.office.yml`
- `nginx.conf`
- `apply-deployment.ps1`

The manifest records the workflow URL, root app version, Git SHA, and exact API
and web digest refs. Convenience tags such as `office-candidate` are never used
by Compose.

## Download And Deploy

Authenticate Docker to GHCR without echoing the token, then download the exact
successful run. Replace `<run-id>` and `<full-sha>` with verified values:

```powershell
gh auth token | docker login ghcr.io -u $env:USERNAME --password-stdin
New-Item -ItemType Directory -Force `
  -Path "C:\ProgramData\Kiditem\incoming\<full-sha>" | Out-Null
gh run download <run-id> `
  --name "office-deployment-<full-sha>" `
  --dir "C:\ProgramData\Kiditem\incoming\<full-sha>"
& "C:\ProgramData\Kiditem\incoming\<full-sha>\apply-deployment.ps1" `
  -Operation Deploy `
  -ManifestPath "C:\ProgramData\Kiditem\incoming\<full-sha>\office-deployment.json" `
  -ApplySchema
```

Use `-ApplySchema` only when the reviewed release contains a Prisma schema
change. It is required for the Office local-auth release because that release
adds `auth_sessions`. The operator stops API/worker/web/nginx, starts and waits
for PostgreSQL, then runs `npx prisma db push` from the candidate API image
before starting the full candidate runtime. A deploy without a schema change
omits this switch. `Status` and `Rollback` reject it.

When a reviewed Prisma change is intentionally guarded by Prisma's generic data
loss warning, add `-AcceptDataLoss` to the same deploy command and record the
reason in the PR body and final report. This only appends
`--accept-data-loss` to `npx prisma db push`; it never performs
`--force-reset`.

### Destructive Maintenance Window

An incompatible schema contraction is a planned full-stop maintenance action,
not a normal runtime rollout. The approved Agent OS clean cutover has an
executable Windows sequence in [Agent OS Clean Cutover](agent-os-clean-cutover.md):
it blocks ready/executing mutations, makes and lists a custom dump, records a
SHA-256 plus app version/Git SHA and unrelated row counts, then seeds the six
AgentVersions after `db push --accept-data-loss`. Before taking the final row counts or dump, stop
API, worker, web, and nginx with the current Office Compose configuration. Keep
PostgreSQL and MinIO running, and do not restart any application container until
the schema operation and post-push relation checks are complete.

While application writers remain stopped:

1. Record the reviewed release SHA, image manifest, accepted-data-loss approval,
   and pre-drop row counts.
2. Create a fresh custom-format PostgreSQL dump, verify `pg_restore --list`,
   record its SHA-256, confirm the NAS copy has the same hash, and name the
   restore owner.
3. Stage the exact reviewed API/web digest refs and Compose/nginx files from the
   downloaded bundle. Validate the Compose configuration, but do not start the
   application services.
4. Run `npx prisma db push --accept-data-loss` once from the candidate API image
   with `docker compose run --rm --no-deps api`.
5. Verify the retired and retained relations, then start and smoke-test the new
   runtime with the reviewed Compose configuration.

Do not use the normal `apply-deployment.ps1 -Operation Deploy` wrapper for this
one incompatible cutover. Its runtime-file rollback is designed for application
failures and is not a database rollback. The operator owns the full-stop
sequence above and starts an application runtime only after the database shape
has been accepted.

If schema application or the new runtime fails, keep every application service
stopped. Runtime-only `-Operation Rollback` is incompatible with the contracted
database. Restore the verified pre-push database dump first, then start the
previous manifest so the database and runtime are rolled back as one pair.
Record the dump SHA, previous image digests, restore result, and smoke evidence.

If the release includes durable data migrations, run the approved phase order
against the Office database with a fresh backup in place:

```powershell
npm run data:migrate -- up --phase pre-schema --release-version <VERSION> --target office `
  --confirm APPLY_DATA_MIGRATIONS

& "C:\ProgramData\Kiditem\incoming\<full-sha>\apply-deployment.ps1" `
  -Operation Deploy `
  -ManifestPath "C:\ProgramData\Kiditem\incoming\<full-sha>\office-deployment.json" `
  -ApplySchema `
  -AcceptDataLoss

npm run data:migrate -- up --phase post-schema --release-version <VERSION> --target office `
  --confirm APPLY_DATA_MIGRATIONS
```

Run data migrations from a clean checkout of the deployed SHA with
`DATABASE_URL` set in the process environment. Do not print the database URL or
env-file contents. The `--release-version` filter is for Office databases whose
existing ledger predates this runner; do not use it to skip a migration added
by the selected release.

The deploy command blocks unless all of these conditions hold:

- branch/upstream are `release/office` / `origin/release/office`;
- local HEAD equals the live remote branch and the manifest SHA;
- tracked Git status is clean;
- API/web refs are approved `ghcr.io/...@sha256:...` values;
- OCI revision labels equal the manifest SHA;
- protected env files and both external volumes exist;
- at least 10 GB is free on both the office root and Docker data drives;
- Compose contains no local `build:` entry;
- PostgreSQL, MinIO, API, worker, web, and nginx reach expected states;
- `/login` returns 200 and unauthenticated `/api/auth/me` returns 401.

After success, the manifest is written to
`C:\ProgramData\Kiditem\deployments\current.json`; the prior one becomes
`previous.json` and a timestamped history copy is retained.

## Initialize Office Login

The local-auth release does not create users and never accepts a password on
the command line. Set the password only for an existing `users.email`, through
stdin. The command replaces the scrypt hash and revokes every existing session
for that user.

```powershell
$email = 'operator@example.com'
$secure = Read-Host 'New KidItem password' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$plain = $null
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $plain | docker exec -i kiditem-api `
    node dist/auth/adapter/in/cli/auth-admin.js `
    set-password --email $email --password-stdin
}
finally {
  if ($null -ne $plain) { Remove-Variable plain }
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Variable secure
}
```

To revoke every browser and extension session without changing the password:

```powershell
docker exec kiditem-api node dist/auth/adapter/in/cli/auth-admin.js `
  revoke-sessions --email operator@example.com
```

Sessions expire absolutely after 30 days. Each browser profile/PC receives an
independent row, and normal logout revokes only the current row. The web tab
sends the same opaque token to the installed KidItem extensions; the database
stores only its SHA-256 hash.

After password setup, verify from two PCs or browser profiles:

1. Open `http://kiditem-office/login`, sign in, and confirm `/api/auth/me`
   succeeds through the app.
2. Sign in from the second PC and confirm the first PC remains signed in.
3. Reload each KidItem extension and run one authenticated read. Confirm a 401
   causes web-tab resync rather than a separate credential prompt.
4. Log out from one PC and confirm only that PC and its environment-specific
   extension token are cleared.
5. Run `revoke-sessions`, then confirm both PCs are rejected on their next API
   request.

Office currently uses plain HTTP on the trusted LAN, so the cookie cannot use
the `Secure` flag and bearer tokens are not encrypted in transit. Do not expose
port 80 outside the trusted office network. Moving Office to HTTPS is required
before any untrusted-network or remote access.

## Initialize Local Agent CLI Login

The API image includes pinned Codex and Claude CLI binaries. Their provider
authentication is owned entirely by the CLI profile in the
`kiditem-cli-home` Docker volume; KidItem does not accept or inject
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, an OAuth token, or an Agent-runtime HMAC
key for this path. PostgreSQL is the only durable Agent OS work record. Local
CLI process state is deliberately current-container-only and is never resumed
after an API restart.

Before the first API startup on a host, authenticate interactively through the
one-off `cli-login` Compose profile. It mounts the same CLI home volume the API
will use, without starting or attaching to the API container:

```powershell
docker compose run --rm --no-deps cli-login codex login --device-auth
docker compose run --rm --no-deps cli-login claude auth login
docker compose run --rm --no-deps cli-login codex login status
docker compose run --rm --no-deps cli-login claude auth status --json
```

Do not paste provider keys into the Office env file or command line. Do not
print, copy, or back up the CLI profile volume; do not use post-start `docker
exec` for Codex or Claude login/status. If the volume is lost or login
is revoked, authenticate again. Until both exact login-status checks pass, the
API remains available but a definition selecting that unavailable runtime is
rejected before an AgentSession judgment graph is created.

## Disk Pressure

Do not move the live repository or Docker volumes to the shared NAS. Network
latency, disconnects, and file-locking make it unsuitable for Docker's active
data root. The repository is not the main space consumer; Docker images and
BuildKit cache are.

Inspect without mutation:

```powershell
Get-PSDrive C
docker system df
docker buildx du
```

On this office host Docker Desktop currently stores its VHDX under the user's
`AppData\Local\Docker\wsl\disk` directory. The script detects that standard
location and checks both its drive and the office root drive, deduplicating
them when they are the same. If Docker Desktop is configured with a custom
location, pass it with `-DockerDataRoot`. If the deploy needs internal Docker
space, allow the operator script to prune BuildKit cache to a 5 GB ceiling
before re-checking the 10 GB host-drive guard:

```powershell
& .\apply-deployment.ps1 -Operation Deploy `
  -ManifestPath .\office-deployment.json `
  -PruneBuildCache
```

The script never runs `docker system prune`, `docker volume prune`, or deletes
named volumes. If cache pruning is insufficient, stop and move Docker Desktop's
disk image to a larger local SSD using Docker Desktop settings during an
approved maintenance window. Back up the volumes before that move.

## Status And Rollback

Status is read-only and reports branch identity, container state, current image
digests, free space, and `docker system df` without reading env values:

```powershell
& C:\workspace\kiditem\deploy\office\apply-deployment.ps1 -Operation Status
```

Rollback selects `previous.json`, reuses the same digest/revision and health
guards, and swaps the current/previous manifest records:

```powershell
& C:\workspace\kiditem\deploy\office\apply-deployment.ps1 -Operation Rollback
```

Rollback is valid for application regressions only.
Runtime-only rollback does not undo Prisma schema changes. It also does not
undo data migrations, marketplace writes, object-storage changes, or queued
jobs. After an incompatible schema change, never start the previous runtime
against the changed database. Keep application services stopped and restore the
verified database dump before starting the previous manifest.

## Blockers

Stop without rebuilding, resetting, switching branches, or pruning volumes if:

- the branch, upstream, clean status, remote SHA, or manifest SHA differs;
- the live remote `release/office` branch is missing or unprotected;
- a required env file, external volume, image, or OCI revision is missing;
- disk remains below threshold after optional BuildKit cache pruning;
- health, smoke, or automatic runtime restoration fails;
- the release requires a schema/data action that has not been explicitly
  approved.

## Final Report

Report the deployed Git SHA and app version, API/web digest refs, workflow run
URL, branch/upstream/clean checks, free disk before and after, container states,
HTTP smoke results, whether BuildKit cache was pruned, and whether rollback was
attempted. Also report whether `-ApplySchema` ran and whether multi-PC and
extension auth verification passed. Never include env contents, credentials,
tokens, password hashes, or database URLs.
