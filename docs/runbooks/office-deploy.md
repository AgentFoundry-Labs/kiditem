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
runtime-file restoration on an application-only failed health check. An
approved schema change is applied explicitly with `-ApplySchema`; database
changes remain outside runtime rollback and must be assessed separately for
every release. An accepted-data-loss push uses the recovery state machine below
and never automatically starts either runtime after a failed or indeterminate
schema boundary.

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
- `recovery-operation-policy.json`

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
`--force-reset`. Also pass an existing, operator-approved NAS recovery
directory. The script rejects a destructive deploy without it:

```powershell
$recoveryCopyDirectory = '\\<nas-host>\<backup-share>\kiditem\<full-sha>'
New-Item -ItemType Directory -Force -Path $recoveryCopyDirectory | Out-Null
& "C:\ProgramData\Kiditem\incoming\<full-sha>\apply-deployment.ps1" `
  -Operation Deploy `
  -ManifestPath "C:\ProgramData\Kiditem\incoming\<full-sha>\office-deployment.json" `
  -ApplySchema `
  -AcceptDataLoss `
  -RecoveryCopyDirectory $recoveryCopyDirectory
```

This one command owns the destructive cutover ordering:

1. Validate arguments and the live checkout, then acquire the exclusive
   OS-backed deployment mutation lock before reading recovery state or policy.
   Hold it through guard decisions, runtime/file work, failure handling, and
   final marker state. Validate image, volume, disk, Compose, prior-manifest,
   and recovery-directory prerequisites under that lock.
2. Stop API, worker, web, and nginx. Keep PostgreSQL and MinIO running and
   healthy.
3. With writers still stopped, create a custom-format PostgreSQL dump under
   `C:\ProgramData\Kiditem\recovery`, require a non-empty
   `pg_restore --list`, compute its SHA-256, copy it to the selected NAS
   directory, and require the copy SHA-256 to match.
4. Persist `deployments\recovery-required.json` with the dump SHA, local and
   recovery-copy paths, candidate Git SHA, stable candidate-manifest identity
   SHA-256, prior Git SHA, and exact prior manifest SHA. The marker contains no
   credentials.
5. Run Prisma schema push while writers remain stopped, then start and health
   check the candidate. Persist `schema-push-completed` atomically after push;
   retain it throughout candidate health/smoke and every current, previous,
   history, and bundle write. Persist `deployed` only as the last durable
   transaction action. Keep the marker after success so runtime-only rollback
   remains blocked across later operator sessions.

`Deploy`, `Rollback`, and `CompleteRecovery` share this lock. Another mutating
operator fails before any stop, dump, restore, container start, or marker
transition. The handle is released on success and failure; a leftover lock file
is harmless because ownership is the open OS handle, not file presence.
`Status` remains lock-free and reads only atomically replaced state files.
Both the recovery marker and `current.json` use atomic replace-or-create writes.

Do not take manual row counts or a dump before invoking the command and treat
them as cutover evidence: writes could occur afterward. The verified dump is
the pre-drop recovery record for the destructive cutover. Record its SHA and
recovery-copy path as reported by the operator command.

If the release includes durable data migrations, run the approved phase order
against the Office database with a fresh backup in place:

```powershell
npm run data:migrate -- up --phase pre-schema --release-version <VERSION> --target office `
  --confirm APPLY_DATA_MIGRATIONS

& "C:\ProgramData\Kiditem\incoming\<full-sha>\apply-deployment.ps1" `
  -Operation Deploy `
  -ManifestPath "C:\ProgramData\Kiditem\incoming\<full-sha>\office-deployment.json" `
  -ApplySchema `
  -AcceptDataLoss `
  -RecoveryCopyDirectory $recoveryCopyDirectory

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

Rollback is valid for application regressions only. It does not undo Prisma schema changes,
data migrations, marketplace writes, object-storage changes,
or queued jobs. While `deployments\recovery-required.json` records a destructive
schema boundary, runtime-only `Rollback` is blocked even after a successful
candidate deploy. Every later `-ApplySchema` deployment is also blocked, whether
or not it requests `-AcceptDataLoss`. The only permitted forward deployment is
application-only, and its pre-deploy `current.json` must have both the candidate
Git SHA and stable manifest-identity SHA-256 recorded by the marker. The script
archives and removes the marker only after that forward deployment completes
its runtime health/smoke checks and deployment-record finalization. A mismatch
blocks before any deployment mutation; an application-only failure restores the
compatible candidate runtime and preserves the marker.

