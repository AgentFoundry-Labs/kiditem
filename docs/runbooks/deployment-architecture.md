# Deployment Architecture Runbook

KidItem uses GitHub Actions, GHCR, Docker Compose, nginx, and Supabase. The
deployment architecture intentionally keeps one external host entrypoint while
making app runtime replacement slot-based.

GitHub Actions is the only supported release entrypoint. Local Docker image
streaming over SSH is intentionally not kept because it bypasses GHCR digest
pinning, GitHub Environment secret rendering, deployment manifests, and PR
checks.

The office runtime follows the same build-once and digest-pinning contract but
has a different host boundary. GitHub Actions publishes an operator bundle;
the Windows office PC pulls the exact images and performs a guarded Compose
recreate. It never builds product images locally. Its existing PostgreSQL and
MinIO external volumes plus protected runtime env files remain local under the
office operator boundary.

## Runtime Shape

```text
Internet
  -> host nginx / load balancer
    -> 127.0.0.1:8080
      -> compose nginx
        -> active api slot    api-blue | api-green
        -> active web slot    web-blue | web-green
        -> active worker slot worker-blue | worker-green
```

The office path is:

```text
protected release/office
  -> GitHub Actions -> GHCR digest refs + workflow manifest artifact
    -> Windows office operator -> compose api/worker/web/nginx
      -> local external PostgreSQL and MinIO volumes
```

Each slot uses immutable GHCR image references. The API container sets
`AGENT_RUNTIME_WORKER_ENABLED=0`; the worker container uses the same API image
with `node dist/worker.js` and `AGENT_RUNTIME_WORKER_ENABLED=1`. This keeps
HTTP serving and Agent OS queue draining operationally separate without adding
a second image build. The shared API image also bundles the compiled
`@kiditem/templates` stylesheet used to hydrate saved revisions before the
company Chrome extension captures Wing detail images; the image build fails if
that runtime asset cannot be resolved. The API does not launch Chromium for
this Wing path. The API requires one canonical `WEB_ORIGIN` at bootstrap and
uses it for extension render-document URLs; `CORS_ORIGINS` remains a separate
allowlist. GitHub Actions renders the environment public URL into
`WEB_ORIGIN`, and the remote deploy normalizes and compares both values before
starting a candidate slot.

## CI/CD Gates

- PR checks intentionally run only one fast `git diff --check` hygiene job.
  Authors run the scoped `AGENTS.md` verification and PR body guards locally;
  builds and integration tests do not block the PR feedback loop.
- Every push to `develop` runs one clean dependency install, all deployable
  workspace builds, and the real Postgres integration suite. A newer push
  cancels an obsolete run so only the latest accumulated `develop` HEAD is
  validated.
- Workflow, deploy shell, Compose, and Terraform changes keep their focused
  local syntax checks; those checks are no longer repeated for unrelated PRs.
- Image builds are centralized in `.github/workflows/build-image.yml`.
- Root `VERSION` is selected once for the release train before promotion and is
  reported as release metadata; deploy jobs do not bump it. Git SHA and image
  digest refs remain the exact build and runtime identities.
- Staging deploy pushes `:staging` as a convenience tag but deploys the digest
  reference emitted by the build job.
- A normal staging deploy seeds the explicitly selected organization's
  order-collection mall credentials after post-schema migrations. The
  protected dotenv payload exists only on the GitHub runner; EC2 runtime env
  files receive only the channel encryption key, never mall plaintext.
- Production deploy pushes `:production-candidate` as a convenience tag but
  also deploys the digest reference emitted by the build job.
- Office image builds push `:office-candidate` as a convenience tag but publish
  only API/web digest refs in `office-deployment.json`. The local deploy guard
  requires `release/office`, its exact remote SHA, clean tracked state, approved
  GHCR names, and matching OCI revision labels before a recreate.
- `release/office` is a permanent protected environment branch. It must reject
  deletion and force pushes and must never be removed after a promotion PR.
- Terraform owns host bootstrap, security group shape, Docker/nginx package
  installation, and Elastic IP allocation. Shell scripts under `bin/` must not
  become an alternate deploy path.
- Terraform does not own the current Windows office workstation. Its local
  Docker Desktop installation and stateful volumes remain operator-managed;
  Terraform becomes appropriate only if this workload moves to a reproducible
  long-lived remote host.

