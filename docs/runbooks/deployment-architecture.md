# Deployment Architecture Runbook

KidItem uses GitHub Actions, GHCR, Docker Compose, nginx, and Supabase. The
deployment architecture intentionally keeps one external host entrypoint while
making app runtime replacement slot-based.

GitHub Actions is the only supported release entrypoint. Local Docker image
streaming over SSH is intentionally not kept because it bypasses GHCR digest
pinning, GitHub Environment secret rendering, deployment manifests, and PR
checks.

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

Each slot uses immutable GHCR image references. The API container sets
`AGENT_RUNTIME_WORKER_ENABLED=0`; the worker container uses the same API image
with `node dist/worker.js` and `AGENT_RUNTIME_WORKER_ENABLED=1`. This keeps
HTTP serving and Agent OS queue draining operationally separate without adding
a second image build.

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
- Staging deploy pushes `:staging` as a convenience tag but deploys the digest
  reference emitted by the build job.
- Production deploy pushes `:production-candidate` as a convenience tag but
  also deploys the digest reference emitted by the build job.
- Terraform owns host bootstrap, security group shape, Docker/nginx package
  installation, and Elastic IP allocation. Shell scripts under `bin/` must not
  become an alternate deploy path.

## Guarded Authoritative Rebuild

Release `0.1.8` is a one-release reconstruction boundary, not an expand/contract
migration. Staging and production use the same fail-closed sequence:

```text
exact RESET_<ENVIRONMENT>_DATA input + matching GitHub Environment
  -> quiesce every API, web, worker, and compose-nginx service
  -> sanitized Coupang run/snapshot/daily-fact export
  -> private workflow artifact (one-day retention)
  -> Prisma final schema with --force-reset
  -> minimum organization/user/membership/channel-account baseline
  -> deploy application with inventory.rebuild.status=snapshot_required
  -> authenticated operator Sellpia import
  -> authenticated operator Wing import
  -> authenticated Coupang replay from the originating artifact
  -> exact fact/count verification and state=ready
```

The destructive path is disabled unless all four values agree: the selected
deployment target, the job's fixed GitHub Environment, the workflow input, and
the environment-specific expected token. A blank reset input keeps the normal
non-destructive migration and `prisma db push` path. A wrong non-blank input
fails before export or traffic changes.

The replay artifact is bound to the target, organization, and originating
workflow run ID. It excludes bootstrap credentials, channel account config,
PII-shaped fields, orders, reviews, and legacy mapping rows. Finalization must
run in the same protected GitHub Environment, download that exact run's private
artifact, and compare replay/import counts with the approved manifest-backed
Environment variables. Missing imports, missing expected counts, a mismatched
run, or any count difference leaves the environment snapshot-required.

The artifact expires after one day. If authenticated Sellpia and Wing imports
cannot be completed within that window, do not improvise a database copy or
extend the artifact with credentials; start a new guarded rebuild run.

Failure recovery is split by the destructive boundary. If a step fails before
the reset boundary, the workflow cleanup step may resume the previous runtime
because the old database is still intact. If a step fails at or after the
reset boundary, the workflow must not resume the previous runtime against the
reset or partially bootstrapped database. Keep the target unavailable and
fix-forward from the exact originating SHA and its private artifact. Do not
blindly rerun the full destructive job after the source database has already
been reset: the selective export can no longer be reproduced from that
database. If the originating artifact or baseline cannot be used, stop and
perform an explicitly approved database recovery before starting a new reset
run.

## Blue-Green Switch

1. Read the active color from `deployments/current.json`; fall back to
   `.env.<env>.deploy`, then `blue`.
2. Pull the candidate API and web images.
3. Write candidate slot image refs into `.env.<env>.deploy`.
4. Start only the inactive `api-*`, `web-*`, and `worker-*` services.
5. Wait for API/web health, worker running state, and API render-image browser
   runtime readiness.
6. Render `deployments/nginx.conf` from the environment-specific nginx
   template and reload compose nginx. The generated file is mounted into the
   nginx container as a file bind mount, so the deploy script updates an
   existing file in place and recreates nginx when the container still sees an
   older mounted config.
7. Smoke `/login` and `/api/auth/me` through the local public route.
8. Write `deployments/current.json` and stop the previous slot.

The switch does not roll database migrations back. Production schema changes
must be backward-compatible across the old and new app versions before deploy.

If candidate health fails while the previous slot is still running, the deploy
fails without switching traffic unless downtime was explicitly approved. With
`allow_downtime_for_space=true`, the remote script may stop the current stack,
prune/pull again, and retry the candidate once. This recovers small-host disk or
memory pressure while staying inside the GitHub Actions release entrypoint.

## Rollback Boundary

Rollback selects an existing immutable image tag and deploys it to the inactive
slot using the same blue-green flow. It is safe for runtime regressions only.
It does not undo:

- Prisma schema changes.
- Data migrations.
- External side effects already written to marketplaces, storage, or queues.

If a deploy includes schema/data changes, verify the rollback story before
running production deploy.

## Verification

Before changing deployment architecture:

```bash
bash -n deploy/staging/render-runtime-env.sh deploy/staging/remote-deploy.sh deploy/production/remote-deploy.sh infra/terraform/modules/single-host/user-data.sh
shellcheck deploy/staging/render-runtime-env.sh deploy/staging/remote-deploy.sh deploy/production/remote-deploy.sh infra/terraform/modules/single-host/user-data.sh
npm run build --workspace=apps/server
```

After remote deploy:

```bash
./deploy/staging/remote-deploy.sh status
curl -sS -o /dev/null -w '%{http_code}\n' "$PUBLIC_URL/login"
curl -sS -o /dev/null -w '%{http_code}\n' "$PUBLIC_URL/api/auth/me"
```
