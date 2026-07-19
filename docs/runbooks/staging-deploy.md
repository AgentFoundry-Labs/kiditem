# Staging Deploy Runbook

This runbook creates and operates the KidItem staging runtime on one EC2
instance. The primary deploy path is GitHub Actions -> GHCR -> EC2 Docker
Compose. There is no supported local Docker image streaming deploy path; keep
staging releases observable through GitHub Actions, GHCR digest image refs, and
`/opt/kiditem/deployments/current.json`.

For the full environment variable inventory, feature-specific requirements, and
safe verification commands, see
[`docs/runbooks/environment-variables.md`](environment-variables.md).

```text
Internet
  -> host nginx + TLS on EC2
    -> 127.0.0.1:8080
      -> docker compose nginx
        -> /api/*  -> active NestJS API slot :4000
        -> /*      -> active Next.js web slot :3000
        -> worker  -> active Agent OS worker slot

External services:
  PostgreSQL/Auth -> Supabase project for this staging runtime
  Storage         -> Supabase Storage public bucket, via S3-compatible API
  DB baseline     -> Supabase Storage private bucket, via S3-compatible API
  Image registry  -> GHCR images tagged by git SHA
```

## Human Prerequisites

- EC2 Ubuntu host with inbound `80` and `443` open. SSH should be limited to the operator IP.
- Docker Engine, Docker Compose plugin, nginx, and rsync installed on the EC2 host.
- Host certbot installed if the public staging URL needs HTTPS.
- A Supabase project for staging runtime. For the first rollout, this may reuse
  the current shared dev Supabase project; before real QA, prefer a dedicated
  `kiditem-staging` project. Do not reuse production DB/Auth.
- A dedicated Supabase Storage bucket for staging uploads. The app still talks
  through an S3-compatible client, so enable Supabase Storage S3 protocol and
  generate a server-side access key pair in Dashboard -> Storage ->
  Configuration -> S3. Save the secret immediately; Supabase shows it once.
- A separate private Supabase Storage bucket for staging DB baseline artifacts
  if export/restore will be operated through GitHub Actions. Do not reuse the
  public app asset bucket. See
  [`staging-db-baseline.md`](staging-db-baseline.md).
- A public DNS record such as `staging.example.com` pointing to the EC2 public IP.
- GitHub Actions is enabled for `AgentFoundry-Labs/kiditem`.
- GitHub Environment `staging` exists with the variables and secrets listed in
  "GitHub Environment Setup".

Do not store secrets in git. GitHub Environment `staging` is the source of
truth for staging runtime secrets and variables. Each deploy renders
`.env.staging.api` and `.env.staging.web` from GitHub, uploads them to EC2 with
`600` permissions, and then restarts the stack.

## Expected Directory Shape

```text
/opt/kiditem/
  VERSION
  docker-compose.staging.yml
  deploy/staging/nginx.conf
  deploy/staging/remote-deploy.sh
  deploy/staging/host-nginx-http.conf.example
  deploy/staging/host-nginx.conf.example
  .env.staging.api
  .env.staging.web
  .env.staging.deploy
  deployments/nginx.conf
  deployments/current.json
  deployments/history/<timestamp>-<git-sha>.json
  deployments/current-db.json
  deployments/db-history/<timestamp>-<profileId>.json
```

## One-Time EC2 Setup

Provision the EC2 host, security group, Docker runtime, nginx package, and
Elastic IP through Terraform:

```bash
cd infra/terraform/envs/staging
terraform init
terraform plan \
  -var='vpc_id=vpc-...' \
  -var='subnet_id=subnet-...' \
  -var='key_name=kiditem-staging-keypair' \
  -var='allowed_ssh_cidrs=["<operator-ip>/32"]' \
  -var='public_http_cidrs=["<cloudflare-ip-range>"]'
terraform apply \
  -var='vpc_id=vpc-...' \
  -var='subnet_id=subnet-...' \
  -var='key_name=kiditem-staging-keypair' \
  -var='allowed_ssh_cidrs=["<operator-ip>/32"]' \
  -var='public_http_cidrs=["<cloudflare-ip-range>"]'
```

Use Cloudflare's current IP ranges for `public_http_cidrs` when the public
domain is proxied. SSH must be limited to operator CIDRs or replaced by SSM
Session Manager before treating staging as production.