## Guarded Authoritative Rebuild

Staging uses a fresh-data reset. Production retains the selective replay flow;
the two environments intentionally do not share data-preservation requirements.

```text
staging:
  immutable Git SHA + correlation UUID + exact database URL hash/name + reset token
  -> quiesce every API, web, worker, and compose-nginx service
  -> export Organization + human User + OrganizationMembership rows
  -> export migration-ledger bookkeeping
  -> private workflow artifact (one-day retention)
  -> Prisma final schema with --force-reset
  -> restore ledger bookkeeping and account rows only
  -> assert zero ChannelAccount rows
  -> deploy and verify /login=200 and unauthenticated /api/auth/me=401
  -> configure actual channel accounts and import Sellpia/WING after deploy

production:
  protected account/source preflight -> quiesce -> selective Coupang export
  -> final schema reset -> baseline bootstrap -> controlled import/replay finalization
```

The destructive path is disabled unless the immutable dispatch SHA, correlation
UUID, database URL hash, URL database name, live `current_database()`, selected
deployment target, the job's fixed GitHub Environment, the workflow input, and
the environment-specific expected token. A blank reset input keeps the normal
non-destructive migration and `prisma db push` path. A wrong non-blank input
fails before export or traffic changes.

The staging artifact is bound to staging, the originating workflow run, full
Git SHA, and a payload hash. It contains account-profile fields and is therefore
private, but it excludes ChannelAccount, credentials/config, source workbooks,
scrape payloads, orders, products, inventory, reviews, and legacy mappings. The
ledger portion records only migration bookkeeping subsumed by the fresh schema;
it does not recover legacy business data. Production's artifact and
finalization rules remain defined by the production deploy runbook.

The artifact expires after one day. Staging uses it only within the same deploy
job, before application startup; post-deploy channel/source setup is independent
of that artifact. The automatic order-collection credential seed is restricted
to normal non-destructive deploys. The guarded destructive path still finishes
with zero ChannelAccount rows until a later normal deploy or explicitly
confirmed manual seed.

Failure recovery is split by the destructive boundary. If a step fails before
the reset boundary, the workflow cleanup step may resume the previous runtime
because the old database is still intact. If a step fails at or after the
reset boundary, the workflow must not resume the previous runtime against the
reset or partially bootstrapped database. Keep the target unavailable and
fix-forward from the exact originating SHA and its private artifact. Do not
blindly rerun the full destructive job after the source database has already
been reset: the account export can no longer be reproduced from that database.
If the originating artifact cannot be used, stop and perform an explicitly
approved database recovery before starting a new reset run.

## Blue-Green Switch

1. Read the active color from `deployments/current.json`; fall back to
   `.env.<env>.deploy`, then `blue`.
2. Pull the candidate API and web images.
3. Require both images' `org.opencontainers.image.revision` labels to equal the
   guarded full Git SHA; record `apiImageRevision` and `webImageRevision`.
4. Write candidate slot image refs into `.env.<env>.deploy`.
5. Require the API `WEB_ORIGIN` to equal the workflow-provided public
   deployment origin after canonical URL normalization.
6. Start only the inactive `api-*`, `web-*`, and `worker-*` services.
7. Wait for API/web health, worker running state, and API render-image browser
   runtime readiness.
8. Render `deployments/nginx.conf` from the environment-specific nginx
   template and reload compose nginx. The generated file is mounted into the
   nginx container as a file bind mount, so the deploy script updates an
   existing file in place and recreates nginx when the container still sees an
   older mounted config.
9. Smoke `/login` and `/api/auth/me` through the local public route.
10. Write `deployments/current.json` and stop the previous slot.

The switch does not roll database migrations back. Production schema changes
must be backward-compatible across the old and new app versions before deploy.

If candidate health fails while the previous slot is still running, the deploy
fails without switching traffic unless downtime was explicitly approved. With
`allow_downtime_for_space=true`, the remote script may stop the current stack,
prune/pull again, and retry the candidate once. This recovers small-host disk or
memory pressure while staying inside the GitHub Actions release entrypoint.
The workflow's `status` operation reports root filesystem and inode capacity,
Docker disk usage, and top-level `/var` and `/opt` usage so persistent ENOSPC
failures can be separated from reclaimable image pressure before another deploy.

