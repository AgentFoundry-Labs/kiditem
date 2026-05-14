# Staging Deploy Runbook

This runbook creates and operates the KidItem staging runtime on one EC2
instance. The primary deploy path is GitHub Actions -> GHCR -> EC2 Docker
Compose. The local `bin/deploy-staging.sh` path remains a break-glass fallback
for initial bootstrapping or GitHub outage recovery.

For the full environment variable inventory, feature-specific requirements, and
safe verification commands, see
[`docs/runbooks/environment-variables.md`](environment-variables.md).

```text
Internet
  -> host nginx + TLS on EC2
    -> 127.0.0.1:8080
      -> docker compose nginx
        -> /api/*  -> NestJS container :4000
        -> /*      -> Next.js container :3000

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

Do not store secrets in git. Runtime secret files live only on the staging host.

## Expected Directory Shape

```text
/repo/.secrets/staging/
  kiditem-staging-keypair.pem
  deploy.env
  .env.staging.api
  .env.staging.web

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
  deployments/current.json
  deployments/history/<timestamp>-<git-sha>.json
  deployments/current-db.json
  deployments/db-history/<timestamp>-<profileId>.json
```

## One-Time EC2 Setup

From the local repo, copy and run the setup script on the EC2 host:

```bash
scp -i ~/.ssh/<key>.pem ./bin/setup-staging-ec2.sh ubuntu@<ec2-host>:/tmp/setup-staging-ec2.sh
ssh -i ~/.ssh/<key>.pem ubuntu@<ec2-host> 'bash /tmp/setup-staging-ec2.sh'
```

The script installs Docker Engine, the Docker Compose plugin, nginx, and rsync.
It does not create swap by default because small 8 GB root disks need the space
for Docker layers. If the root disk is already larger and the host will build
images itself, set an explicit swap size:

```bash
ssh -i ~/.ssh/<key>.pem ubuntu@<ec2-host> 'SWAP_SIZE=2G bash /tmp/setup-staging-ec2.sh'
```

Log out and SSH back in after the script finishes so Docker group membership
applies.

Create the local project secret files. They stay inside the project directory
for convenience, but `.secrets/` is ignored by git and Docker:

```bash
mkdir -p .secrets/staging
chmod 700 .secrets .secrets/staging

cat > .secrets/staging/.env.staging.web <<'EOF'
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_SUPABASE_URL=<current-dev-supabase-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<current-dev-supabase-publishable-key>
EOF

cat > .secrets/staging/.env.staging.api <<'EOF'
NODE_ENV=production
PORT=4000
DATABASE_URL=<supabase-session-pooler-url>
SUPABASE_URL=<current-dev-supabase-url>
CORS_ORIGINS=http://<ec2-public-ip>
S3_REGION=ap-northeast-2
S3_BUCKET=kiditem-staging-assets
S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_PUBLIC_URL=https://<project-ref>.supabase.co/storage/v1/object/public/kiditem-staging-assets
S3_ACCESS_KEY=<supabase-storage-s3-access-key-id>
S3_SECRET_KEY=<supabase-storage-s3-secret-access-key>
GEMINI_API_KEY=<gemini-api-key>
AI_TEXT_MODEL=gemini-2.5-flash
AGENT_RUNTIME_WORKER_ENABLED=1
AGENT_DEFAULT_MODEL=gemini-2.5-flash
AGENT_THUMBNAIL_GENERATE_MODEL=gemini-3.1-flash-image-preview
EOF

cat > .secrets/staging/deploy.env <<'EOF'
STAGING_HOST=<ec2-public-ip>
STAGING_USER=ubuntu
STAGING_SSH_KEY=/absolute/path/to/repo/.secrets/staging/kiditem-staging-keypair.pem
STAGING_REMOTE_DIR=/opt/kiditem
STAGING_ENV_DIR=/absolute/path/to/repo/.secrets/staging
EOF

