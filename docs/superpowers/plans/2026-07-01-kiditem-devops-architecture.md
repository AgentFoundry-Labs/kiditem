# KidItem DevOps Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade KidItem DevOps from "working staging pipeline" to a safer release system with stronger PR gates, clearer ownership, reusable workflows, blue-green staging, worker separation, production promotion, observability, and eventual IaC.

**Architecture:** Keep the boring stack first: GitHub Actions, GHCR, Docker Compose, nginx, Prisma, and existing EC2 staging. Add blue-green deployment, a release pattern where the new app copy starts beside the old copy and traffic switches only after health checks pass. Kubernetes is explicitly deferred; if KidItem outgrows Compose, the next target is ECS Fargate with ALB and CodeDeploy blue-green, not k3s by default.

**Tech Stack:** GitHub Actions, GitHub Environments, GHCR, Docker Buildx, Docker Compose, nginx, NestJS, Next.js, Prisma, Vitest, shellcheck, actionlint, Terraform/OpenTofu later.

---

## Scope Decision

This is not one PR.

The plan touches platform boundaries, `.github/`, `deploy/`, staging runtime scripts, Docker Compose, and production deployment. Root `AGENTS.md` says cross-layer controls and platform boundaries need explicit classification. This is a DevEx / CI / docs / platform-boundary plan.

The complete implementation is split into eight phases. Each phase should ship as an independent PR unless the change is tiny and verified locally.

```
Phase 1  PR quality gates
Phase 2  CODEOWNERS and PR routing
Phase 3  reusable workflow extraction
Phase 4  staging blue-green deploy
Phase 5  api / worker process split
Phase 6  production promotion workflow
Phase 7  observability and notifications
Phase 8  IaC baseline
```

## What Already Exists

| Existing asset | Path | Reuse decision |
|---|---|---|
| PR reconstruction and release/data guardrails | `.github/workflows/pr-checks.yml` | Reuse. Add build/lint/test jobs beside it, do not replace it. |
| Staging deploy workflow | `.github/workflows/staging-deploy.yml` | Reuse. Extract repeated image build logic only after behavior is locked. |
| API runtime base image workflow | `.github/workflows/api-base-image.yml` | Reuse. Keep Chromium-heavy runtime layer separate. |
| Staging DB baseline workflow | `.github/workflows/staging-db.yml` | Reuse. Do not fold DB reset/export into app deploy. |
| Runtime env renderer | `deploy/staging/render-runtime-env.sh` | Reuse. Add validation tests and keep secret material generated at deploy time. |
| Remote staging deploy script | `deploy/staging/remote-deploy.sh` | Reuse. Extend to slots instead of replacing with a new deploy tool. |
| Staging Compose file | `docker-compose.staging.yml` | Reuse. Split into blue/green services in Phase 4. |
| Existing smoke checks | `remote-deploy.sh`, `staging-deploy.yml` | Reuse. Preserve `/login`, `/api/auth/me`, and Puppeteer runtime checks. |
| Deployment manifest | `deployments/current.json` on staging host | Reuse. Add slot, previous slot, and promotion fields. |
| Test strategy | `docs/TESTING.md` | Reuse. Prefer scanner/build/smoke for CI infra unless behavior risk needs integration. |

## Reference Adoption Matrix

This section answers the direct question: from the two reference repositories, what should KidItem adopt if we only care about using the better operating model and not about short-term switching cost?