If post-push finalization fails, application writers remain stopped. A failed
attempt to atomically persist `recovery-required` cannot corrupt or remove the
existing `schema-push-completed` marker, so the next mutating operation remains
blocked. Failure to win atomic marker creation also keeps writers stopped; it
never enters automatic runtime restoration.

The operation and marker-transition rules live in
`recovery-operation-policy.json`, which is shipped in the immutable operator
bundle and consumed directly by the PowerShell script. Unknown combinations are
denied. Recovery marker schema v2 requires the candidate manifest identity. An
older or incomplete marker is invalid; never delete or hand-edit it to bypass
this guard. Destructive artifact capture atomically fails when a marker already
exists and never archives or replaces the active boundary.

If a destructive schema push or subsequent candidate health/smoke check fails,
the script stops API, worker, web, and nginx, retains PostgreSQL and MinIO, marks
the state `recovery-required`, and does not invoke automatic runtime restoration.
Do not use raw Compose commands to start either prior or candidate application
containers. Restore the recorded database and prior runtime together using this
procedure:

```powershell
# Read only the credential-free recovery identity and select its recorded dump.
$state = Get-Content `
  'C:\ProgramData\Kiditem\deployments\recovery-required.json' -Raw |
  ConvertFrom-Json
$dump = $state.recoveryCopyPath
$priorManifest =
  "C:\ProgramData\Kiditem\deployments\bundles\$($state.priorGitSha)\office-deployment.json"

# Verify the exact recorded artifact before any database mutation.
$actualSha = (Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha -ne $state.dumpSha256) { throw 'Recovery dump SHA256 mismatch.' }
docker cp $dump kiditem-postgres:/tmp/kiditem-recovery.dump
docker exec kiditem-postgres pg_restore --list /tmp/kiditem-recovery.dump
if ($LASTEXITCODE -ne 0) { throw 'Recovery dump catalog verification failed.' }

# With application writers still stopped, perform the reviewed full restore.
docker exec kiditem-postgres psql --username=kiditem --dbname=postgres `
  --set ON_ERROR_STOP=1 `
  --command "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'kiditem' AND pid <> pg_backend_pid();"
if ($LASTEXITCODE -ne 0) { throw 'Connection termination failed.' }
docker exec kiditem-postgres dropdb --username=kiditem --if-exists kiditem
if ($LASTEXITCODE -ne 0) { throw 'Database drop failed.' }
docker exec kiditem-postgres createdb --username=kiditem --owner=kiditem kiditem
if ($LASTEXITCODE -ne 0) { throw 'Database create failed.' }
docker exec kiditem-postgres pg_restore --exit-on-error --no-owner `
  --username=kiditem --dbname=kiditem /tmp/kiditem-recovery.dump
if ($LASTEXITCODE -ne 0) { throw 'Database restore failed; keep writers stopped.' }

# This identity-bound acknowledgement verifies the artifact and prior manifest,
# starts the prior runtime, and clears the marker only after health/smoke pass.
& C:\workspace\kiditem\deploy\office\apply-deployment.ps1 `
  -Operation CompleteRecovery `
  -RecoveryArtifactPath $dump `
  -RecoveredDatabaseDumpSha256 $state.dumpSha256 `
  -RecoveredPriorManifestPath $priorManifest
```

`CompleteRecovery` does not restore the database. Its dump SHA parameter is the
explicit assertion that the preceding restore used that exact artifact, not a
generic override. It independently hashes and catalog-checks the artifact and
verifies both the prior manifest file hash and prior Git SHA before starting the
prior runtime. Any validation, health, or smoke failure leaves writers stopped
and preserves the marker.

## Blockers

Stop without rebuilding, resetting, switching branches, or pruning volumes if:

- the branch, upstream, clean status, remote SHA, or manifest SHA differs;
- the live remote `release/office` branch is missing or unprotected;
- a required env file, external volume, image, or OCI revision is missing;
- disk remains below threshold after optional BuildKit cache pruning;
- health, smoke, or automatic runtime restoration fails;
- `deployments\recovery-required.json` exists and the requested operation is
  not the documented identity-bound recovery or an allowed forward deploy;
- the release requires a schema/data action that has not been explicitly
  approved.

## Final Report

Report the deployed Git SHA and app version, API/web digest refs, workflow run
URL, branch/upstream/clean checks, free disk before and after, container states,
HTTP smoke results, whether BuildKit cache was pruned, and whether rollback was
attempted. Also report whether `-ApplySchema` ran and whether multi-PC and
extension auth verification passed. Never include env contents, credentials,
tokens, password hashes, or database URLs.