chmod 600 .secrets/staging/.env.staging.api .secrets/staging/.env.staging.web .secrets/staging/deploy.env
```

The deploy script uploads `.env.staging.api` and `.env.staging.web` to
`/opt/kiditem` on EC2 with `600` permissions.

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

Environment variables:

```text
STAGING_HOST=<ec2-public-ip-or-dns>
STAGING_USER=ubuntu
STAGING_REMOTE_DIR=/opt/kiditem
STAGING_URL=http://<ec2-public-ip>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging-supabase-publishable-key>
STAGING_DB_BASELINE_BUCKET=kiditem-staging-db-baselines
STAGING_DB_BASELINE_S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
STAGING_DB_BASELINE_S3_REGION=ap-northeast-2
STAGING_DB_BASELINE_PREFIX=staging-db-baselines
```

When DNS and TLS are ready, change only `STAGING_URL` and the API
`CORS_ORIGINS` value in `/opt/kiditem/.env.staging.api`.

Environment secrets:

```text
STAGING_SSH_KEY=<private key whose public key is authorized for the EC2 user>
STAGING_SSH_KNOWN_HOSTS=<ssh-keyscan output for STAGING_HOST>
STAGING_DATABASE_URL=<staging-supabase-session-pooler-url>
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
gh variable set NEXT_PUBLIC_SUPABASE_URL --env staging --body "https://<project-ref>.supabase.co"
gh variable set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --env staging --body "<publishable-key>"
gh variable set STAGING_DB_BASELINE_BUCKET --env staging --body "kiditem-staging-db-baselines"
gh variable set STAGING_DB_BASELINE_S3_ENDPOINT --env staging --body "https://<project-ref>.storage.supabase.co/storage/v1/s3"
gh variable set STAGING_DB_BASELINE_S3_REGION --env staging --body "ap-northeast-2"
gh variable set STAGING_DB_BASELINE_PREFIX --env staging --body "staging-db-baselines"

gh secret set STAGING_SSH_KEY --env staging < .secrets/staging/kiditem-staging-keypair.pem
ssh-keyscan -H <ec2-public-ip-or-dns> | gh secret set STAGING_SSH_KNOWN_HOSTS --env staging
printf '%s' '<staging-supabase-session-pooler-url>' | gh secret set STAGING_DATABASE_URL --env staging
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
cleanup, the script stops the current staging containers without volumes, prunes
again, and retries the pull once. If the retry still fails, increase the EC2
root volume or slim the API image before retrying.

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

The deployable app release is recorded in root [`VERSION`](../../VERSION).
Package-local `version` fields are package metadata and are not the staging
release boundary.

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

Each deploy syncs only non-secret runtime assets to EC2:

```text
docker-compose.staging.yml
VERSION
deploy/staging/nginx.conf
deploy/staging/remote-deploy.sh
```

The workflow never overwrites `/opt/kiditem/.env.staging.api` or
`/opt/kiditem/.env.staging.web`.

Before the EC2 image swap, the deploy job applies the Prisma schema to the
staging Supabase database with `npx prisma db push`. The default workflow input
keeps `accept_data_loss=false`, so destructive Prisma changes still block the
deploy. A reviewed contract-cleanup deploy may set `accept_data_loss=true`,
which runs `npx prisma db push --accept-data-loss` only for that manual staging
run. Use it only after the expand/backfill release has a succeeded
`data_migration_runs` ledger row and the PR explicitly calls out the columns or
tables being dropped. The workflow then runs release data migrations before the
image swap so new application code starts with any required backfill already
present:

```bash
npm run data:migrate -- up
```

with `DATA_MIGRATION_TARGET=staging` and
`DATA_MIGRATION_CONFIRM=APPLY_DATA_MIGRATIONS`. Each durable data migration is
grouped by the application release in root [`VERSION`](../../VERSION) that
requires it, for example `scripts/data-migrations/v0.1.0/001_<name>.ts`, and
records a row in `data_migration_runs` with migration id, release version,
status, git SHA, Prisma schema hash, affected rows, details, and error text
when a run fails. After the new containers pass the EC2 smoke check, the
workflow verifies the migration ledger with:

```bash
npm run data:migrate -- status
```

For the detail-page content route migration, the deprecated
`master_products` sourcing columns stay in the schema until the ledger confirms
the sourcing backfill landed on every shared environment.

Async Agent OS jobs are enabled on staging because product-bound detail page
and thumbnail generation enqueue `AgentRunRequest` rows. Before every deploy,
`remote-deploy.sh` validates `/opt/kiditem/.env.staging.api`, runs the
idempotent Agent OS seed from the new API image, and only then restarts the
compose stack. These values must be present in the API env file:

```text
AGENT_RUNTIME_WORKER_ENABLED=1
AGENT_DEFAULT_MODEL=gemini-2.5-flash
AGENT_THUMBNAIL_GENERATE_MODEL=gemini-3.1-flash-image-preview
```

