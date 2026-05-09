# Staging Deploy Runbook

This runbook creates the initial KidItem staging runtime on one EC2 instance:

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
  Seed registry   -> Google Drive pinned seed artifacts
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
- A public DNS record such as `staging.example.com` pointing to the EC2 public IP.

Do not store secrets in git. Runtime secret files live only on the staging host.

## Expected Directory Shape

```text
/repo/.secrets/staging/
  kiditem-staging-keypair.pem
  deploy.env
  .env.staging.api
  .env.staging.web

/opt/kiditem/
  docker-compose.staging.yml
  deploy/staging/nginx.conf
  deploy/staging/host-nginx-http.conf.example
  deploy/staging/host-nginx.conf.example
  .env.staging.api
  .env.staging.web
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
DIRECT_URL=<supabase-session-pooler-url>
SUPABASE_URL=<current-dev-supabase-url>
CORS_ORIGINS=http://<ec2-public-ip>
S3_REGION=ap-northeast-2
S3_BUCKET=kiditem-staging-assets
S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_PUBLIC_URL=https://<project-ref>.supabase.co/storage/v1/object/public/kiditem-staging-assets
S3_ACCESS_KEY=<supabase-storage-s3-access-key-id>
S3_SECRET_KEY=<supabase-storage-s3-secret-access-key>
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

## Deploy From Local Workspace

From the local repo:

```bash
STAGING_HOST=<ec2-hostname-or-ip> \
STAGING_USER=ubuntu \
STAGING_SSH_KEY=~/.ssh/<key>.pem \
./bin/deploy-staging.sh
```

The script builds both Docker images locally, streams `docker save | gzip`
directly into `docker load` over SSH, restarts the compose stack, and checks
`http://127.0.0.1:8080/login` on the EC2 host. It intentionally does not store
the compressed image archive on EC2, which keeps small root disks from holding
both the archive and the loaded images at the same time.

By default, local builds target `linux/amd64`, which matches normal EC2 Ubuntu
instances even when the operator is using Apple Silicon locally. Override only
when the EC2 host is intentionally a different architecture:

```bash
DOCKER_PLATFORM=linux/arm64 ./bin/deploy-staging.sh
```

The first smoke deploy leaves Chromium out of the API image to fit small EC2
root disks. Browser-rendering workflows can be enabled after the instance has a
larger disk:

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
export KIDITEM_API_IMAGE=kiditem-staging-api:<tag>
export KIDITEM_WEB_IMAGE=kiditem-staging-web:<tag>
docker compose --env-file .env.staging.web -f docker-compose.staging.yml config
docker compose --env-file .env.staging.web -f docker-compose.staging.yml up -d
docker compose --env-file .env.staging.web -f docker-compose.staging.yml ps
docker compose --env-file .env.staging.web -f docker-compose.staging.yml logs --tail=100 nginx web api
```

## Verification

After deploy:

```bash
curl -fsS http://127.0.0.1:8080/login
curl -I http://<ec2-public-ip>/login
curl -I https://<real-staging-domain>/login
curl -I https://<real-staging-domain>/api/auth/me
```

Expected results:

- `/login` returns `200`.
- `/api/auth/me` returns an auth-related response such as `401` or `403` when
  unauthenticated. It should not be a connection error or nginx `502`.
- Browser network requests to app APIs use `http://<ec2-public-ip>/api/*` or
  `https://<real-staging-domain>/api/*`, not `localhost:4000`.

## Blocker Criteria

Stop and report instead of guessing if:

- `.env.staging.api` or `.env.staging.web` is missing on EC2.
- `docker compose config` fails.
- nginx returns `502` after both containers are running.
- Supabase connection errors mention the production project.
- Any seed/import step would target production by accident.

## Final Report Format

Report:

- EC2 host and public staging URL.
- Git branch or commit deployed.
- Docker image tag loaded on EC2.
- Supabase project ref used for staging.
- Supabase Storage bucket name used for staging.
- Compose service status.
- Verification commands and results.