Create the local SSH helper files. They stay inside the project directory for
operator convenience, but `.secrets/` is ignored by git and Docker. GitHub
Actions does not read local `.env.staging.*` files; it renders runtime env files
from GitHub Environment `staging`.

```bash
mkdir -p .secrets/staging
chmod 700 .secrets .secrets/staging

cat > .secrets/staging/deploy.env <<'EOF'
STAGING_HOST=<ec2-public-ip>
STAGING_USER=ubuntu
STAGING_SSH_KEY=/absolute/path/to/repo/.secrets/staging/kiditem-staging-keypair.pem
STAGING_REMOTE_DIR=/opt/kiditem
EOF

chmod 600 .secrets/staging/deploy.env
```

For the initial staging rollout using project `gheoobctiarluauprvro`, the
Supabase Storage values are:

```text
S3_REGION=ap-northeast-2
S3_BUCKET=kiditem-staging-assets
S3_ENDPOINT=https://gheoobctiarluauprvro.storage.supabase.co/storage/v1/s3
S3_PUBLIC_URL=https://gheoobctiarluauprvro.supabase.co/storage/v1/object/public/kiditem-staging-assets
```

Only `S3_ACCESS_KEY` and `S3_SECRET_KEY` remain secret operator values. Do not
use the general Supabase publishable/secret API keys as S3 access keys.

For EC2 hosts without IPv6, use the Supabase session pooler string from
Dashboard -> Connect -> ORM/Prisma. It has this shape:

```text
postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres
```

Do not use the direct `db.<project-ref>.supabase.co:5432` string unless the
host has working IPv6 or the Supabase IPv4 add-on.

For staging/prod, keep this value empty:

```bash
NEXT_PUBLIC_API_URL=
```

The browser calls `/api/*` on the same origin, and nginx routes those requests
to the NestJS container.

## GitHub Environment Setup

Create a GitHub Environment named `staging`.

Repository variables used by staging build jobs that intentionally do not
attach GitHub Environment `staging`:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging-supabase-publishable-key>
```

Environment variables:

```text
STAGING_HOST=<ec2-public-ip-or-dns>
STAGING_USER=ubuntu
STAGING_REMOTE_DIR=/opt/kiditem
STAGING_URL=http://<ec2-public-ip>
STAGING_SUPABASE_URL=https://<project-ref>.supabase.co
STAGING_CORS_ORIGINS=http://<ec2-public-ip>
STAGING_S3_REGION=ap-northeast-2
STAGING_S3_BUCKET=kiditem-staging-assets
STAGING_S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
STAGING_S3_PUBLIC_URL=https://<project-ref>.supabase.co/storage/v1/object/public/kiditem-staging-assets
STAGING_AI_TEXT_MODEL=gemini-2.5-flash
STAGING_AI_IMAGE_MODEL=gemini-3.1-flash-image-preview
STAGING_AI_IMAGE_ANALYSIS_MODEL=gemini-3.1-flash-lite-preview
STAGING_AI_IMAGE_ANALYSIS_VERIFY_MODEL=gemini-3.1-flash-lite-preview
STAGING_AGENT_RUNTIME_WORKER_ENABLED=1
STAGING_AGENT_DEFAULT_MODEL=gemini-2.5-flash
STAGING_NAVER_API_HUB_BASE_URL=https://naverapihub.apigw.ntruss.com
STAGING_NAVER_SEARCHAD_BASE_URL=https://api.searchad.naver.com
STAGING_TMAPI_BASE_URL=https://api.tmapi.top
STAGING_SOURCING_PLAYWRIGHT_CDP_ENDPOINT=<managed-browser-cdp-endpoint>
STAGING_TAOBAO_TOP_BASE_URL=https://eco.taobao.com/router/rest
STAGING_TAOBAO_TOP_TIMEOUT_MS=15000
STAGING_SOURCING_LINKFOX_SHADOW_ENABLED=0
STAGING_SOURCING_LINKFOX_ECHOTIK_REGION=US
STAGING_SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS=<comma-separated-organization-uuids>
STAGING_DB_BASELINE_BUCKET=kiditem-staging-db-baselines
STAGING_DB_BASELINE_S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
STAGING_DB_BASELINE_S3_REGION=ap-northeast-2
STAGING_DB_BASELINE_PREFIX=staging-db-baselines
```

When DNS and TLS are ready, change `STAGING_URL` and `STAGING_CORS_ORIGINS` in
GitHub Environment `staging`.

Environment secrets:

```text
STAGING_SSH_KEY=<private key whose public key is authorized for the EC2 user>
STAGING_SSH_KNOWN_HOSTS=<ssh-keyscan output for STAGING_HOST>
STAGING_DATABASE_URL=<staging-supabase-session-pooler-url>
STAGING_DIRECT_URL=<optional direct database URL, if this environment uses one>
STAGING_S3_ACCESS_KEY=<app-asset-s3-access-key-id>
STAGING_S3_SECRET_KEY=<app-asset-s3-secret-access-key>
STAGING_CHANNEL_CREDENTIALS_ENCRYPTION_KEY=<32-byte-base64-or-hex-key>
STAGING_GEMINI_API_KEY=<gemini-api-key>
STAGING_NAVER_API_HUB_CLIENT_ID=<naver-api-hub-client-id>
STAGING_NAVER_API_HUB_CLIENT_SECRET=<naver-api-hub-client-secret>
STAGING_NAVER_SEARCHAD_API_KEY=<naver-searchad-api-key>
STAGING_NAVER_SEARCHAD_SECRET_KEY=<naver-searchad-secret-key>
STAGING_NAVER_SEARCHAD_CUSTOMER_ID=<naver-searchad-customer-id>
STAGING_TMAPI_TOKEN=<tmapi-token>
STAGING_TAOBAO_TOP_APP_KEY=<taobao-top-app-key>
STAGING_TAOBAO_TOP_APP_SECRET=<taobao-top-app-secret>
STAGING_LINKFOX_AGENT_API_KEY=<server-only-linkfox-key>
STAGING_DB_BASELINE_S3_ACCESS_KEY=<private-db-baseline-s3-access-key-id>
STAGING_DB_BASELINE_S3_SECRET_KEY=<private-db-baseline-s3-secret-access-key>
```

Create `STAGING_SSH_KNOWN_HOSTS` from an operator machine:

```bash
ssh-keyscan -H <ec2-public-ip-or-dns>
```

CLI setup template:

```bash
gh api --method PUT repos/AgentFoundry-Labs/kiditem/environments/staging