## Staging Retirement Boundary

The immutable staging workflow has a guarded `retire` operator for a reversible
runtime shutdown. It writes `deployments/retired.json` and stops `api-blue`,
`web-blue`, `worker-blue`, `api-green`, `web-green`, `worker-green`, and
`nginx`. The marker blocks deploy and rollback until the separate `restore`
operator resumes the runtime and removes the marker after health checks.

Both operators require the staging GitHub Environment, immutable workflow SHA,
and correlation UUID. Dispatch them with their exact confirmations:

```bash
workflow_code_sha="$(rtk git rev-parse origin/main)"
dispatch_correlation_id="$(rtk node -e 'console.log(require("node:crypto").randomUUID())')"
rtk gh workflow run staging-deploy.yml --ref "$workflow_code_sha" \
  -f operation=retire \
  -f deployment_target=staging \
  -f expected_git_sha="$workflow_code_sha" \
  -f dispatch_correlation_id="$dispatch_correlation_id" \
  -f retirement_confirmation=RETIRE_STAGING

rtk gh workflow run staging-deploy.yml --ref "$workflow_code_sha" \
  -f operation=restore \
  -f deployment_target=staging \
  -f expected_git_sha="$workflow_code_sha" \
  -f dispatch_correlation_id="$(rtk node -e 'console.log(require("node:crypto").randomUUID())')" \
  -f retirement_confirmation=RESUME_RETIRED_STAGING
```

Each operation ends with remote `status`. After retirement, run a separate
`operation=status` query and require `deployments/retired.json`, all seven
services stopped, and public `/login` not HTTP `200`; retirement fails when the
public probe still returns `200`. After restore, require the normal public
smoke contract: `/login -> 200` and `/api/auth/me -> 401`.

Retirement has a no data deletion boundary: it keeps the EC2 host, attached and
Docker volumes, Supabase data, uploaded assets, and runtime configuration.
Terraform and Supabase destruction remain a separate later boundary, after
Office local auth is implemented and verified.

## Rollback Boundary

Rollback selects an existing immutable image tag and deploys it to the inactive
slot using the same blue-green flow. It is safe for runtime regressions only.
It does not undo:

- Prisma schema changes.
- Data migrations.
- External side effects already written to marketplaces, storage, or queues.

If a deploy includes schema/data changes, verify the rollback story before
running production deploy.

The office runtime keeps `current.json` and `previous.json` under
`C:\ProgramData\Kiditem\deployments`. Rollback pulls and verifies the prior
digest refs through the same branch, revision, health, and smoke guards. Office
rollback also does not reverse schema, data, storage, queue, or marketplace
side effects. See [Office Deploy](office-deploy.md).

## Office Disk Boundary

Office deployments require a free-space guard before image pulls. The only
automated cleanup is bounded BuildKit cache pruning with
`docker buildx prune --max-used-space 5gb`; named volumes and broad Docker
system pruning are prohibited. If that is insufficient, move Docker Desktop's
disk image to a larger local SSD during an approved maintenance window. A NAS
share may hold verified backups but is not an active repository, Docker data,
database, or object-storage root.

## Verification

Before changing deployment architecture:

```bash
bash -n deploy/staging/render-runtime-env.sh deploy/staging/remote-deploy.sh deploy/production/remote-deploy.sh infra/terraform/modules/single-host/user-data.sh
shellcheck deploy/staging/render-runtime-env.sh deploy/staging/remote-deploy.sh deploy/production/remote-deploy.sh infra/terraform/modules/single-host/user-data.sh
npm run build --workspace=apps/server
powershell -NoProfile -Command '$tokens = $null; $errors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile("deploy/office/apply-deployment.ps1",[ref]$tokens,[ref]$errors); if ($errors.Count) { $errors; exit 1 }'
docker compose --env-file deploy/office/office.env.example --env-file deploy/office/digest.env.example -f deploy/office/compose.office.yml config --quiet
npm run test:scripts
```

After remote deploy:

```bash
./deploy/staging/remote-deploy.sh status
curl -sS -o /dev/null -w '%{http_code}\n' "$PUBLIC_URL/login"
curl -sS -o /dev/null -w '%{http_code}\n' "$PUBLIC_URL/api/auth/me"
```
