# Environment Variables Runbook

This runbook is the inventory for KidItem environment variables. It separates
the current minimum runtime env from feature-specific optional env, describes
where each variable is injected, which runtime consumes it, and how to verify
that staging received it without printing secret values.

Do not record real secrets in git, pull requests, issue comments, or chat.

Do not copy every variable in this runbook into every environment. Keep env
files minimal, then add feature-specific variables only when that feature is
actually enabled in that environment.

## Human Prerequisites

- Access to the GitHub repository and the target GitHub Environment.
- SSH access to the target host when changing runtime secrets.
- Access to the Supabase project used by the target environment.
- Access to provider consoles for AI keys, storage S3 keys, and marketplace
  credentials.

## Injection Paths

Local development:

```text
.env                    root tooling env: Prisma CLI, dev bootstrap, dev data
apps/server/.env        NestJS local runtime env
apps/web/.env.local     Next.js local env
agents/.env             Python agent runtime env
```

Staging:

```text
GitHub Environment `staging` variables
  -> build-time public web values and EC2 connection metadata

GitHub Environment `staging` secrets
  -> SSH key and known_hosts for deployment only
  -> staging DB URL for deploy-time Prisma schema/data migrations
  -> private DB baseline S3 credentials for manual staging DB baseline workflow
     only

/opt/kiditem/.env.staging.api
  -> runtime env_file for the API container

/opt/kiditem/.env.staging.web
  -> runtime env_file for the web container

/opt/kiditem/.env.staging.deploy
  -> generated image refs for docker compose

/opt/kiditem/deployments/current-db.json
  -> generated DB baseline manifest pointer, not a secret env file
```

`NEXT_PUBLIC_*` values are public client build values. Treat them as
environment-specific, but not as server secrets. If a `NEXT_PUBLIC_*` value is
used during `next build`, changing it requires rebuilding the web image.

## Environment Split

Local development:

- Source of truth examples are `.env.example`, `apps/server/.env.example`,
  `apps/web/.env.example`, and `agents/.env.example`.
- App runtime env is app-local: NestJS reads `apps/server/.env` first, Python
  agents read `agents/.env` first, and root `.env` is only a fallback for
  shared local tooling values.
- `apps/server/.env` and `apps/server/.env.example` intentionally mirror
  `deploy/staging/env/api.env.example` by section order, comments, blank lines,
  and key set. Values may differ locally, but optional local-only overrides
  stay out unless the staging API runtime contract also gains that variable.
- Root `.env` should stay narrow: Prisma CLI, Supabase bootstrap/admin sync,
  shared dev-data paths, and the Agent OS seed model used by
  `npm run seed:agent-os`.
- Product-bound detail page, thumbnail, and image-edit generation are direct AI
  jobs, not Agent OS runs. For local preview, keep `AI_TEXT_MODEL`,
  `AI_IMAGE_MODEL`, and `AI_IMAGE_ANALYSIS_MODEL` set in `apps/server/.env`.
- Local app env may include different values for local DB URLs and provider
  keys, but its API runtime format should stay aligned with the staging API env
  contract.
- Local env must not be copied to staging or production as-is.

Staging:

- Source of truth example is `deploy/staging/env/api.env.example` for the API
  container and `deploy/staging/env/web.env.example` for the web container.
- Staging should use a dedicated Supabase project, database, storage bucket, and
  provider keys once real QA begins. Reusing dev is allowed only as a short
  first-rollout bridge.
- The current staging compose runtime runs API, web, and nginx. It does not run
  `agents/` as a separate Python runtime.
- Keep staging to the current minimum runtime env below. Add AI, Agent OS, or
  channel credential env only when that staging feature is intentionally
  enabled and verified.

Production:

- Production must have a separate Supabase project, database, storage bucket,
  DNS/origin list, and provider keys from local and staging.
- Source of truth examples are `deploy/production/env/api.env.example` for the
  API container and `deploy/production/env/web.env.example` for the web
  container. Values and access keys must be created independently.
- Feature-specific secrets should remain absent until the production feature is
  launched. Do not promote unused staging secrets to production.

