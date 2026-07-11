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

- PR checks run workflow lint, deploy shell lint, app lint, app builds, real
  Postgres integration tests, and reconstruction/release/convention scanners.
- Image builds are centralized in `.github/workflows/build-image.yml`.
- Staging deploy pushes `:staging` as a convenience tag but deploys the digest
  reference emitted by the build job.
- Production deploy pushes `:production-candidate` as a convenience tag but
  also deploys the digest reference emitted by the build job.
- Terraform owns host bootstrap, security group shape, Docker/nginx package
  installation, and Elastic IP allocation. Shell scripts under `bin/` must not
  become an alternate deploy path.

## Schema Transition Gate

Staging and production share one ordered database release boundary before the
blue-green image switch:

```text
pre-schema ledger migrations
  -> repeatable read-only channel SKU identity preflight
  -> ordinary Prisma db push with exact-warning guard
  -> Prisma client generation
  -> post-schema ledger migrations
```

The identity preflight runs on every deployment immediately before schema push
and writes no schema, row, workbook, or migration-ledger state. Its job-local
marker is set only after exit `0`. Prisma remains schema truth: the workflow
does not install SQL overlay indexes. A warning-accepted rerun is possible only
when the captured log contains a non-empty subset of the four mapped channel
identity unique additions and no drop, extra warning, unrecognized constraint,
or non-warning failure.

Local and staging ledger mutation targets still reject production-looking
URLs. The production ledger target is restricted to GitHub Actions and needs
both `APPLY_DATA_MIGRATIONS` and `DEPLOY_PRODUCTION` confirmations inside the
protected `production` Environment job.

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