gh variable set STAGING_HOST --env staging --body "<ec2-public-ip-or-dns>"
gh variable set STAGING_USER --env staging --body "ubuntu"
gh variable set STAGING_REMOTE_DIR --env staging --body "/opt/kiditem"
gh variable set STAGING_URL --env staging --body "http://<ec2-public-ip>"
gh variable set NEXT_PUBLIC_SUPABASE_URL --body "https://<project-ref>.supabase.co"
gh variable set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --body "<publishable-key>"
gh variable set STAGING_SUPABASE_URL --env staging --body "https://<project-ref>.supabase.co"
gh variable set STAGING_CORS_ORIGINS --env staging --body "http://<ec2-public-ip>"
gh variable set STAGING_S3_REGION --env staging --body "ap-northeast-2"
gh variable set STAGING_S3_BUCKET --env staging --body "kiditem-staging-assets"
gh variable set STAGING_S3_ENDPOINT --env staging --body "https://<project-ref>.storage.supabase.co/storage/v1/s3"
gh variable set STAGING_S3_PUBLIC_URL --env staging --body "https://<project-ref>.supabase.co/storage/v1/object/public/kiditem-staging-assets"
gh variable set STAGING_AI_TEXT_MODEL --env staging --body "gemini-2.5-flash"
gh variable set STAGING_AI_IMAGE_MODEL --env staging --body "gemini-3.1-flash-image-preview"
gh variable set STAGING_AI_IMAGE_ANALYSIS_MODEL --env staging --body "gemini-3.1-flash-lite-preview"
gh variable set STAGING_AI_IMAGE_ANALYSIS_VERIFY_MODEL --env staging --body "gemini-3.1-flash-lite-preview"
gh variable set STAGING_AGENT_RUNTIME_WORKER_ENABLED --env staging --body "1"
gh variable set STAGING_AGENT_DEFAULT_MODEL --env staging --body "gemini-2.5-flash"
gh variable set STAGING_NAVER_API_HUB_BASE_URL --env staging --body "https://naverapihub.apigw.ntruss.com"
gh variable set STAGING_NAVER_SEARCHAD_BASE_URL --env staging --body "https://api.searchad.naver.com"
gh variable set STAGING_TMAPI_BASE_URL --env staging --body "https://api.tmapi.top"
gh variable set STAGING_SOURCING_PLAYWRIGHT_CDP_ENDPOINT --env staging --body "<managed-browser-cdp-endpoint>"
gh variable set STAGING_TAOBAO_TOP_BASE_URL --env staging --body "https://eco.taobao.com/router/rest"
gh variable set STAGING_TAOBAO_TOP_TIMEOUT_MS --env staging --body "15000"
gh variable set STAGING_SOURCING_LINKFOX_SHADOW_ENABLED --env staging --body "0"
gh variable set STAGING_SOURCING_LINKFOX_ECHOTIK_REGION --env staging --body "US"
gh variable set STAGING_SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS --env staging --body "<comma-separated-organization-uuids>"
gh variable set STAGING_DB_BASELINE_BUCKET --env staging --body "kiditem-staging-db-baselines"
gh variable set STAGING_DB_BASELINE_S3_ENDPOINT --env staging --body "https://<project-ref>.storage.supabase.co/storage/v1/s3"
gh variable set STAGING_DB_BASELINE_S3_REGION --env staging --body "ap-northeast-2"
gh variable set STAGING_DB_BASELINE_PREFIX --env staging --body "staging-db-baselines"