| Reference | Pattern | Decision | Reason |
|---|---|---|---|
| `depromeet/layer-server` | blue-green deploy with nginx switch | Adopt, but harden | This is the strongest reference pattern. KidItem should copy the shape, not the exact script. Add bounded health checks, rollback after failed public smoke, digest refs, and manifests. |
| `depromeet/layer-server` | push to `develop/main` auto-deploys | Reject | KidItem has schema/data migrations and marketplace operations. Manual `workflow_dispatch` plus GitHub Environment approval is safer. |
| `depromeet/layer-server` | mutable Docker tags `dev` / `prod` | Reject | KidItem already uses GHCR SHA/digest refs. That is better for rollback and audit. |
| `depromeet/layer-server` | SCP infra bundle and run remote script | Partially adopt | KidItem already does this. Keep the simple remote script model short-term, but reduce risk with slot state, manifest, and stricter validation. |
| `depromeet/layer-server` | build artifact upload before Docker build | Reject | KidItem's Dockerfiles already build app artifacts inside image builds. Do not add an extra artifact path unless build time becomes a bottleneck. |
| `depromeet/layer-server` | no timeout in health loop | Reject | Infinite deploy loops are an incident shape. KidItem must use bounded attempts. |
| `depromeet/layer-server` | dev/prod on same host with separate ports | Reject for production | Useful for a small team, but production should be a separate environment. Staging can rehearse blue-green on one host. |
| `depromeet/dpm-core-client` | manual deploy dispatch with stage/app choices | Adopt | KidItem should keep explicit operator choice. This maps cleanly to `operation=deploy/status/rollback` and later component choices. |
| `depromeet/dpm-core-client` | reusable workflow called by dispatch workflow | Adopt | Extract image build jobs first. Keep environment-secret deploy jobs in the caller workflow. |
| `depromeet/dpm-core-client` | matrix deploy for `admin/client/all` | Adopt later | Useful once KidItem separates `api`, `web`, and `worker` promotion. Do not force it before Phase 5. |
| `depromeet/dpm-core-client` | `pnpm check-types` before deploy | Adopt equivalent | KidItem should run app build/lint in PR checks and before deploy where cheap. |
| `depromeet/dpm-core-client` | Vercel pull/build/deploy | Reject | KidItem deploys web and API as containers behind nginx. Vercel is not the target runtime. |
| `depromeet/dpm-core-client` | CODEOWNERS | Adopt | KidItem has clear domain ownership in `AGENTS.md`; CODEOWNERS should route reviews. |
| `depromeet/dpm-core-client` | auto PR assignee | Optional adopt | Low cost, but less important than CODEOWNERS. |
| `depromeet/dpm-core-client` | Next `ignoreBuildErrors: true` | Reject | KidItem should fail builds on type errors. |

Net: the plan adopts every reference pattern that is clearly better for KidItem's operating model. It rejects patterns that are weaker than KidItem's current posture or mismatched to KidItem's runtime.

## NOT In Scope

- Kubernetes or k3s migration: deferred because Compose plus blue-green solves the current reliability problem with less operational burden.
- Replacing GHCR: deferred because current digest-based GHCR deploy is already safer than Docker Hub mutable tag deploy.
- Replacing Prisma schema workflow with Prisma Migrate production migrations: deferred until production DB process is designed separately.
- Full production cutover in the first PR: deferred. Production deploy depends on staging blue-green and manifest proving out first.
- Secrets manager migration: deferred. This plan keeps GitHub Environment secrets and generated env files, then documents the future IaC boundary.
- Agent OS behavior changes: deferred. Phase 5 separates process/runtime ownership without changing agent semantics.
- ECS Fargate migration: deferred. The plan keeps ECS as a later target once Compose blue-green and promotion semantics are stable.

## Target Release Pipeline

```
PR
 |
 v
+------------------------+
| PR Checks              |
| - guardrails           |
| - web build/lint       |
| - server build/lint    |
| - shared build         |
| - actionlint/shellcheck|
+------------------------+
 |
 v
manual staging deploy
 |
 v
+------------------------+       +----------------------+
| Build immutable images | ----> | GHCR                 |
| api / web / later worker|      | sha + digest refs    |
+------------------------+       +----------------------+
 |
 v
+------------------------+
| Staging DB protocol    |
| pre-schema             |
| schema apply           |
| post-schema            |
+------------------------+
 |
 v
+------------------------+
| Blue-green staging     |
| deploy inactive slot   |
| smoke inactive slot    |
| switch nginx upstream  |
| record manifest        |
+------------------------+
 |
 v
production approval
 |
 v
production promotion from immutable tag or digest
```

## Blue-Green State Machine

nginx acts as the reverse proxy, the process that receives public traffic and routes it to the current web/api containers.

