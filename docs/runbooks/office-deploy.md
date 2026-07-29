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
- Repository variables `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are configured for the office web
  build. These values are compiled into the browser bundle and are not runtime
  secrets.
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
runtime-file restoration on a failed health check. Database migrations remain
outside runtime rollback and must be assessed separately for every release.

## Promote The Office Branch

Normal work still merges into `develop`. Promote an approved `develop` commit
to `release/office` through a reviewed PR. The office branch is a persistent
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
  -ManifestPath "C:\ProgramData\Kiditem\incoming\<full-sha>\office-deployment.json"
```

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

Rollback is valid for application regressions only. It does not undo Prisma
schema changes, data migrations, marketplace writes, object-storage changes,
or queued jobs. If a release changes the database incompatibly, block rollout
until a separate data recovery or forward-fix plan is approved.

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
attempted. Never include env contents, credentials, tokens, or database URLs.