gh secret set STAGING_SSH_KEY --env staging < .secrets/staging/kiditem-staging-keypair.pem
ssh-keyscan -H <ec2-public-ip-or-dns> | gh secret set STAGING_SSH_KNOWN_HOSTS --env staging
printf '%s' '<staging-supabase-session-pooler-url>' | gh secret set STAGING_DATABASE_URL --env staging
printf '%s' '<optional-direct-database-url>' | gh secret set STAGING_DIRECT_URL --env staging
printf '%s' '<app-asset-s3-access-key-id>' | gh secret set STAGING_S3_ACCESS_KEY --env staging
printf '%s' '<app-asset-s3-secret-access-key>' | gh secret set STAGING_S3_SECRET_KEY --env staging
printf '%s' '<32-byte-base64-or-hex-key>' | gh secret set STAGING_CHANNEL_CREDENTIALS_ENCRYPTION_KEY --env staging
printf '%s' '<gemini-api-key>' | gh secret set STAGING_GEMINI_API_KEY --env staging
printf '%s' '<naver-api-hub-client-id>' | gh secret set STAGING_NAVER_API_HUB_CLIENT_ID --env staging
printf '%s' '<naver-api-hub-client-secret>' | gh secret set STAGING_NAVER_API_HUB_CLIENT_SECRET --env staging
printf '%s' '<naver-searchad-api-key>' | gh secret set STAGING_NAVER_SEARCHAD_API_KEY --env staging
printf '%s' '<naver-searchad-secret-key>' | gh secret set STAGING_NAVER_SEARCHAD_SECRET_KEY --env staging
printf '%s' '<naver-searchad-customer-id>' | gh secret set STAGING_NAVER_SEARCHAD_CUSTOMER_ID --env staging
printf '%s' '<tmapi-token>' | gh secret set STAGING_TMAPI_TOKEN --env staging
printf '%s' '<taobao-top-app-key>' | gh secret set STAGING_TAOBAO_TOP_APP_KEY --env staging
printf '%s' '<taobao-top-app-secret>' | gh secret set STAGING_TAOBAO_TOP_APP_SECRET --env staging
printf '%s' '<server-only-linkfox-key>' | gh secret set STAGING_LINKFOX_AGENT_API_KEY --env staging
printf '%s' '<private-db-baseline-s3-access-key-id>' | gh secret set STAGING_DB_BASELINE_S3_ACCESS_KEY --env staging
printf '%s' '<private-db-baseline-s3-secret-access-key>' | gh secret set STAGING_DB_BASELINE_S3_SECRET_KEY --env staging
```

Do not use `StrictHostKeyChecking=accept-new` in GitHub Actions. Pinning the
host key prevents a deploy from trusting an unexpected SSH host.

The workflow uses the short-lived `GITHUB_TOKEN` to push and pull GHCR images.
Do not create a long-lived GHCR PAT for staging unless the `GITHUB_TOKEN` path
is blocked by organization policy.

The staging API image includes Chromium for server-side render-image jobs. The
remote deploy script prunes stopped containers, unused images, and Docker
builder cache before pulling new images. It intentionally does not prune Docker
volumes. If a pull still fails with `no space left on device` after that
cleanup, the default GitHub Actions deploy may stop the current staging stack to
free active image layers, prune again, and retry. This can cause short staging
downtime, but it must not delete Docker volumes, the database, or uploaded
assets. Set `allow_downtime_for_space=false` only for a deploy that must
preserve the currently running stack at all costs.

The same approval also lets the remote deploy recover when the candidate slot
passes initial health checks but the small staging host cannot keep both slots
and the API render-image Chromium readiness check stable at the same time. In
that case, the script stops the current stack and retries the candidate once
before switching traffic.

Workflow actions are pinned to commit SHA with the tag version left as a YAML
comment. When upgrading an action, resolve the new tag SHA with
`git ls-remote https://github.com/<owner>/<repo>.git refs/tags/<tag>`.