```
current-slot.env
  CURRENT_SLOT=blue

deploy starts
  |
  v
inactive = green
  |
  v
pull images by digest
  |
  v
start kiditem-staging-api-green + kiditem-staging-web-green
  |
  v
health checks on green
  |-- fail --> keep blue active, show green logs, exit non-zero
  |
  v
render nginx upstream -> green
  |
  v
nginx -s reload
  |
  v
public smoke checks
  |-- fail --> switch nginx back to blue, show green logs, exit non-zero
  |
  v
write manifest with slot=green, previousSlot=blue
  |
  v
stop old blue after grace period
```

## Phase 1: PR CI Quality Gates

**Purpose:** Stop broken app builds from passing PR checks.

**Files**
- Modify: `.github/workflows/pr-checks.yml`
- Modify: `docs/TESTING.md`
- No app source changes.

**Implementation**

- [ ] Add independent jobs to `pr-checks.yml`:
  - `web-build`
  - `server-build`
  - `shared-build`
  - `web-lint`
  - `server-lint`
  - `workflow-lint`
  - `deploy-shell-lint`

- [ ] Use Node 22 and `npm ci --ignore-scripts` consistently.

- [ ] Add workflow lint command:

```yaml
      - name: Lint GitHub Actions workflows
        run: npx --yes actionlint
```

- [ ] Add deploy shell syntax checks:

```yaml
      - name: Check deploy shell syntax
        run: |
          set -euo pipefail
          bash -n deploy/staging/render-runtime-env.sh
          bash -n deploy/staging/remote-deploy.sh
```

- [ ] Add shellcheck after installing it:

```yaml
      - name: Install shellcheck
        run: sudo apt-get update && sudo apt-get install -y shellcheck

      - name: Shellcheck deploy scripts
        run: shellcheck deploy/staging/render-runtime-env.sh deploy/staging/remote-deploy.sh
```

- [ ] Update the stale `docs/TESTING.md` CI section. It currently describes `.github/workflows/` as absent. Replace that with the real PR Checks shape after Phase 1 merges:

```markdown
## CI 통합

`.github/workflows/pr-checks.yml` runs PR guardrails, convention scanners, script tests, app builds, lint, workflow lint, and deploy script syntax checks. Real DB integration remains opt-in unless a PR changes transaction, tenant isolation, raw SQL, schema, or data migration behavior.
```

**Verification**

Run locally before opening the PR:

```bash
npm run build --workspace=apps/web
npm run build --workspace=apps/server
cd packages/shared && npm run build
npm run lint --workspace=apps/web
npm run lint --workspace=apps/server
npx --yes actionlint
bash -n deploy/staging/render-runtime-env.sh
bash -n deploy/staging/remote-deploy.sh
```

Expected:
- Build commands pass or expose existing unrelated build failures before CI changes merge.
- `actionlint` has no YAML/workflow syntax errors.
- `bash -n` has no syntax errors.

## Phase 2: CODEOWNERS And PR Routing

**Purpose:** Make review ownership automatic and reduce human coordination.

**Files**
- Create: `.github/CODEOWNERS`
- Optional create: `.github/workflows/auto-assignee.yml`
- Do not modify `CLAUDE.md` in this phase.

**Implementation**

- [ ] Create `.github/CODEOWNERS` using real GitHub handles or team slugs. Start coarse if team slugs are not final.

```text
/.github/ @agentfoundry-labs/devops
/deploy/ @agentfoundry-labs/devops
/docker-compose*.yml @agentfoundry-labs/devops

/prisma/ @agentfoundry-labs/backend
/packages/shared/ @agentfoundry-labs/backend @agentfoundry-labs/frontend
/packages/templates/ @agentfoundry-labs/frontend

/apps/server/ @agentfoundry-labs/backend
/apps/web/ @agentfoundry-labs/frontend
/agents/ @agentfoundry-labs/automation
/extensions/ @agentfoundry-labs/automation
```

- [ ] If the team wants automatic author assignment, add:

```yaml
name: Auto Assignee PR

on:
  pull_request:
    types: [opened, ready_for_review]

jobs:
  assign:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: hkusu/review-assign-action@v1
        with:
          assignees: ${{ github.actor }}
```

