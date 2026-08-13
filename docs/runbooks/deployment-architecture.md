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
        -> API + worker + web + nginx
```

The Office checkout is always `release/office`, tracking
`origin/release/office`. Product images are built once and identified by
immutable digest references. The Office host pulls those refs and performs a
guarded Compose recreate; it does not build product images during deployment.

Runtime configuration, deployment history, and stateful volumes stay under the
Office operator boundary. The repository contains no EC2 bootstrap, Terraform
host stack, public DNS contract, hosted Compose file, or hosted environment
secret contract.

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
the prior runtime files when an application-only candidate health check fails.
Runtime rollback does not undo Prisma schema changes, data migrations,
marketplace writes, object-storage changes, or queued jobs.

An accepted-data-loss schema deploy has a stricter state machine. The operator
script stops API, worker, web, and nginx first while leaving PostgreSQL and
MinIO running. In that quiesced state it creates a PostgreSQL custom-format
dump, verifies its `pg_restore --list` catalog, hashes it with SHA-256, copies
it to the operator-selected recovery directory, verifies the copy hash, and
records the dump plus candidate/prior manifest identities in
`deployments/recovery-required.json`. Only then may Prisma push the schema.
Application writers stay stopped throughout this sequence.

The marker survives a successful destructive deployment because a runtime-only
rollback is still incompatible with the contracted database. A later successful
application-only deployment may make the destructive candidate the safe runtime
rollback target and archive the marker, but only when the pre-deploy
`current.json` Git SHA and stable manifest-identity SHA-256 exactly match the
candidate identity recorded in the marker. A mismatch blocks deployment. Every
`-ApplySchema` deployment remains blocked while the marker exists, with or
without `-AcceptDataLoss`. If schema push or candidate health is failed or
indeterminate, the marker changes to `recovery-required`; automatic runtime
restoration is disabled and application writers remain stopped.
`Deploy` and `Rollback` are then blocked. `CompleteRecovery` can clear the
marker only after the operator restores the recorded dump manually and supplies
the same dump SHA-256 plus the exact prior manifest. The script re-hashes and
catalog-checks the artifact, verifies the prior manifest SHA and Git SHA, starts
the prior runtime, and clears the marker only after health and smoke checks pass.
It never claims to restore the database itself.

The operator bundle includes `recovery-operation-policy.json`. It is the shared,
fail-closed operation/transition table consumed by PowerShell and exercised by
cross-platform Node tests. Unknown combinations are denied. Recovery marker
schema v2 requires the candidate Git SHA and stable candidate-manifest identity
SHA-256; an older or incomplete marker is invalid and must not be removed or
edited to bypass recovery. Artifact capture atomically creates a new marker and
fails if one already exists; it never archives or replaces an active boundary.

## Security Boundary

- Office environment files remain outside Git and are never workflow inputs.
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