## Primary Deploy From GitHub Actions

Workflow file:

```text
.github/workflows/staging-deploy.yml
```

Triggers:

- Manual `workflow_dispatch` with `operation=deploy` builds and deploys the
  selected ref. Use `main` for normal staging verification.
- Manual `workflow_dispatch` with `operation=status` prints the EC2 deployment
  manifest and smoke endpoint status.
- Manual `workflow_dispatch` with `operation=rollback` deploys an existing GHCR
  git-SHA tag. Do not pass `staging` as a rollback tag.

Branch model:

```text
feature/fix branch -> PR -> develop
develop -> PR/merge -> main
GitHub Actions -> Staging Deploy -> Run workflow on main -> operation=deploy
```

`develop` is the long-lived collaboration/integration branch and does not
deploy staging by itself. `main` is the normal staging deployment ref, but it
does not deploy automatically; an operator triggers the workflow manually. Do
not create a long-lived `staging` branch; staging is a GitHub Environment, not a
separate source branch.

Only deploy/finalize-rebuild/rollback/status jobs declare GitHub Environment
`staging`. Build and preparation jobs intentionally avoid it. The destructive
deploy and its later finalization are separately protected staging operations.

The deployable app release is recorded in root [`VERSION`](../../VERSION).
Package-local `version` fields are package metadata and are not the staging
release boundary.

Select and advance that value through the
[Release Train Versioning](release-train-versioning.md) runbook. A staging
deployment reports the already assembled train version; deployment itself does
not bump it. Git SHA and digest refs remain the exact runtime identity.

Image naming:

```text
ghcr.io/agentfoundry-labs/kiditem-api:<git-sha>
ghcr.io/agentfoundry-labs/kiditem-web:<git-sha>
ghcr.io/agentfoundry-labs/kiditem-api:staging
ghcr.io/agentfoundry-labs/kiditem-web:staging
```

The mutable `staging` tag is only a pointer for humans. Runtime compose uses
the digest image refs produced by the build job and records those refs in:

```text
/opt/kiditem/.env.staging.deploy
/opt/kiditem/deployments/current.json
/opt/kiditem/deployments/history/
```

Each deploy renders and syncs the current GitHub-managed runtime environment
files plus non-secret runtime assets to EC2:

```text
docker-compose.staging.yml
VERSION
.env.staging.api
.env.staging.web
deploy/staging/nginx.conf
deploy/staging/remote-deploy.sh
```

Normal deploys keep the ordered pre-schema migration, non-destructive
`prisma db push`, and post-schema migration path. Release `0.1.8` also exposes
one explicit authoritative rebuild path:

```text
operation: deploy
deployment_target: staging
destructive_reset: RESET_STAGING_DATA
```

The workflow validates the exact token inside GitHub Environment `staging`.
The destructive order is: quiesce application traffic, export the selected
Coupang account as sanitized replay payloads, upload the private one-day
artifact, then cross the reset boundary by applying the final Prisma schema
with `--force-reset`. Only after that does it create the configured
organization, Supabase user mirror, active membership, and channel-account
baseline. It then starts the application with
`inventory.rebuild.status=snapshot_required`. No source workbook is read from
the repository or stored in the artifact.

After the deploy finishes, an authenticated operator must:

1. Open `/inventory-hub?tab=sellpia-sync` and import the approved Sellpia
   workbook. Wait for a completed `sellpia_inventory` run.
2. Open `/product-hub/matching`, choose the configured Coupang account, and
   import the approved Wing workbook. Wait for a completed
   `coupang_wing_catalog` run. Sellpia must complete first.
3. Confirm the Environment variables `STAGING_REBUILD_EXPECTED_*` match the
   approved import manifest, not a guessed or copied total.
