# Storage Cache-Control

Use this runbook when Supabase Storage cached egress is growing because public
image assets are being downloaded repeatedly without long browser cache headers.

The script is staging-only for mutating runs. It lists generated image prefixes
and can backfill Cache-Control on existing objects. Prefer the S3 driver when
operator S3 credentials are available because it rewrites metadata with a
same-key `CopyObject` instead of downloading and re-uploading bytes.

## Human Prerequisites

- Supabase project and bucket are the staging assets bucket, for example
  `kiditem-staging-assets`.
- Operator has one of:
  - Supabase `SUPABASE_URL` and server-side `SUPABASE_SECRET_KEY`, or
  - Supabase Storage S3 credentials for the app asset bucket.
- Do not use production buckets or production credentials.

## Environment

Supabase Storage API driver:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret-key>
STORAGE_CACHE_CONTROL_BUCKET=kiditem-staging-assets
```

S3 driver:

```text
STORAGE_CACHE_CONTROL_BUCKET=kiditem-staging-assets
STORAGE_CACHE_CONTROL_S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
STORAGE_CACHE_CONTROL_S3_REGION=ap-northeast-2
STORAGE_CACHE_CONTROL_S3_ACCESS_KEY=<app-asset-s3-access-key-id>
STORAGE_CACHE_CONTROL_S3_SECRET_KEY=<app-asset-s3-secret-access-key>
```

Do not write real keys into this runbook, repo files, PR bodies, or terminal
logs.

## Safe Agent Actions

Inspect the target set:

```bash
npm run storage:cache-control -- status --bucket kiditem-staging-assets
```

Smoke-test a small subset:

```bash
npm run storage:cache-control -- status \
  --bucket kiditem-staging-assets \
  --prefix thumbnail-generations \
  --max-objects 10
```

Apply the staging backfill:

```bash
npm run storage:cache-control -- apply \
  --bucket kiditem-staging-assets \
  --target staging \
  --confirm APPLY_STORAGE_CACHE_CONTROL
```

Prefer the S3 driver when credentials exist:

```bash
npm run storage:cache-control -- apply \
  --bucket kiditem-staging-assets \
  --driver s3 \
  --target staging \
  --confirm APPLY_STORAGE_CACHE_CONTROL
```

## Verification

- Run `npm run storage:cache-control -- status --bucket kiditem-staging-assets`
  and record object count plus total bytes.
- Fetch a changed public object with `curl -I <public-url>` and confirm the
  response has a long `cache-control` max-age.
- Recheck Supabase Dashboard usage after its normal refresh delay.
- Run script verification before committing:

```bash
npm run check:scripts-inventory
npm run test:scripts
```

## Blockers

- Missing `SUPABASE_SECRET_KEY` and missing S3 credentials.
- Bucket is not the staging public app asset bucket.
- Apply command is missing `--target staging` or
  `--confirm APPLY_STORAGE_CACHE_CONTROL`.
- Any output indicates failed object updates.

## Final Report Format

```text
storage cache-control backfill:
- bucket:
- driver:
- prefixes:
- scanned:
- eligible:
- updated:
- skipped:
- failed:
- verification:
```