**Verification**

- Open a draft PR changing `.github/`, `apps/server/`, and `apps/web/`.
- Confirm GitHub suggests the expected reviewers.
- Confirm the PR author is assigned only if `auto-assignee.yml` is included.

## Phase 3: Reusable Workflow Extraction

**Purpose:** Reduce repeated Docker Buildx logic in `staging-deploy.yml` without changing deploy semantics.

**Files**
- Create: `.github/workflows/build-image.yml`
- Modify: `.github/workflows/staging-deploy.yml`

**Architecture Constraint**

GitHub reusable workflows can use `workflow_call`, but environment secrets do not behave like ordinary passed secrets. Keep jobs that need the `staging` environment, DB secrets, SSH keys, and runtime env rendering in `staging-deploy.yml`. Extract image build jobs only.

**Implementation**

- [ ] Create `.github/workflows/build-image.yml`:

```yaml
name: Build Image

on:
  workflow_call:
    inputs:
      image_base:
        required: true
        type: string
      dockerfile:
        required: true
        type: string
      cache_scope:
        required: true
        type: string
      title:
        required: true
        type: string
      app_version:
        required: true
        type: string
      build_args:
        required: false
        type: string
        default: ""
    outputs:
      image_ref:
        value: ${{ jobs.build.outputs.image_ref }}
      digest:
        value: ${{ jobs.build.outputs.digest }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image_ref: ${{ steps.image_refs.outputs.image_ref }}
      digest: ${{ steps.build.outputs.digest }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - uses: docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f # v3
      - uses: docker/login-action@4907a6ddec9925e35a0a9e82d7399ccc52663121 # v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@030e881dbc7a6894de51c315a6bfe6a94e05cf # v6
        with:
          images: ${{ inputs.image_base }}
          tags: |
            type=raw,value=${{ github.sha }}
            type=raw,value=staging
          labels: |
            org.opencontainers.image.title=${{ inputs.title }}
            org.opencontainers.image.revision=${{ github.sha }}
            org.opencontainers.image.version=${{ inputs.app_version }}
      - id: build
        uses: docker/build-push-action@bcafcacb16a39f128d818304e6c9c0c18556b85f # v7
        with:
          context: .
          file: ${{ inputs.dockerfile }}
          platforms: linux/amd64
          push: true
          build-args: ${{ inputs.build_args }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=${{ inputs.cache_scope }}
          cache-to: type=gha,mode=max,scope=${{ inputs.cache_scope }}
      - id: image_refs
        run: echo "image_ref=${{ inputs.image_base }}@${{ steps.build.outputs.digest }}" >> "$GITHUB_OUTPUT"
```

- [ ] Replace `build_api` and `build_web` bodies in `staging-deploy.yml` with calls to `build-image.yml`.

- [ ] Keep `prepare`, `deploy`, `rollback`, and `status` in `staging-deploy.yml`.

**Verification**

```bash
npx --yes actionlint .github/workflows/build-image.yml .github/workflows/staging-deploy.yml
```

Expected:
- No workflow syntax errors.
- `staging-deploy.yml` still exposes `api_image_ref`, `web_image_ref`, `api_digest`, and `web_digest` equivalents to deploy.

## Phase 4: Staging Blue-Green Compose

**Purpose:** Make staging a real rehearsal for production.

**Files**
- Modify: `docker-compose.staging.yml`
- Modify: `deploy/staging/nginx.conf`
- Modify: `deploy/staging/remote-deploy.sh`
- Create on remote host during deploy: `current-slot.env`

**Implementation**

- [ ] Add slot-aware services:
  - `api-blue`, `web-blue`
  - `api-green`, `web-green`
  - one shared `nginx`

- [ ] Update `remote-deploy.sh` with these functions:
  - `read_current_slot`
  - `inactive_slot`
  - `write_slot_deploy_env`
  - `compose_slot`
  - `wait_for_slot_health`
  - `render_nginx_for_slot`
  - `reload_nginx`
  - `rollback_nginx_to_previous_slot`
  - `stop_previous_slot`

- [ ] Bound every wait loop. No infinite loop.