`AGENT_DEFAULT_MODEL` may be replaced by a complete set of per-agent
`AGENT_<TYPE>_MODEL` values, but the shared value is the normal staging
configuration. `AGENT_THUMBNAIL_GENERATE_MODEL` is always explicit because
thumbnail generation must use an image-capable model. The deploy will fail
before touching the running containers if the worker is disabled, a required
model env is missing, or `AGENT_RUNTIME_ALLOW_NOOP` is enabled.

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

Use `http://<ec2-public-ip>` for the first smoke test.

If `/thumbnails` Coupang image sync is tested from the staging web app, the
local Chrome extension must allow the same public origin. Do not commit the
real staging origin into the default extension manifest; create a local-only
copy instead:

```bash
STAGING_URL="$(gh variable get STAGING_URL --env staging)" \
  node scripts/prepare-coupang-extension.mjs
```

Then load `.secrets/extensions/coupang-ads-scraper-staging` from
`chrome://extensions` before testing image sync.

Server-side Coupang Wing image scraping is disabled in staging by default even
though the API image contains browser dependencies for `/api/render-image`.
For the Phase 3 Playwriter experiment only, add the following to the staging API
env and redeploy:

```bash
COUPANG_IMAGE_SYNC_SERVER_SCRAPER_ENABLED=true
```

Before running `/thumbnails` image sync without the extension, verify:

```bash
curl -s http://127.0.0.1:8080/api/coupang-image-sync/capabilities
```

Success criteria: `serverScraper.enabled` is `true` and `preferredSource` is
`server_scraper`. Rollback is removing the env var and redeploying; the browser
extension path remains available.

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

## Local Deploy Fallback

Use this only when GitHub Actions or GHCR is unavailable, or for the first smoke
bootstrap before the GitHub Environment exists.

From the local repo:

```bash
STAGING_HOST=<ec2-hostname-or-ip> \
STAGING_USER=ubuntu \
STAGING_SSH_KEY=~/.ssh/<key>.pem \
./bin/deploy-staging.sh
```

The fallback script builds both Docker images locally, streams
`docker save | gzip` directly into `docker load` over SSH, restarts the compose
stack, and checks `http://127.0.0.1:8080/login` on the EC2 host. It
intentionally does not store the compressed image archive on EC2, which keeps
small root disks from holding both the archive and the loaded images at the
same time.

Fallback deploys do not write the GHCR deployment manifest unless the operator
also runs `deploy/staging/remote-deploy.sh` with explicit GHCR image refs.

By default, local builds target `linux/amd64`, which matches normal EC2 Ubuntu
instances even when the operator is using Apple Silicon locally. Override only
when the EC2 host is intentionally a different architecture:

```bash
DOCKER_PLATFORM=linux/arm64 ./bin/deploy-staging.sh
```

Staging API images include Chromium so `/api/render-image` can launch
Puppeteer. Keep enough free disk on the EC2 root volume before deploy; the
remote deploy smoke check launches Puppeteer inside the API container and fails
the deploy if the browser runtime is missing.

```bash
INSTALL_CHROMIUM=true ./bin/deploy-staging.sh
```

The deploy script reads connection settings from:

```text
.secrets/staging/deploy.env
```

Override individual paths with:

```bash
STAGING_WEB_ENV_FILE=/absolute/path/to/web.env \
STAGING_API_ENV_FILE=/absolute/path/to/api.env \
./bin/deploy-staging.sh
```

The deploy script always builds staging with `NEXT_PUBLIC_API_URL=` unless
`STAGING_NEXT_PUBLIC_API_URL` is explicitly set. This keeps browser API calls on
same-origin `/api/*` even if `apps/web/.env.local` points local dev at
`http://localhost:4000`.

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
  by the deployed commit. Legacy persisted detail editor alert hrefs should now
  point at `/sourcing/:candidateId/editor?generationId=:generationId` or
  `/sourcing/detail-pages/:generationId/editor`.
- Contract-cleanup deploys that intentionally dropped columns were run with
  `accept_data_loss=true`, and the workflow log shows the explicit warning
  before Prisma schema apply.

## Blocker Criteria

Stop and report instead of guessing if:

- `.env.staging.api` or `.env.staging.web` is missing on EC2.
- `docker compose config` fails.
- nginx returns `502` after both containers are running.
- Supabase connection errors mention the production project.
- `npx prisma db push` reports destructive changes or asks for
  `--accept-data-loss` during a normal deploy. Stop unless the PR is a reviewed
  contract cleanup with confirmed backfill ledger rows; in that case rerun the
  manual staging deploy with `accept_data_loss=true`.
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
- Compose service status.
- Verification commands and results.