## Current Minimum Runtime Env

API container, current staging shape. In shared staging, these values are
managed from GitHub Environment `staging`; the deploy workflow renders
`.env.staging.api` before syncing assets to EC2.

```text
NODE_ENV
PORT
DATABASE_URL
SUPABASE_URL
CORS_ORIGINS
S3_REGION
S3_BUCKET
S3_ENDPOINT
S3_PUBLIC_URL
S3_ACCESS_KEY
S3_SECRET_KEY
```

API feature env currently enabled for staging:

```text
CHANNEL_CREDENTIALS_ENCRYPTION_KEY
GEMINI_API_KEY
AI_TEXT_MODEL
AI_IMAGE_MODEL
AI_IMAGE_ANALYSIS_MODEL
AI_IMAGE_ANALYSIS_VERIFY_MODEL
AGENT_RUNTIME_WORKER_ENABLED
AGENT_DEFAULT_MODEL
```

Web container, current staging shape:

```text
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

`NEXT_PUBLIC_API_URL` stays empty in staging/production when nginx handles
same-origin `/api/*` routing.

## Core API Runtime

| Variable | Owner | Required | Consumed by | Notes |
|---|---|---:|---|---|
| `NODE_ENV` | API runtime | Yes | NestJS, storage, prod guards | `production` in staging/prod. |
| `PORT` | API runtime | Yes | NestJS | `4000` for the API container. |
| `DATABASE_URL` | API runtime | Yes | Prisma adapter | Main application database URL. |
| `SUPABASE_URL` | Auth | Yes | Supabase JWT/JWKS middleware | Must match the project issuing browser session cookies. |
| `SOURCING_EXTENSION_TOKEN_SECRET` | Auth/Sourcing | Yes in production | Sourcing extension ingest token signer | Server-only HMAC secret for short-lived extension ingest tokens. Local dev falls back to an ephemeral boot secret. |
| `SOURCING_EXTENSION_TOKEN_TTL_SECONDS` | Auth/Sourcing | Optional | Sourcing extension ingest token signer | Defaults to `1800` seconds. |
| `SOURCING_EXTENSION_TOKEN_MAX_SECONDS` | Auth/Sourcing | Optional | Sourcing extension ingest token signer | Defaults to `86400` seconds, allowing long runs without indefinite credentials. |
| `CORS_ORIGINS` | API runtime | Yes in production | Nest CORS | Comma-separated public origins. Same-origin `/api/*` still works through nginx. |
| `API_SELF_URL` | API runtime | Optional | Action board service | Defaults to `http://localhost:4000`. Set if self-calls need the public or container URL. |

## Web Runtime And Build

| Variable | Owner | Required | Consumed by | Notes |
|---|---|---:|---|---|
| `NEXT_PUBLIC_API_URL` | Web build/runtime | Local only | API client, Next rewrite destination | Local dev uses `http://localhost:4000`. Staging/prod leave empty so browser requests stay same-origin and nginx routes `/api/*`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Web build/runtime | Yes | Supabase browser/server client, proxy | Public project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web build/runtime | Yes | Supabase browser/server client, proxy | Public publishable key. |
| `NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS` | Web runtime | Optional | Query devtools provider | Effective only when `NODE_ENV=development`. |

## Storage

| Variable | Owner | Required | Consumed by | Notes |
|---|---|---:|---|---|
| `S3_ENDPOINT` | API runtime | Yes in production | Storage service | Supabase Storage S3 endpoint or other S3-compatible endpoint. |
| `S3_ACCESS_KEY` | API runtime | Yes in production | Storage service | Server-only access key. |
| `S3_SECRET_KEY` | API runtime | Yes in production | Storage service | Server-only secret key. |
| `S3_BUCKET` | API runtime | Yes in production | Storage service | Bucket name. |
| `S3_PUBLIC_URL` | API runtime | Recommended | Storage service | Public object URL base. If missing, service derives it from endpoint and bucket. |
| `S3_REGION` | API runtime | Optional | Storage service | Defaults to `us-east-1`; staging uses `ap-northeast-2`. |

## Staging DB Baseline Operations

These variables are not API/web runtime env. `STAGING_DATABASE_URL` is also
used by `.github/workflows/staging-deploy.yml` for deploy-time Prisma
schema/data migrations. The other baseline variables are used only by
`.github/workflows/staging-db.yml` or an operator shell running
`npm run staging:db`. The bucket should be private and separate from
`S3_BUCKET`.

| Variable | Owner | Required when | Notes |
|---|---|---|---|
| `STAGING_DATABASE_URL` | GitHub Environment secret | GitHub Actions `staging-deploy` and `staging-db` workflows | Staging Supabase session pooler URL. Deploy uses it for `prisma db push` and `npm run data:migrate`; DB baseline receives it as `DATABASE_URL`. |
| `DATABASE_URL` | Operator shell | Local DB baseline operation | Staging DB URL only. The CLI refuses mutating operations unless target is explicitly staging. |
| `STAGING_DB_BASELINE_TARGET` | Operator/workflow guard | Export or restore | Must be `staging`; prevents accidental generic DB mutation. |
| `STAGING_DB_BASELINE_SANITIZED` | Operator/workflow guard | Export | Must be `true`; operator assertion that the dump contains no production/customer raw data. |
| `STAGING_DB_BASELINE_BUCKET` | DB baseline storage | Export, verify, restore | Private bucket for DB dump artifacts. Do not use the public app asset bucket. |
| `STAGING_DB_BASELINE_S3_ENDPOINT` | DB baseline storage | Export, verify, restore | Supabase Storage S3-compatible endpoint. |
| `STAGING_DB_BASELINE_S3_REGION` | DB baseline storage | Export, verify, restore | Staging uses `ap-northeast-2`; falls back to `S3_REGION` for operator convenience. |
| `STAGING_DB_BASELINE_S3_ACCESS_KEY` | DB baseline storage secret | Export, verify, restore | Server/operator-only S3 access key. |
| `STAGING_DB_BASELINE_S3_SECRET_KEY` | DB baseline storage secret | Export, verify, restore | Server/operator-only S3 secret. |
| `STAGING_DB_BASELINE_PREFIX` | DB baseline storage | Optional | Defaults to `staging-db-baselines`. |
| `STAGING_DB_BASELINE_PROFILE_ID` | Operator shell | Optional local convenience | Pinned immutable profile id, never `latest`. |
| `STAGING_DB_BASELINE_RECORD_DIR` | Operator shell | Optional local/EC2 record write | Writes `current-db.json` and `db-history/` after export/restore. |

## Server AI And Models

These variables are feature-specific. They are part of staging when current API
text/detail/thumbnail/image-edit AI features are enabled.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | Gemini text, image, or vision paths are used | Gemini text/media/thumbnail adapters | Missing key returns explicit service errors. |
| `AI_TEXT_MODEL` | Text transform, detail page prefill, direct detail generation | Text AI/detail page services | No silent fallback. Human-triggered and fixed workflow detail generation use this value. |
| `AI_IMAGE_MODEL` | Thumbnail/editor image generation, image edit, and detail-page generated images | Thumbnail/image-edit Gemini config and detail-page media adapter | Direct AI provider config. Human-triggered and fixed workflow thumbnail/detail/image-edit media generation use this value. Do not use deprecated preview IDs called out by the config. |
| `AI_IMAGE_ANALYSIS_MODEL` | Thumbnail/image analysis and detail-page image inference | Thumbnail Gemini config and detail-page media adapter | No silent fallback. |
| `AI_IMAGE_ANALYSIS_VERIFY_MODEL` | Thumbnail compliance verify path | Thumbnail Gemini config | No silent fallback. |
| `AGENT_OS_OPERATOR_RUNTIME` | Agent OS Operator should use a non-deterministic provider runtime | Nest Agent OS Operator runtime handler | Set `hermes_tool_loop` for the current Hermes tool-loop runtime. `hermes` remains a legacy/dev final-decision fallback. `openai_responses` remains a hosted API fallback/eval path. Missing value keeps the deterministic local path. |
| `AGENT_OS_HERMES_PATH` | Agent OS `hermes_tool_loop` or legacy `hermes` runtime is enabled and Hermes is not on `PATH` | Nest Agent OS Hermes runtime | Optional Hermes CLI binary path. Defaults to `hermes`; missing binaries fail closed with `operator_runtime_unavailable`. |
| `AGENT_OS_HERMES_MODEL` | Agent OS `hermes_tool_loop` or legacy `hermes` runtime is enabled | Nest Agent OS Hermes runtime and Hermes CLI harness | Explicit Hermes model selection is required; no silent default. |
| `AGENT_OS_HERMES_HOME` | Agent OS `hermes_tool_loop` or legacy `hermes` runtime is enabled | Nest Agent OS Hermes runtime profile service | Optional base directory for isolated Hermes profiles. Defaults to `/tmp/kiditem-agent-os-hermes`; per-run profiles are nested by organization and task session. |
| `AGENT_OS_HERMES_AUTH_HOME` | Hermes auth material should be copied from an existing Hermes profile | Nest Agent OS Hermes runtime profile service | Optional source directory containing `auth.json`. KidItem copies auth into the isolated `HERMES_HOME`; the original source path is not forwarded to Hermes or MCP env. Nested Leaf Hermes sessions receive the isolated profile path as their auth source. |
| `AGENT_OS_HERMES_LEAF_AGENT_TYPES` | Agent OS should run configured Leaf Agents through Hermes instead of deterministic local runtime handlers | Nest Agent OS Operator and Leaf runtime handlers | Comma-separated agent types, for example `sourcing,listing`. When set, `AGENT_OS_OPERATOR_RUNTIME` must also be explicit. |
| `AGENT_OS_HERMES_TIMEOUT_MS` | Custom Hermes Operator timeout is needed | Nest Agent OS Hermes runtime | Optional; defaults to 60000 ms. |
| `AGENT_OS_HERMES_MAX_OUTPUT_BYTES` | Hermes stdout/stderr capture should be capped differently | Nest Agent OS Hermes runtime | Optional; defaults to 262144 bytes. Output is truncated before diagnostics. |
| `AGENT_OS_HERMES_MAX_CONCURRENT_RUNS` | Hermes subprocess concurrency should be capped differently | Nest Agent OS Hermes runtime | Optional; defaults to 1. Extra concurrent turns fail closed with `operator_runtime_busy`. |
| `AGENT_OS_HERMES_ENABLE_KIDITEM_MCP` | Legacy `hermes` final-decision fallback needs manual MCP experimentation | Nest Agent OS Hermes runtime profile service | `hermes_tool_loop` force-enables the KidItem MCP toolset itself. This flag is only for legacy/dev fallback sessions. |
| `OPENAI_API_KEY` | Agent OS `openai_responses` Operator runtime or Python direct OpenAI mode is enabled | Nest Agent OS OpenAI Responses runtime; Python agents direct provider path | Required for paid OpenAI Operator verification. Server code fails closed when this runtime is selected without a key. |
| `AGENT_OS_OPENAI_RESPONSES_MODEL` | Agent OS `openai_responses` Operator runtime is enabled | Nest Agent OS OpenAI Responses runtime | Explicit model selection is required; no silent default. |
| `AGENT_OS_OPENAI_RESPONSES_TIMEOUT_MS` | Custom OpenAI Operator timeout is needed | Nest Agent OS OpenAI Responses runtime | Optional; defaults in code. |
| `AGENT_OS_OPENAI_RESPONSES_BASE_URL` | Custom OpenAI-compatible Responses endpoint is needed | Nest Agent OS OpenAI Responses runtime | Optional; defaults to OpenAI's v1 API base URL. |
| `AGENT_OS_1688_CHECKOUT_RUNTIME` | Agent OS should execute live 1688 checkout/payment | Agent OS live readiness preflight; Supply 1688 checkout runtime | Set to `provider` for the current provider-backed runtime. Missing or unsupported values block `supply.submit_purchase_order` live checkout readiness. |
| `AGENT_OS_1688_CHECKOUT_PROVIDER_URL` | `AGENT_OS_1688_CHECKOUT_RUNTIME=provider` | Supply `Alibaba1688CheckoutRuntimeAdapter` | Provider endpoint that accepts `{ organizationId, purchaseOrderId }` and returns `externalOrderId` plus optional `externalOrderUrl`. Required before readiness reports the 1688 checkout runtime as ready. |
| `AGENT_OS_1688_CHECKOUT_TIMEOUT_MS` | Custom 1688 provider checkout timeout is needed | Supply `Alibaba1688CheckoutRuntimeAdapter` | Optional; defaults in code. |

## Server Market Data Providers

These variables are feature-specific and should be present only where sourcing
keyword research is intentionally enabled.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `NAVER_DATALAB_CLIENT_ID` | Naver DataLab trend verification is enabled | Sourcing Naver DataLab adapter | Developer Center application client id. Server-side only. |
| `NAVER_DATALAB_CLIENT_SECRET` | Naver DataLab trend verification is enabled | Sourcing Naver DataLab adapter | Developer Center application secret. Never expose to web or agents. |
| `NAVER_DATALAB_BASE_URL` | Non-production DataLab endpoint override is needed | Sourcing Naver DataLab adapter | Optional. Defaults to `https://openapi.naver.com`. |
| `NAVER_DATALAB_WEB_BASE_URL` | Non-production DataLab web endpoint override is needed | Sourcing DataLab popular keyword adapter | Optional. Defaults to `https://datalab.naver.com`. Used for Shopping Insight popular keyword boards. |
| `NAVER_SEARCHAD_API_KEY` | Naver SearchAd keyword research is enabled | Sourcing Naver keyword adapter | Access license from Naver SearchAd API manager. Server-side only. |
| `NAVER_SEARCHAD_SECRET_KEY` | Naver SearchAd keyword research is enabled | Sourcing Naver keyword adapter | HMAC signing secret. Never expose to web or agents. |
| `NAVER_SEARCHAD_CUSTOMER_ID` | Naver SearchAd keyword research is enabled | Sourcing Naver keyword adapter | SearchAd advertiser customer id used in `X-Customer`. |
| `NAVER_SEARCHAD_BASE_URL` | Non-production SearchAd endpoint override is needed | Sourcing Naver keyword adapter | Optional. Defaults to `https://api.searchad.naver.com`. |

## Agent OS And Claude CLI

These variables are feature-specific. They should not be present in shared
staging/production unless Agent OS execution or Claude CLI chat is intentionally
enabled and covered by an operator runbook.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `AGENT_RUNTIME_WORKER_ENABLED` | Background Agent OS execution should run | Agent run worker | Default is disabled. Use `1` or `true` only after handlers and model env are ready. |
| `AGENT_RUNTIME_WORKER_INTERVAL_MS` | Worker enabled and custom tick interval needed | Agent run worker | Defaults to `2000`. |
| `AGENT_RUNTIME_ALLOW_NOOP` | Isolated dev/test only | Routing runtime adapter | Never set in shared staging/prod. |
| `AGENT_DEFAULT_MODEL` | Any Agent OS definition should share one default model | Agent definition registry and Agent OS seed | Used only when a per-agent model env is empty. Local `npm run seed:agent-os` reads this from root `.env`; API runtime reads it from `apps/server/.env`. |
| `AGENT_MANAGER_MODEL` | Manager agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_RULES_EVALUATION_MODEL` | Rules evaluation agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_RULES_SUGGEST_MODEL` | Rules suggestion agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_AD_STRATEGY_MODEL` | Ad strategy agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_SOURCING_MODEL` | Sourcing agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_THUMBNAIL_ANALYST_MODEL` | Thumbnail analyst agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_CHAT_MODEL` | Chatbot agent enabled | Agent definition registry | Required unless `AGENT_DEFAULT_MODEL` is set. |
| `ANTHROPIC_API_KEY` | Claude CLI uses Anthropic API key auth | Claude CLI env allowlist | Passed only to the Claude child process. |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude CLI uses OAuth token auth | Claude CLI env allowlist | Passed only to the Claude child process. |

## Channel Credentials

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `CHANNEL_CREDENTIALS_ENCRYPTION_KEY` | Storing or decrypting channel credentials | Channel credential crypto | Must be 32 bytes as base64, hex, or raw UTF-8. Generate with `openssl rand -base64 32`. |

## Local And Dev Tooling

These variables are for local scripts, data sync, or compatibility paths. Do
not add them to shared staging/prod unless the runbook for that operation asks
for them.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `SUPABASE_SECRET_KEY` | Running Supabase admin sync/bootstrap scripts | Scripts and dev bootstrap | Secret key. Never expose to frontend or git. |
| `DEV_USER_EMAIL` | Dev preview session callback bootstrap | `bin/dev-bootstrap.sh` | Defaults to the shared dev seed user when unset. |
| `DEV_WEB_ORIGIN` | Dev preview session callback bootstrap | `bin/dev-bootstrap.sh` | Must match the exact local browser origin. |
| `KIDITEM_DEV_DATA_DRIVE_DIR` | Google Drive dev data sync | Dev data scripts | Local Google Drive Desktop path. |
| `KIDITEM_DEV_ORGANIZATION_ID` | Dev data sync/import needs target org | Dev data scripts | Local/dev org scope. |
| `KIDITEM_DEV_USER_ID` | Dev data API replay needs an actor | Dev data scripts | Optional explicit user id for replay. Prefer organization-scoped imports where possible. |
| `KIDITEM_API_URL` | Dev data API replay targets a non-default API origin | Dev data scripts | Defaults to `http://localhost:4000`. |
| `KIDITEM_DEV_DATA_CLOUD_STORAGE_ROOT` | Dev data cloud-storage bundle root is used | Dev data scripts | Optional alternative to local Drive path. |
| `DEV_DEFAULT_USER_ID` | Dev data replay compatibility | Dev data scripts | Optional fallback local user id. Prefer explicit organization scope for imports. |
| `AGENT_SEED_ORG_IDS` | Seeding Agent OS for only specific organizations | `scripts/seed-agent-os.ts` | Empty means seed every active local organization. |
| `STAGING_URL` | Preparing a staging-targeted Coupang extension package | `scripts/prepare-coupang-extension.mjs`, staging workflow | Public staging origin. |
| `EXTENSION_OUTPUT_DIR` | Custom extension package output directory is needed | `scripts/prepare-coupang-extension.mjs` | Optional; script has a default output directory. |

## Browser Automation

The deployed API blocks current Coupang Wing scraping paths when
`NODE_ENV=production`. These variables are mainly local/operator overrides.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `PLAYWRITER_BIN` | Custom Playwriter binary path needed | Playwriter CLI wrapper | Optional override. |
| `PLAYWRITER_BROWSER_PATH` | Managed Chrome path cannot be auto-detected | Coupang inventory scrape adapter | Local/operator use. |
| `PLAYWRITER_BROWSER_PROFILE_DIR` | Custom Chrome profile needed | Coupang inventory scrape adapter | Local/operator use. |
| `PLAYWRITER_DIRECT_PORT` | Custom Chrome CDP port needed | Coupang inventory scrape adapter | Defaults to `9222`. |
| `PUPPETEER_EXECUTABLE_PATH` | Puppeteer render path uses a non-default browser | Render image controller | Docker server image sets `/usr/bin/chromium`; staging API builds install Chromium and smoke-check Puppeteer launch after deploy. |
| `SOURCING_PLAYWRIGHT_CDP_ENDPOINT` | Sourcing URL scrape should reuse a logged-in managed browser session | Sourcing Playwright runtime | Optional CDP endpoint such as `http://127.0.0.1:9222`. Use a dedicated managed browser/profile where the user has completed 1688 login or verification; do not point production at a personal default Chrome profile. |
| `SOURCING_PLAYWRIGHT_USER_DATA_DIR` | Sourcing URL scrape needs a prepared browser login session | Sourcing Playwright runtime | Defaults to `.kiditem/playwright/sourcing`. Use a dedicated automation profile, not a personal default Chrome profile. |
| `SOURCING_PLAYWRIGHT_HEADLESS` | Local sourcing scrape login/profile debugging | Sourcing Playwright runtime | Defaults to `true`; set `false` while preparing or debugging the 1688/Alibaba profile. |

## Python Agents Runtime

The Python agent server is not part of the current staging compose file. These
variables apply when running `agents/` as a separate runtime.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `DATABASE_URL` | Python agents run | Python config | Required at import time. |
| `AI_MODE` | Python AI client runs | Python AI client | `proxy` or `direct`. |
| `AI_BASE_URL` | `AI_MODE=proxy` | Python AI client | Proxy base URL, for example VectorEngine. |
| `VECTORENGINE_API_KEY` | `AI_MODE=proxy` | Python AI client | Proxy API key. |
| `OPENAI_API_KEY` | Direct OpenAI model/provider path | Python AI client | Provider-specific direct mode. |
| `GEMINI_API_KEY` | Direct Gemini model/provider path | Python AI client | Provider-specific direct mode. |
| `AI_TEXT_MODEL` | Text generation agents | Python content agents | No silent fallback. |
| `AI_IMAGE_ANALYSIS_MODEL` | Vision analysis agents | Python content agents | No silent fallback. |
| `DETAIL_PAGE_TEMPLATE` | Default template selection needed | Python config | Defaults to `bold_vertical`. |
| `TMAPI_TOKEN` | 1688/TMAPI sourcing matcher or wholesale image search enabled | Python sourcing matcher, Nest sourcing image-search API | Optional unless matcher/search is used. |
| `TMAPI_BASE_URL` | Custom TMAPI endpoint needed | Python sourcing matcher, Nest sourcing image-search API | Defaults in code. |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | LLM tracing enabled | Python config/Langfuse | Both keys required to enable. |
| `LANGFUSE_BASE_URL` | Custom Langfuse endpoint needed | Langfuse SDK | Defaults to Langfuse Cloud in examples. |
| `LANGFUSE_HOST` | Migrating an old local agents env | Python config | Legacy alias mapped to `LANGFUSE_BASE_URL` when set and `LANGFUSE_BASE_URL` is empty. Prefer `LANGFUSE_BASE_URL`; it is intentionally omitted from new `.env.example` files. |
| `LOG_LEVEL` | Custom logging verbosity needed | Python config | Defaults to `INFO`. |

## GitHub Actions Staging Environment

Variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
STAGING_AGENT_DEFAULT_MODEL
STAGING_AGENT_RUNTIME_WORKER_ENABLED
STAGING_AI_IMAGE_ANALYSIS_MODEL
STAGING_AI_IMAGE_ANALYSIS_VERIFY_MODEL
STAGING_AI_IMAGE_MODEL
STAGING_AI_TEXT_MODEL
STAGING_CORS_ORIGINS
STAGING_DB_BASELINE_BUCKET
STAGING_DB_BASELINE_PREFIX
STAGING_DB_BASELINE_S3_ENDPOINT
STAGING_DB_BASELINE_S3_REGION
STAGING_HOST
STAGING_NAVER_DATALAB_BASE_URL
STAGING_NAVER_DATALAB_WEB_BASE_URL
STAGING_NAVER_SEARCHAD_BASE_URL
STAGING_REMOTE_DIR
STAGING_S3_BUCKET
STAGING_S3_ENDPOINT
STAGING_S3_PUBLIC_URL
STAGING_S3_REGION
STAGING_SUPABASE_URL
STAGING_TMAPI_BASE_URL
STAGING_URL
STAGING_USER
```

Secrets:

```text
STAGING_CHANNEL_CREDENTIALS_ENCRYPTION_KEY
STAGING_DATABASE_URL
STAGING_DB_BASELINE_S3_ACCESS_KEY
STAGING_DB_BASELINE_S3_SECRET_KEY
STAGING_DIRECT_URL
STAGING_GEMINI_API_KEY
STAGING_NAVER_DATALAB_CLIENT_ID
STAGING_NAVER_DATALAB_CLIENT_SECRET
STAGING_NAVER_SEARCHAD_API_KEY
STAGING_NAVER_SEARCHAD_CUSTOMER_ID
STAGING_NAVER_SEARCHAD_SECRET_KEY
STAGING_S3_ACCESS_KEY
STAGING_S3_SECRET_KEY
STAGING_SSH_KEY
STAGING_SSH_KNOWN_HOSTS
STAGING_TMAPI_TOKEN
```

The workflow uses the short-lived `GITHUB_TOKEN` for GHCR push/pull. Do not add
a long-lived GHCR token unless organization policy blocks `GITHUB_TOKEN`.

## Current Staging Verification

Print current minimum env presence without values:

```bash
set -a
source .secrets/staging/deploy.env
set +a

ssh -i "$STAGING_SSH_KEY" "$STAGING_USER@$STAGING_HOST" '
  docker exec kiditem-staging-api sh -lc '"'"'
    for k in NODE_ENV PORT DATABASE_URL SUPABASE_URL CORS_ORIGINS \
      S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET S3_PUBLIC_URL S3_REGION \
      PUPPETEER_EXECUTABLE_PATH; do
        eval v=\${$k-}
        if [ -n "$v" ]; then
          printf "%s=SET len=%s\n" "$k" "${#v}"
        else
          printf "%s=UNSET\n" "$k"
        fi
      done
  '"'"'
'
```

Probe optional feature env only when that feature is being enabled:

```bash
ssh -i "$STAGING_SSH_KEY" "$STAGING_USER@$STAGING_HOST" '
  docker exec kiditem-staging-api sh -lc '"'"'
    for k in OPENAI_API_KEY GEMINI_API_KEY AI_TEXT_MODEL AI_IMAGE_MODEL \
      AI_IMAGE_ANALYSIS_MODEL AI_IMAGE_ANALYSIS_VERIFY_MODEL \
      NAVER_DATALAB_CLIENT_ID NAVER_DATALAB_CLIENT_SECRET NAVER_DATALAB_WEB_BASE_URL \
      NAVER_SEARCHAD_API_KEY NAVER_SEARCHAD_SECRET_KEY NAVER_SEARCHAD_CUSTOMER_ID \
      CHANNEL_CREDENTIALS_ENCRYPTION_KEY \
      AGENT_RUNTIME_WORKER_ENABLED AGENT_DEFAULT_MODEL \
      ANTHROPIC_API_KEY \
      CLAUDE_CODE_OAUTH_TOKEN; do
        eval v=\${$k-}
        if [ -n "$v" ]; then
          printf "%s=SET len=%s\n" "$k" "${#v}"
        else
          printf "%s=UNSET\n" "$k"
        fi
      done
  '"'"'
'
```

Print the deployed image refs and git SHA:

```bash
ssh -i "$STAGING_SSH_KEY" "$STAGING_USER@$STAGING_HOST" \
  'cd /opt/kiditem && cat deployments/current.json'
```

## Success Criteria

- Required env for the target runtime is present.
- `docker compose --env-file .env.staging.web -f docker-compose.staging.yml config`
  succeeds on the staging host.
- `./deploy/staging/remote-deploy.sh status` reports healthy containers.
- `/login` returns `200`.
- `/api/auth/me` returns `401` or `403` when unauthenticated.

## Blocker Criteria

- Any required secret is missing for a feature being enabled.
- A `NEXT_PUBLIC_*` value was changed without rebuilding the web image.
- `AGENT_RUNTIME_WORKER_ENABLED=1` is set without model env and runtime handlers
  ready for the enabled agent types.
- Staging deploy is attempted without Agent OS seed/runtime env after async
  detail page or thumbnail generation has been enabled.
- `AGENT_RUNTIME_ALLOW_NOOP=1` is present in shared staging/prod.
- `CHANNEL_CREDENTIALS_ENCRYPTION_KEY` is missing while channel credentials are
  being stored or decrypted.

## Final Report Format

```text
Environment checked:
- Runtime:
- Git SHA:
- Missing required env:
- Optional env intentionally unset:
- Commands run:
- Result:
```