4. Trigger the same workflow with:

   ```text
   operation: finalize-rebuild
   deployment_target: staging
   destructive_reset: RESET_STAGING_DATA
   rebuild_run_id: <originating deploy run ID>
   ```

Finalization downloads only that run's staging artifact, replays Coupang data
through authenticated `POST /api/ads/extension/sync`, verifies the completed
Sellpia/Wing import order and exact imported/replayed counts, and marks the
environment ready. Missing credentials, imports, expected counts, artifact,
or a target/run/count mismatch fails closed and keeps snapshot-required state.

Each durable data migration is grouped by the application release in root
[`VERSION`](../../VERSION) that requires it, for example
`scripts/data-migrations/v0.1.0/001_<name>.ts`, and records a row in
`data_migration_runs` with migration id, release version, status, git SHA,
Prisma schema hash, affected rows, details, and error text when a run fails.
After a normal non-destructive deploy passes the EC2 smoke check, the workflow
verifies the migration ledger with:

```bash
npm run data:migrate -- status
```

For the detail-page content route migration, the deprecated
`master_products` sourcing columns stay in the schema until the ledger confirms
the sourcing backfill landed on every shared environment.

Agent OS remains enabled on staging only for registered Agent definitions.
Product-bound detail page, thumbnail, and image-edit generation are direct AI
jobs and do not enqueue `AgentRunRequest` rows. Before every deploy,
`remote-deploy.sh` validates `/opt/kiditem/.env.staging.api`, runs the
idempotent Agent OS seed from the new API image, and only then restarts the
compose stack. These Agent OS values must be present in the API env file:

```text
AGENT_RUNTIME_WORKER_ENABLED=1
AGENT_DEFAULT_MODEL=gemini-2.5-flash
```

`AGENT_DEFAULT_MODEL` may be replaced by a complete set of per-agent
`AGENT_<TYPE>_MODEL` values, but the shared value is the normal staging
configuration. Detail page, thumbnail, and image-edit generation are direct AI
jobs and use `AI_TEXT_MODEL`, `AI_IMAGE_MODEL`, and `AI_IMAGE_ANALYSIS_MODEL`, not
`AGENT_*` model variables. The deploy will fail before touching the running
containers if the worker is disabled, a required model env is missing, or
`AGENT_RUNTIME_ALLOW_NOOP` is enabled.

## Host Nginx For IP-Only Smoke Test

The app compose nginx binds to `127.0.0.1:8080`. Host nginx exposes it on public
port `80`.

After the first deploy syncs `deploy/staging` to `/opt/kiditem`, run this on EC2:

```bash
sudo cp /opt/kiditem/deploy/staging/host-nginx-http.conf.example /etc/nginx/sites-available/kiditem-staging
sudo ln -sf /etc/nginx/sites-available/kiditem-staging /etc/nginx/sites-enabled/kiditem-staging
sudo nginx -t
sudo systemctl reload nginx
```

Use `http://<ec2-public-ip>` only for the first origin smoke test. The normal
staging URL is the Cloudflare proxied HTTPS origin configured in
`STAGING_URL`.

If authenticated Wing catalog collection is tested from staging registered
products, the local Chrome extension must allow the same public origin. Do not
commit the real staging origin into the default extension manifest; create a
local-only copy instead:

```bash
STAGING_URL="$(gh variable get STAGING_URL --env staging)" \
  node scripts/prepare-coupang-extension.mjs
```

Then load `.secrets/extensions/coupang-ads-scraper-staging` from
`chrome://extensions`, open staging `/product-pipeline/registered-products`,
and keep an authenticated Wing inventory tab in the same Chrome profile.
Select the intended Coupang account and verify **Wing에서 가져오기** starts a
resumable catalog collection. The extension must advertise
`coupangCatalogSnapshot = true`.

There is no server-side Playwriter/image-sync fallback. Do not add
`COUPANG_IMAGE_SYNC_SERVER_SCRAPER_ENABLED` or call a
`/api/coupang-image-sync` capability endpoint. Follow
[Coupang Wing Catalog Collection](coupang-wing-catalog-collection.md) for the
browser acceptance and recovery procedure.

## Host Nginx With HTTPS Domain

Install the host reverse proxy after DNS points to the EC2 host.