```bash
for attempt in $(seq 1 30); do
  if curl -fsS "$slot_web_url" >/dev/null; then
    return 0
  fi
  sleep 2
done
return 1
```

- [ ] Preserve existing checks:
  - `/login` local check
  - `/api/auth/me` expects `401` or `403`
  - Puppeteer launch check inside the API container

- [ ] Extend manifest:

```json
{
  "schemaVersion": "kiditem.staging.deploy.v2",
  "slot": "green",
  "previousSlot": "blue",
  "operation": "deploy",
  "apiImage": "ghcr.io/agentfoundry-labs/kiditem-api@sha256:...",
  "webImage": "ghcr.io/agentfoundry-labs/kiditem-web@sha256:..."
}
```

**Verification**

Use local syntax and config checks first:

```bash
bash -n deploy/staging/remote-deploy.sh
docker compose -f docker-compose.staging.yml config
```

Then run staging status:

```bash
gh workflow run staging-deploy.yml -f operation=status
```

Then deploy to staging and verify:

```bash
gh workflow run staging-deploy.yml -f operation=deploy -f accept_data_loss=false -f allow_downtime_for_space=true
```

Expected:
- New slot becomes active only after health checks pass.
- If inactive slot fails, current slot remains serving traffic.
- Final manifest includes `slot` and `previousSlot`.

## Phase 5: API / Worker Process Split

**Purpose:** Keep HTTP API responsive when Agent OS or AI jobs are busy.

**Files**
- Modify: `apps/server/Dockerfile` only if a separate entrypoint is required.
- Modify: `docker-compose.staging.yml`
- Modify: `deploy/staging/render-runtime-env.sh`
- Modify: `deploy/staging/remote-deploy.sh`
- Modify: `.github/workflows/staging-deploy.yml`

**Implementation**

- [ ] Add a `worker` service that uses the same server image but a different command/env.

```yaml
  worker-green:
    image: ${KIDITEM_API_IMAGE:?KIDITEM_API_IMAGE is required}
    env_file:
      - path: ./.env.staging.api
        required: false
    environment:
      NODE_ENV: production
      AGENT_RUNTIME_WORKER_ENABLED: "1"
    command: ["node", "apps/server/dist/agent-os/adapter/in/cli/run-worker.js"]
    restart: unless-stopped
```

- [ ] Keep `api` focused on HTTP traffic.

- [ ] Do not change Agent OS business behavior in this phase.

- [ ] Add worker health/status command only if the server already exposes one. Do not invent a new protocol without a follow-up design.

**Verification**

```bash
npm run build --workspace=apps/server
docker compose -f docker-compose.staging.yml config
```

Expected:
- API starts without requiring worker-only env.
- Worker starts with required AI model env.
- Staging smoke still validates HTTP through api/web/nginx.

## Phase 6: Production Promotion Workflow

**Purpose:** Promote a known-good image and release version, not an arbitrary branch state.

**Files**
- Create: `.github/workflows/production-deploy.yml`
- Create: `deploy/production/remote-deploy.sh`
- Create or update: `deploy/production/env/api.env.example`
- Create or update: `deploy/production/env/web.env.example`
- Create: `docs/runbooks/production-deploy.md`

**Implementation**

- [ ] Use `workflow_dispatch` inputs:
  - `image_tag_or_sha`
  - `app_version`
  - `confirm`

- [ ] Require GitHub Environment `production`.

- [ ] Fail unless `confirm=DEPLOY_PRODUCTION`.

- [ ] Validate DB host/path does not look staging/dev/local.

- [ ] Reuse the same migration order:
  - pre-schema data migrations
  - Prisma schema apply
  - post-schema data migrations
  - deploy inactive slot
  - public smoke
  - manifest
  - annotated production tag

- [ ] Tag success:

```bash
prod-v${APP_VERSION}-${deploy_date}-${short_sha}
```

**Verification**

Before enabling real production:

```bash
npx --yes actionlint .github/workflows/production-deploy.yml
bash -n deploy/production/remote-deploy.sh
```

Expected:
- Production workflow cannot run without explicit confirmation.
- Production environment approval gates the job.
- Rollback input rejects `staging` and other mutable tags.