```bash
sudo cp /opt/kiditem/deploy/staging/host-nginx.conf.example /etc/nginx/sites-available/kiditem-staging
sudo sed -i 's/staging.example.com/<real-staging-domain>/g' /etc/nginx/sites-available/kiditem-staging
sudo ln -sf /etc/nginx/sites-available/kiditem-staging /etc/nginx/sites-enabled/kiditem-staging
sudo nginx -t
sudo systemctl reload nginx
```

Issue the certificate with certbot using the team-approved method for the EC2
host, then re-run:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Manual Compose Commands

Use these only when operating directly on the EC2 host:

```bash
cd /opt/kiditem
set -a
source .env.staging.deploy
set +a
docker compose --env-file .env.staging.web -f docker-compose.staging.yml config
docker compose --env-file .env.staging.web -f docker-compose.staging.yml up -d
docker compose --env-file .env.staging.web -f docker-compose.staging.yml ps
docker compose --env-file .env.staging.web -f docker-compose.staging.yml logs --tail=100 nginx web api
```

To inspect the current deployment without remembering compose flags:

```bash
cd /opt/kiditem
./deploy/staging/remote-deploy.sh status
```

## Verification

After deploy:

```bash
cd /opt/kiditem
test -f deployments/current.json
cat deployments/current.json
curl -fsS http://127.0.0.1:8080/login
curl -I http://<ec2-public-ip>/login
curl -I https://<real-staging-domain>/login
curl -I https://<real-staging-domain>/api/auth/me
npm run data:migrate -- status --database-url "$STAGING_DATABASE_URL"
npm run inventory:rebuild -- guard # only with the exact GitHub Actions rebuild env
```

Expected results:

- `/login` returns `200`.
- `/api/auth/me` returns an auth-related response such as `401` or `403` when
  unauthenticated. It should not be a connection error or nginx `502`.
- Browser network requests to app APIs use `http://<ec2-public-ip>/api/*` or
  `https://<real-staging-domain>/api/*`, not `localhost:4000`.
- `deployments/current.json` records the git SHA, image refs, image digests,
  root app version, GitHub workflow run URL, and deploy operation.
- `deployments/current-db.json`, when present, records the staging DB baseline
  profile restored or exported by the separate DB baseline workflow.
- `data_migration_runs` contains `succeeded` rows for the migration ids shipped
  by the deployed commit. Persisted detail editor alert hrefs should now point
  at `/product-pipeline/detail-pages/:generationId/editor`, with
  `sourceCandidateId` and `returnTo` query params when the source is a collected
  product.
- A guarded rebuild log records its origin run ID, one-day artifact, quiesce,
  final-schema reset, minimum bootstrap, and snapshot-required state. A later
  finalization log records exact import/replay acceptance before ready state.

## Blocker Criteria

Stop and report instead of guessing if:

- `.env.staging.api` or `.env.staging.web` is missing on EC2.
- `docker compose config` fails.
- nginx returns `502` after both containers are running.
  - If `deployments/nginx.conf` on the host points at the active slot but
    `/etc/nginx/conf.d/default.conf` inside the nginx container still points at
    the old slot, recreate the compose nginx service. The deploy script should
    then be fixed or rerun from GitHub Actions so the file bind mount cannot
    keep a stale config inode.
- Supabase connection errors mention the production project.
- `destructive_reset` is non-empty but is not exactly `RESET_STAGING_DATA`, or
  `deployment_target` is not `staging`.
- After traffic is quiesced, the private export is incomplete, contains a
  disallowed payload, or cannot be uploaded before the reset boundary.
- A finalization run cannot prove the originating run ID, protected
  Environment, Sellpia-before-Wing import order, or every configured count.
- `npm run data:migrate -- up` fails or writes a `failed` ledger row.
- Any seed/import/baseline step would target production by accident.
- DB baseline export/restore would use the public app asset bucket instead of
  the private DB baseline bucket.
- GitHub Actions cannot pull GHCR images from EC2 using `GITHUB_TOKEN`.
- `deployments/current.json` is missing after a successful CI deploy.

## Final Report Format

Report:

- EC2 host and public staging URL.
- Root app version and git branch or commit deployed.
- Docker image refs and digests loaded on EC2.
- GitHub Actions run URL.
- Supabase project ref used for staging.
- Supabase Storage bucket name used for staging.
- DB baseline profile id and `deployments/current-db.json` state, if operated.
- Data migration ledger statuses from `data_migration_runs`.
- Rebuild origin run ID, snapshot-required/ready status, and exact acceptance
  counts when the guarded rebuild path was used.
- Compose service status.
- Verification commands and results.