## Phase 7: Observability And Notifications

**Purpose:** Make deploy failure visible to a tired human at 3am.

**Files**
- Modify: `.github/workflows/staging-deploy.yml`
- Modify: `deploy/staging/remote-deploy.sh`
- Modify: `docker-compose.staging.yml`
- Create: `docs/runbooks/observability.md`

**Implementation**

- [ ] Add GitHub Actions summary after every deploy/status/rollback:
  - app version
  - git SHA
  - image digests
  - active slot
  - staging URL
  - migration status

- [ ] On smoke failure, print:
  - `docker compose ps`
  - nginx logs
  - web logs
  - api logs
  - current manifest

- [ ] Add log rotation to all staging services if missing:

```yaml
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

- [ ] Add optional Slack or Discord notification after the deploy summary is stable.

**Verification**

```bash
gh workflow run staging-deploy.yml -f operation=status
```

Expected:
- GitHub job summary shows current deployment state without SSHing into the server.
- Failure logs are readable from Actions output.

## Phase 8: IaC Baseline

**Purpose:** Record the infrastructure shape in code without moving secrets into state.

**Files**
- Create: `infra/terraform/README.md`
- Create: `infra/terraform/environments/staging/`
- Create: `infra/terraform/environments/production/`
- Create: `docs/runbooks/infrastructure.md`

**Implementation**

- [ ] Document current resources first:
  - EC2 instance
  - security group
  - DNS records
  - GHCR package assumptions
  - object storage buckets
  - GitHub Environments, variables, and secrets inventory

- [ ] Add Terraform/OpenTofu remote state design.

- [ ] Do not put secret values in Terraform.

- [ ] Treat this as documentation-plus-drift-detection first. Resource creation can come later.

**Verification**

```bash
terraform fmt -recursive infra/terraform
terraform validate
```

Expected:
- Terraform files format cleanly.
- Validation passes once backend/provider config is supplied.

## Test Review

KidItem's `docs/TESTING.md` is risk-based. For DevOps changes, the right coverage is build/lint/scanner/smoke first, plus focused script tests where branch logic is non-trivial.

```
CODE PATHS / CONFIG PATHS                           USER / OPERATOR FLOWS
[+] .github/workflows/pr-checks.yml                 [+] Developer opens PR
  ├── [GAP] web build job                             ├── [GAP] bad web build blocked before review
  ├── [GAP] server build job                          ├── [GAP] bad server build blocked before staging
  ├── [GAP] shared build job                          └── [GAP] workflow syntax error blocked early
  └── [GAP] actionlint

[+] .github/CODEOWNERS                              [+] Reviewer routing
  ├── [GAP] .github/deploy owners                     ├── [GAP] platform PR requests platform reviewer
  ├── [GAP] apps/server owners                        └── [GAP] app PR requests domain reviewer
  └── [GAP] apps/web owners

[+] .github/workflows/build-image.yml               [+] Staging deploy
  ├── [GAP] api build reusable output                 ├── [GAP] deploy receives api digest
  ├── [GAP] web build reusable output                 ├── [GAP] deploy receives web digest
  └── [GAP] cache scope isolated                      └── [GAP] rollback still uses immutable ref

[+] deploy/staging/remote-deploy.sh                 [+] Operator deploys staging
  ├── [GAP] current slot read                         ├── [GAP] failed green keeps blue serving
  ├── [GAP] inactive slot selected                    ├── [GAP] successful green switches nginx
  ├── [GAP] health timeout                            └── [GAP] status shows active slot
  ├── [GAP] nginx rollback
  └── [GAP] manifest v2

[+] docker-compose.staging.yml                      [+] Public staging smoke
  ├── [GAP] blue services config                      ├── [GAP] /login returns 200
  ├── [GAP] green services config                     ├── [GAP] /api/auth/me returns 401/403
  └── [GAP] log rotation                              └── [GAP] browser runtime launches in api

COVERAGE TARGET: every config path has static validation, every deploy branch has smoke or script-level verification.
QUALITY TARGET: build/lint/smoke gates for CI infra; shell unit tests only for slot-selection logic if shell branches grow.
```

### Required Test Additions By Phase

| Phase | Required checks |
|---|---|
| Phase 1 | `actionlint`, web/server/shared builds, web/server lint, `bash -n`, `shellcheck` |
| Phase 2 | CODEOWNERS verified through a draft PR; `actionlint` for auto-assignee if added |
| Phase 3 | `actionlint` for reusable workflow; staging deploy dry run through GitHub UI |
| Phase 4 | `bash -n`, `shellcheck`, `docker compose config`, staging deploy, staging rollback, status |
| Phase 5 | `npm run build --workspace=apps/server`, `docker compose config`, staging smoke |
| Phase 6 | `actionlint`, `bash -n`, production environment approval dry run, production URL smoke after enablement |
| Phase 7 | status workflow produces GitHub summary; induced smoke failure prints useful logs |
| Phase 8 | `terraform fmt -recursive`, `terraform validate` after backend/provider setup |

## Failure Modes

| Failure mode | Plan coverage | User/operator impact |
|---|---|---|
| PR workflow syntax is invalid | `actionlint` in Phase 1 | Developer sees failure before merge. |
| Web or server no longer builds | PR build jobs in Phase 1 | Broken code cannot reach staging. |
| CODEOWNERS points at invalid team slug | Draft PR verification in Phase 2 | Reviewer routing fails visibly. |
| Reusable workflow drops digest output | Phase 3 output check and staging deploy | Deploy job fails before remote changes. |
| Inactive slot health never becomes ready | Bounded loop in Phase 4 | Current slot stays active; deploy fails loudly. |
| nginx reload succeeds but public smoke fails | Rollback to previous slot in Phase 4 | User keeps old app instead of broken app. |
| EC2 disk fills during image pull | Existing cleanup retained in `remote-deploy.sh` | Deploy may stop current stack only when explicit downtime flag allows it. |
| Worker consumes HTTP API resources | Phase 5 process split | API remains responsive while worker jobs run. |
| Production deploy targets wrong DB | Phase 6 DB target validation | Deploy fails before schema/data mutation. |
| Observability missing during failure | Phase 7 summary/log tail | Operator can diagnose without SSH first. |
| Terraform leaks secrets into state | Phase 8 scope rule forbids secret values | Secrets stay in GitHub/cloud secret stores. |

Critical gaps after review: none, if phases are implemented in order and Phase 4 includes rollback-on-public-smoke-failure.

## Performance Review

- Build performance: preserve Docker Buildx GHA cache scopes per component. Do not share `staging-api` and `staging-web` cache scopes.
- Deploy performance: pull images before switching slots. New slot health checks happen off the public path.
- Runtime performance: Phase 5 separates long-running worker jobs from HTTP API resources.
- DB performance: migration order stays explicit. This plan does not introduce new app queries.
- EC2 disk pressure: keep existing prune/ENOSPC retry path and document the downtime flag.

## Security Review

- Keep GitHub Environment secrets for staging and production.
- Do not pass production secrets through reusable workflow inputs.
- Keep known hosts validation for SSH.
- Keep dynamic remote path validation in deploy workflows.
- Reject mutable tags for rollback and production promotion.
- Validate DB target names before schema/data mutations.

## Worktree Parallelization Strategy

| Step | Modules touched | Depends on |
|---|---|---|
| Phase 1 PR gates | `.github/workflows`, app build scripts indirectly | none |
| Phase 2 CODEOWNERS | `.github` | none |
| Phase 3 reusable build workflow | `.github/workflows` | Phase 1 preferred |
| Phase 4 blue-green staging | `deploy/staging`, `docker-compose.staging.yml`, `.github/workflows` | Phase 3 preferred |
| Phase 5 worker split | `apps/server`, `deploy/staging`, `docker-compose.staging.yml` | Phase 4 |
| Phase 6 production deploy | `.github/workflows`, `deploy/production`, docs | Phase 4 |
| Phase 7 observability | `.github/workflows`, `deploy/staging`, docs | Phase 4 |
| Phase 8 IaC | `infra/terraform`, docs | none |

Parallel lanes:

- Lane A: Phase 1 -> Phase 3. Shared `.github/workflows`, keep sequential.
- Lane B: Phase 2. Independent `.github/CODEOWNERS`, can run beside Lane A.
- Lane C: Phase 8. Independent `infra/terraform`, can run beside A/B if only documenting inventory.
- Lane D: Phase 4 -> Phase 5 -> Phase 7. Shared deploy/runtime files, keep sequential.
- Lane E: Phase 6. Start after Phase 4 proves blue-green semantics.

Conflict flags:
- Phase 3, Phase 4, Phase 6, and Phase 7 all touch `.github/workflows`. Avoid parallel edits to the same workflow files.
- Phase 4, Phase 5, and Phase 7 all touch `deploy/staging/remote-deploy.sh`. Keep these sequential.

## Implementation Order

1. Ship Phase 1 and Phase 2 together if small.
2. Ship Phase 3 alone.
3. Ship Phase 4 alone and verify staging twice: deploy, rollback/status.
4. Ship Phase 5 only after Phase 4 is stable.
5. Ship Phase 7 after Phase 4, before production.
6. Ship Phase 6 production promotion.
7. Ship Phase 8 as documentation/IaC baseline when infrastructure ownership is ready.

## Review Findings Applied

1. `[P1] (confidence: 9/10) plan scope — Original plan touched more than 8 files and multiple platform boundaries in one sweep.`
   - Applied: split into eight phases and multiple PRs.

2. `[P1] (confidence: 8/10) deploy/staging/remote-deploy.sh — Blue-green without rollback-on-public-smoke-failure can switch users to a broken slot.`
   - Applied: Phase 4 requires previous-slot rollback if public smoke fails after nginx reload.

3. `[P2] (confidence: 8/10) .github/workflows/staging-deploy.yml — Reusable workflow extraction can accidentally lose access to environment secrets.`
   - Applied: extract image builds only; environment-bound deploy jobs stay in `staging-deploy.yml`.

4. `[P2] (confidence: 8/10) .github/workflows/pr-checks.yml — Current PR checks are strong on contracts but weak on app build/lint gates.`
   - Applied: Phase 1 adds web/server/shared build and lint jobs.

5. `[P2] (confidence: 7/10) deploy scripts — Shell branch logic needs static checks before staging deploy proves it.`
   - Applied: Phase 1 and Phase 4 require `bash -n`, `shellcheck`, and `docker compose config`.

6. `[P2] (confidence: 8/10) docs/TESTING.md — The CI integration section is stale and still says `.github/workflows/` is absent.`
   - Applied: Phase 1 includes updating the CI section after PR checks are expanded.

7. `[P2] (confidence: 7/10) production deploy — Production should not be introduced before staging slot semantics are proven.`
   - Applied: Phase 6 depends on Phase 4.

8. `[P3] (confidence: 7/10) worker runtime — Agent worker split is valuable but should not change Agent OS behavior in the same PR.`
   - Applied: Phase 5 changes process ownership only.

## TODOS.md Updates

No `TODOS.md` update is required for this plan. Deferred work is captured in `NOT in scope` with rationale. Implementation phases are durable enough to live in this plan rather than as vague TODO entries.

## Completion Summary

- Step 0: Scope Challenge: scope reduced into phased PRs.
- Architecture Review: 3 issues found and applied.
- Code Quality Review: 3 issues found and applied.
- Test Review: diagram produced, 22 gaps identified and mapped to phase gates.
- Performance Review: 1 issue found and applied.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: 0 items proposed.
- Failure modes: 0 critical gaps remain after plan changes.
- Outside voice: skipped. Prior research compared `depromeet/layer-server`, `depromeet/dpm-core-client`, and official docs.
- Parallelization: 5 lanes, 3 parallel opportunities, 2 sequential deploy lanes.
- Lake Score: 8/8 recommendations chose the complete option.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | Not needed for infra-only execution plan. |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | not run | Outside voice skipped for this document pass. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clear | 8 issues applied, 0 critical gaps. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not applicable | No UI changes in this plan. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | Phase 1 improves DX by adding faster PR feedback. |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED, ready to implement Phase 1.
