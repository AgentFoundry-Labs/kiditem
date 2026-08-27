# Environment Variables Runbook

This runbook is the inventory for KidItem environment variables. It separates
the current minimum runtime env from feature-specific optional env, describes
where each variable is injected, which runtime consumes it, and how to verify
that Office received it without printing secret values.

Do not record real secrets in git, pull requests, issue comments, or chat.

Do not copy every variable in this runbook into every environment. Keep env
files minimal, then add feature-specific variables only when that feature is
actually enabled in that environment.

## Human Prerequisites

- Access to the GitHub repository and the `office` GitHub Environment.
- Local operator access to the Office host when changing runtime secrets.
- Access to provider consoles for AI keys and marketplace credentials.

## Injection Paths

Local development:

```text
.env                    root tooling env: Prisma CLI, dev bootstrap, dev data
apps/server/.env        NestJS local runtime env
apps/web/.env.local     Next.js local env
agents/.env             Python agent runtime env
```

Office:

```text
C:\ProgramData\Kiditem\.env.office
  -> non-secret Compose/runtime settings

OFFICE_API_ENV_FILE
  -> path to the protected API runtime env file outside Git

C:\ProgramData\Kiditem\deployments\current.json
  -> immutable Office bundle manifest, not an env or secret file
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
- The API runtime sections of `apps/server/.env` and
  `apps/server/.env.example` intentionally mirror
  `deploy/office/office.env.example` where the same runtime concern exists.
- Root `.env` should stay narrow: Prisma CLI and shared dev-data paths. Agent
  profiles and capability catalogs are code-owned, not seeded or configured by env.
- Product-bound detail page, thumbnail, and image-edit generation are direct AI
  jobs, not Agent OS runs. For local preview, keep `AI_TEXT_MODEL`,
  `AI_IMAGE_MODEL`, and `AI_IMAGE_ANALYSIS_MODEL` set in `apps/server/.env`.
- Local env must not be copied to Office as-is.
- `KIDITEM_BROWSER_QA_EMAIL` is an optional, non-secret test-only login email
  for `qa:agent-os:clean-cutover -- --serve-browser-qa`; `--email <email>`
  takes precedence. It is never an Office runtime variable. The browser-QA
  password is requested only from interactive stdin and must never be placed in
  an environment variable, command argument, source, or log.

Office:

- Source of truth examples are `deploy/office/office.env.example` and the
  application-local `.env.example` files.
- PostgreSQL and MinIO run locally on the Office host through external Docker
  volumes. Application authentication is stored in PostgreSQL.
- The protected API env file remains outside Git and is referenced by
  `OFFICE_API_ENV_FILE`; do not copy it into an Actions artifact.
- Add AI, Agent OS, or channel credentials only when that Office feature is
  intentionally enabled and verified.

## Current Minimum Runtime Env

API container, current Office shape. These values are stored in the protected
Office API env file outside Git.

```text
NODE_ENV
PORT
DATABASE_URL
WEB_ORIGIN
CORS_ORIGINS
S3_REGION
S3_BUCKET
S3_ENDPOINT
S3_PUBLIC_URL
S3_ACCESS_KEY
S3_SECRET_KEY
```

API feature env currently enabled for Office:

```text
CHANNEL_CREDENTIALS_ENCRYPTION_KEY
GEMINI_API_KEY
AI_TEXT_MODEL
AI_IMAGE_MODEL
AI_IMAGE_ANALYSIS_MODEL
AI_IMAGE_ANALYSIS_VERIFY_MODEL
KIDITEM_APPLICATION_VERSION
KIDITEM_GIT_SHA
KIDITEM_AGENT_GATEWAY_TOKEN_FILE
MCP_SDK_GENERATION
MCP_PROTOCOL_NEGOTIATION
```

## Operations Control Plane

The operation worker and scheduler are deliberately disabled unless explicitly
enabled. This prevents a newly deployed API from replaying scheduled work before
the operator has confirmed the database migration, connected browser runtime,
and schedule state. `OperationSchedule.enabled` is the per-workflow control;
these variables only enable the server processes that honor it.

| Variable | Required when | Consumed by | Notes |
|---|---:|---|---|
| `OPERATION_RUNTIME_WORKER_ENABLED` | Domain/composite OperationRuns should execute | Operation run worker | Set `1` only after the control-plane tables are deployed. Default is disabled; local `npm run dev:all` enables it explicitly. Browser operations transition to `waiting_runtime` and are claimed by the extension. |
| `OPERATION_RUNTIME_WORKER_INTERVAL_MS` | Worker polling cadence needs tuning | Operation run worker | Optional positive integer; defaults to `2000`. |
| `OPERATION_SCHEDULER_ENABLED` | Enabled cron schedules should create OperationRuns | Operation scheduler | Set `1` only with the runtime worker enabled and browser runtime connected. Default is disabled. |
| `OPERATION_SCHEDULER_INTERVAL_MS` | Scheduler polling cadence needs tuning | Operation scheduler | Optional positive integer; defaults to `30000`. |
| `OPERATION_RUN_LEASE_MS` | Operation worker/browser lease duration needs tuning | Operation worker and browser runtime API | Optional positive integer; defaults to `60000`. Extension heartbeats at no slower than one-third of the browser lease. |
| `OPERATION_RESOURCE_CLASS_LIMITS` | API needs a non-default per-class capacity | API Operations worker | Optional complete JSON object. When absent, defaults are `default:2`, `naver_api:2`, `playwright_1688:1`, `snapshot_compute:2`, and `extension_coupang:4`. Every class must be present with a positive integer; unknown classes, zero/negative values, or malformed JSON fail API startup with `operation_resource_class_limits_invalid`. |

Cron expressions use the standard five fields (`minute hour day-of-month month
day-of-week`) and are evaluated in the schedule's explicit IANA timezone. The
dashboard stores the cron, timezone, misfire policy, and enabled state per
operation; disabling a schedule preserves its expression but sets its next run
to `null`.

Validate this value before an Office deployment without printing any protected
environment file: compare the intended complete key set to the table above,
then boot the isolated API. Do not use a partial JSON override: the parser does
not merge omitted keys with defaults. A failed validation is fail-closed; keep
the old runtime running and correct the configuration before attempting another
API boot. Resource limits belong only to the API Operations owner, never the
Agent worker or an MCP child.

Web container, current Office shape:

```text
NEXT_PUBLIC_API_URL
```

`NEXT_PUBLIC_API_URL` stays empty in Office when nginx handles
same-origin `/api/*` routing.

## Core API Runtime

| Variable | Owner | Required | Consumed by | Notes |
|---|---|---:|---|---|
| `NODE_ENV` | API runtime | Yes | NestJS, storage, runtime guards | `production` in Office. |
| `PORT` | API runtime | Yes | NestJS | `4000` for the API container. |
| `DATABASE_URL` | API runtime | Yes | Prisma adapter | Main application database URL. |
| `WEB_ORIGIN` | API runtime | Yes | API bootstrap, detail page client renderer | Single canonical browser origin used to construct extension render document URLs. There is no localhost fallback; never derive it from `CORS_ORIGINS`. |
| `CORS_ORIGINS` | API runtime | Yes in Office | Nest CORS | Comma-separated trusted Office origins. Same-origin `/api/*` still works through nginx. |
| `API_SELF_URL` | API runtime | Required for Action Board actions | Action Board | Use the container-local API base (`http://api:4000` in Office). It is not a browser secret. |

## Web Runtime And Build

| Variable | Owner | Required | Consumed by | Notes |
|---|---|---:|---|---|
| `NEXT_PUBLIC_API_URL` | Web build/runtime | Local only | API client, Next rewrite destination | Local dev uses `http://localhost:4000`. Office leaves it empty so browser requests stay same-origin and nginx routes `/api/*`. |
| `NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS` | Web runtime | Optional | Query devtools provider | Effective only when `NODE_ENV=development`. |

## Storage

| Variable | Owner | Required | Consumed by | Notes |
|---|---|---:|---|---|
| `S3_ENDPOINT` | API runtime | Yes in Office | Storage service | Office MinIO S3-compatible endpoint. |
| `S3_ACCESS_KEY` | API runtime | Yes in Office | Storage service | Server-only MinIO access key. |
| `S3_SECRET_KEY` | API runtime | Yes in Office | Storage service | Server-only MinIO secret key. |
| `S3_BUCKET` | API runtime | Yes in Office | Storage service | Office bucket name. |
| `S3_PUBLIC_URL` | API runtime | Recommended | Storage service | Public object URL base. If missing, service derives it from endpoint and bucket. |
| `S3_REGION` | API runtime | Optional | Storage service | Defaults to `us-east-1`, which is suitable for the Office MinIO runtime. |

## Sourcing Trend Providers

| Variable | Required when | Consumed by | Notes |
|---|---:|---|---|
| `YOUTUBE_API_KEY` | Direct YouTube Shorts trend collection is enabled | Sourcing Shorts provider adapter | Server-only YouTube Data API v3 key. When configured, keyword searches collect up to 30 days of short-form candidates and the query API derives 7-day or 30-day rankings. Restrict the key to YouTube Data API v3 and, where possible, the API server IP. When absent, the legacy Shortstrend snapshot provider remains active. |
| `TAOBAO_TOP_APP_KEY` | Taobao Live official collection is enabled | Sourcing Taobao Live adapter | Alibaba TOP application key. The supported live metadata/content/item APIs do not require seller OAuth, but the AppKey must have access to those APIs. |
| `TAOBAO_TOP_APP_SECRET` | Taobao Live official collection is enabled | Sourcing Taobao Live adapter | Server-only TOP signing secret. Never expose it to the web app, extension, logs, or Agent OS prompts. |
| `TAOBAO_TOP_BASE_URL` | A non-production TOP gateway is needed | Sourcing Taobao Live adapter | Optional; defaults to `https://eco.taobao.com/router/rest`. |
| `TAOBAO_TOP_TIMEOUT_MS` | Custom Taobao TOP timeout is needed | Sourcing Taobao Live adapter | Optional positive integer; defaults to 15000ms. |
| `SOURCING_LINKFOX_SHADOW_ENABLED` | A paid EchoTik shadow pilot is approved | Market shadow signal service | Must be exactly `1` to arm the treatment. The service still requires an explicit pilot organization allowlist and region. Leave unset or `0` in Office unless explicitly approved. |
| `SOURCING_LINKFOX_ECHOTIK_REGION` | LinkFox shadow is armed | Market shadow signal service | Required EchoTik region. Supported values: `US`, `GB`, `ID`, `TH`, `PH`, `MY`, `VN`, `MX`, `SG`, `SA`, `BR`, `ES`, `JP`, `DE`, `IT`, `FR`. There is no `KR` fallback. |
| `SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS` | LinkFox shadow is armed | Market shadow signal service | Comma-separated organization UUID allowlist. An empty list disables all paid calls even when the feature flag is `1`. |
| `LINKFOX_AGENT_API_KEY` | An allowlisted organization runs the LinkFox treatment | LinkFox EchoTik adapter | Server-only paid API key sent as the raw `Authorization` header. Never expose it to the web, logs, snapshot payloads, or Agent OS prompts. |

Google Trends shadow collection uses the fixed official KR RSS feed and needs
no credential. Both Google and LinkFox results are stored under
`market_shadow_signals` with `decisionImpact=disabled`; promotion into sourcing
scores requires a separate reviewed code change after at least 30 observation
days.

## Order-Collection Mall Credential Seed

Mall logins are deployment inputs, not global API runtime configuration. The
supported `*_ID`, `*_PW`, and `*_URL` triples are listed in
`apps/server/.env.example`. The confirmation-gated seed encrypts each password
into a `ChannelAccount` owned by one explicit organization. A complete triple
is required for each included mall; missing triples are ignored and existing
accounts for omitted malls are not deleted.

Art09 also accepts `ART09_SUPPLIER_ID`. Existing Art09 accounts preserve their
stored supplier login ID when it is omitted, while an initial Art09 seed must
provide it.

| Variable | Owner | Required when | Notes |
|---|---|---|---|
| `ORDER_COLLECTION_MALL_ORGANIZATION_ID` | Seed operator | Every seed | Exact active organization UUID. Local execution may use root `KIDITEM_DEV_ORGANIZATION_ID`. |
| `ORDER_COLLECTION_MALL_SEED_CONFIRM` | Seed guard | Every seed | Must be exactly `APPLY_ORDER_COLLECTION_MALL_ACCOUNTS`. |
| `ORDER_COLLECTION_MALL_ACCOUNTS_ENV` | Seed operator | Optional Office/local seed | Multiline dotenv payload containing only supported mall credential triples. Keep it outside Git and workflow artifacts. |

The confirmation-gated seed leaves matching accounts unchanged. Run it only
from an approved Office/local operator shell after schema/data work is complete.

## Server AI And Models

These variables are feature-specific. Add them to Office only when the current
API text/detail/thumbnail/image-edit AI features are enabled.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | Gemini text, image, or vision paths are used | Gemini text/media/thumbnail adapters | Missing key returns explicit service errors. |
| `AI_TEXT_MODEL` | Text transform, detail page prefill, direct detail generation, advertising keyword relevance judgement | Text AI/detail page services and advertising keyword relevance judge | No silent fallback. Human-triggered and fixed workflow text generation and bounded text judgement use this value. |
| `AI_IMAGE_MODEL` | Thumbnail/editor image generation, image edit, and detail-page generated images | Thumbnail/image-edit Gemini config and detail-page media adapter | Direct AI provider config. Human-triggered and fixed workflow thumbnail/detail/image-edit media generation use this value. Do not use deprecated preview IDs called out by the config. |
| `AI_IMAGE_ANALYSIS_MODEL` | Thumbnail/image analysis and detail-page image inference | Thumbnail Gemini config and detail-page media adapter | No silent fallback. |
| `AI_IMAGE_ANALYSIS_VERIFY_MODEL` | Thumbnail compliance verify path | Thumbnail Gemini config | No silent fallback. |
| `AI_DIRECT_JOB_WORKER_INTERVAL_MS` | Direct AI worker polling needs a non-default initial interval | AI direct-job worker | Optional; defaults to `1000`. It is the first idle/error retry delay; newly submitted work still wakes the worker immediately. Must be a positive integer. |
| `AI_DIRECT_JOB_WORKER_MAX_INTERVAL_MS` | Empty-queue polling needs a non-default ceiling | AI direct-job worker | Optional; defaults to `10000`. Empty polls exponentially back off from the initial interval to this ceiling. Must be at least the initial interval. |
| `AI_DIRECT_JOB_WORKER_ERROR_MAX_INTERVAL_MS` | Repository-error polling needs a non-default ceiling | AI direct-job worker | Optional; defaults to `30000`. Database/repository failures back off independently from normal idle polling. Must be at least the initial interval. |
| `AI_DIRECT_JOB_HEARTBEAT_MS` | Running-job lease heartbeats need a non-default interval | AI direct-job worker | Optional; defaults to `5000`. Must be shorter than the lease; runtime also caps it at one third of the lease. |
| `AI_DIRECT_JOB_LEASE_MS` | Direct AI claim leases need a non-default duration | AI direct-job worker | Optional; defaults to `60000`. Must be a positive integer. |
| `AI_PROVIDER_TIMEOUT_MS` | A direct AI job needs a non-default total execution budget | AI direct-job worker | Optional; defaults to `1200000` (20 minutes) so multi-image detail-page jobs can finish within their 15-minute generated-image budget. Must be a positive integer. Timeout aborts the whole job and is retryable. Each Gemini SDK call still carries its own 120-second HTTP timeout. |
| `AGENT_OS_1688_CHECKOUT_RUNTIME` | Agent OS should execute live 1688 checkout/payment | Agent OS live readiness preflight; Supply 1688 checkout runtime | Set to `provider` for the current provider-backed runtime. Missing or unsupported values block `supply.submit_purchase_order` live checkout readiness. |
| `AGENT_OS_1688_CHECKOUT_PROVIDER_URL` | `AGENT_OS_1688_CHECKOUT_RUNTIME=provider` | Supply `Alibaba1688CheckoutRuntimeAdapter` | Provider endpoint that accepts `{ organizationId, purchaseOrderId }` and returns `externalOrderId` plus optional `externalOrderUrl`. Required before readiness reports the 1688 checkout runtime as ready. |
| `AGENT_OS_1688_CHECKOUT_TIMEOUT_MS` | Custom 1688 provider checkout timeout is needed | Supply `Alibaba1688CheckoutRuntimeAdapter` | Optional; defaults in code. |

## Server Market Data Providers

These variables are feature-specific and should be present only where sourcing
keyword research is intentionally enabled.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `NAVER_API_HUB_CLIENT_ID` | NAVER Search Trend or Shopping Insight is enabled | Sourcing NAVER API HUB adapters | NAVER Cloud Platform API HUB client id. Server-side only. |
| `NAVER_API_HUB_CLIENT_SECRET` | NAVER Search Trend or Shopping Insight is enabled | Sourcing NAVER API HUB adapters | Client secret paired with the API HUB client id. Never expose to web or agents. |
| `NAVER_API_HUB_BASE_URL` | Non-production API HUB endpoint override is needed | Sourcing NAVER API HUB adapters | Optional. Defaults to `https://naverapihub.apigw.ntruss.com`. |
| `NAVER_SEARCHAD_API_KEY` | Naver SearchAd keyword research is enabled | Sourcing Naver keyword adapter | Access license from Naver SearchAd API manager. Server-side only. |
| `NAVER_SEARCHAD_SECRET_KEY` | Naver SearchAd keyword research is enabled | Sourcing Naver keyword adapter | HMAC signing secret. Never expose to web or agents. |
| `NAVER_SEARCHAD_CUSTOMER_ID` | Naver SearchAd keyword research is enabled | Sourcing Naver keyword adapter | SearchAd advertiser customer id used in `X-Customer`. |
| `NAVER_SEARCHAD_BASE_URL` | Non-production SearchAd endpoint override is needed | Sourcing Naver keyword adapter | Optional. Defaults to `https://api.searchad.naver.com`. |

## Agent OS native Gateway

The home server has one API process that owns durable capability admission and
stateless private MCP HTTP. A native Agent Gateway, not any container, owns
Codex/Claude processes, provider conversations, and provider history. The API,
worker, and web containers never receive provider binaries or a provider login
path. The Gateway service account keeps the existing CLI login outside
KidItem. No provider credential/history, transcript, durable control queue, or
model default is an Office environment contract.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `KIDITEM_APPLICATION_VERSION` | Every API/worker deployment | Deployment identity | Written from the immutable Office manifest. |
| `KIDITEM_GIT_SHA` | Every API/worker deployment | Deployment identity | Full immutable deployment SHA, written from the manifest. |
| `KIDITEM_AGENT_GATEWAY_TOKEN_FILE` | Every API deployment | Gateway installation-token reader | Container path to the mounted Docker secret file; the raw 43-character bearer is never an environment value. The worker does not receive it. |
| `KIDITEM_COPILOTKIT_SQLITE_PATH` | Every production API deployment using CopilotKit interaction history | API-local CopilotKit SQLite event runner | Explicit persistent SQLite file for completed canonical AG-UI event history only. Office fixes it to `/var/lib/kiditem/agent-os/copilotkit-events.sqlite` on the API-only `kiditem_copilotkit-event-history` volume; the worker never mounts or opens it. Tests use `:memory:` and development defaults below `.kiditem/agent-os/`. It is never a live-turn/stop authority or a provider transcript store. |
| `KIDITEM_AGENT_GATEWAY_INSTALLATION_ID` | Multiple distinguishable installations are operated | Gateway control session | Optional bounded operational label; defaults to `gateway-installation` and is not an authority credential. |
| `MCP_SDK_GENERATION` | Every API deployment | MCP readiness canary | Fixed non-secret value `v2`; another or missing value fails Gateway readiness. |
| `MCP_PROTOCOL_NEGOTIATION` | Every API deployment | MCP readiness canary | Fixed non-secret value `auto`; there is no legacy fallback. |

The Windows Agent Gateway installer creates the protected Task Scheduler service
account boundary. It uses Task Scheduler `Password` logon, not S4U: the native
Gateway needs provider HTTPS and the dedicated account's encrypted login store,
which S4U cannot access. Only explicit `InstallOrUpdateGatewayTask` (initial
installation, task definition update, or Windows account password change)
receives that account's password as an in-memory PowerShell `PSCredential`; it
is not an Office environment variable, Docker secret, or KidItem persistence
value. `Deploy`, `CutoverDeploy`, `Rollback`, and `RotateGatewayToken` restart
the existing task without re-registering it. Task Scheduler owns its protected
registration secret. An operator performs provider login under that account
before the Gateway reports readiness. KidItem neither stores, copies, nor
forwards Anthropic/OpenAI credentials. The browser reaches same-origin `/api/copilotkit`;
it has no gateway secret or browser-provided identity.

The native Gateway receives one protected absolute-path JSON config, not a set
of browser or model env values. Its strict fields are `controlOrigin`
(`http://127.0.0.1:4000`), `tokenFile`, `stateRoot`, bundled `runtimeRoot`, fixed
`workspace`, and optional host-account `loginRoot`. Platform is derived as
`macos | windows`; active-turn capacity is the code-owned value `4`. A user
chooses runtime, model, and reasoning effort for each conversation/turn. The
Gateway creates one process-scoped MCP transport token at startup and reuses it
across ordinary turns. The token is not a persistent conversation session or
Agent/capability/delegation grant; business authority comes only from Nest's
current active-turn record.

The browser sees only same-origin `/api/copilotkit`; the Next rewrite points
directly at the ordinary Nest API origin and is not a CopilotKit public key or
Enterprise endpoint.

## Channel Credentials

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `CHANNEL_CREDENTIALS_ENCRYPTION_KEY` | Storing or decrypting channel credentials | Channel credential crypto | Must be 32 bytes as base64, hex, or raw UTF-8. Generate with `openssl rand -base64 32`. |

## Local And Dev Tooling

These variables are for local scripts and data sync. Do not add them to Office
unless the runbook for that operation asks for them.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `KIDITEM_DEV_DATA_DRIVE_DIR` | Google Drive dev data sync | Dev data scripts | Local Google Drive Desktop path. |
| `KIDITEM_DEV_ORGANIZATION_ID` | Dev data sync/import needs target org | Dev data scripts | Local/dev org scope. |
| `KIDITEM_DEV_USER_ID` | Dev data API replay needs an actor | Dev data scripts | Optional explicit user id for replay. Prefer organization-scoped imports where possible. |
| `KIDITEM_API_URL` | Dev data API replay targets a non-default API origin | Dev data scripts | Defaults to `http://localhost:4000`. |
| `KIDITEM_DEV_DATA_CLOUD_STORAGE_ROOT` | Dev data cloud-storage bundle root is used | Dev data scripts | Optional alternative to local Drive path. |
| `DEV_DEFAULT_USER_ID` | Dev data replay compatibility | Dev data scripts | Optional fallback local user id. Prefer explicit organization scope for imports. |

## Browser Automation

The deployed API blocks current Coupang Wing scraping paths when
`NODE_ENV=production`. These variables are mainly local/operator overrides.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `PLAYWRITER_BIN` | Custom Playwriter binary path needed | Playwriter CLI wrapper | Optional override. |
| `PLAYWRITER_BROWSER_PATH` | Managed Chrome path cannot be auto-detected | Coupang inventory scrape adapter | Local/operator use. |
| `PLAYWRITER_BROWSER_PROFILE_DIR` | Custom Chrome profile needed | Coupang inventory scrape adapter | Local/operator use. |
| `PLAYWRITER_DIRECT_PORT` | Custom Chrome CDP port needed | Coupang inventory scrape adapter | Defaults to `9222`. |
| `PUPPETEER_EXECUTABLE_PATH` | Puppeteer render path uses a non-default browser | Render image controller | The Office API image sets `/usr/bin/chromium`; image verification smoke-checks Puppeteer launch. |
| `SOURCING_PLAYWRIGHT_CDP_ENDPOINT` | The Office version-2 1688 keyword domain Operation or generic sourcing URL-scrape runtime needs its managed Chrome session | Sourcing Playwright runtime | Office example: `http://kiditem-office:9444`. Accepts `http`, `https`, `ws`, or `wss` CDP endpoints. Keyword batches are CDP-only: no extension, anonymous-browser, or fresh-profile fallback. Initial same-PC Office HTTP needs no TLS/mTLS/auth proxy. A later HTTPS/WSS endpoint needs container reachability, a trusted certificate, and WebSocket proxying, but no Sourcing code change. Chrome runs manually or from an Office startup task using a persistent Office profile, which may be a full clone of an authenticated operator profile. |
| `SOURCING_PLAYWRIGHT_USER_DATA_DIR` | Sourcing URL scrape needs a prepared browser login session | Sourcing Playwright runtime | Defaults to `.kiditem/playwright/sourcing`. Use a dedicated automation profile, not a personal default Chrome profile. |
| `SOURCING_PLAYWRIGHT_HEADLESS` | Local sourcing scrape login/profile debugging | Sourcing Playwright runtime | Defaults to `true`; set `false` while preparing or debugging the 1688/Alibaba profile. |

## Python Agents Runtime

The Python agent server is not part of the current Office compose file. These
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
| `TMAPI_TOKEN` | Legacy 1688/TMAPI sourcing matcher enabled | Python sourcing matcher | Optional unless the legacy matcher is used. |
| `TMAPI_BASE_URL` | Custom TMAPI endpoint needed | Python sourcing matcher | Defaults in code. |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | LLM tracing enabled | Python config/Langfuse | Both keys required to enable. |
| `LANGFUSE_BASE_URL` | Custom Langfuse endpoint needed | Langfuse SDK | Defaults to Langfuse Cloud in examples. |
| `LANGFUSE_HOST` | Migrating an old local agents env | Python config | Legacy alias mapped to `LANGFUSE_BASE_URL` when set and `LANGFUSE_BASE_URL` is empty. Prefer `LANGFUSE_BASE_URL`; it is intentionally omitted from new `.env.example` files. |
| `LOG_LEVEL` | Custom logging verbosity needed | Python config | Defaults to `INFO`. |

## Office Release Environment

The GitHub `office` Environment is a release-identity and approval boundary for
the Office image bundle. Runtime secrets remain on the Office host and are not
stored in that Environment. The workflow inputs are:

```text
expected_git_sha
dispatch_correlation_id
```

The workflow uses the short-lived `GITHUB_TOKEN` for GHCR publication. Do not
add a long-lived GHCR token unless organization policy blocks
`GITHUB_TOKEN`. If the workflow moves to an isolated self-hosted runner, keep
the protected branch and reviewer boundary and never run untrusted pull-request
code with release credentials.

## Current Office Verification

Print required env presence from inside the API container without values:

```powershell
$keys = @(
  'NODE_ENV', 'PORT', 'DATABASE_URL', 'WEB_ORIGIN', 'CORS_ORIGINS',
  'S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET',
  'S3_PUBLIC_URL', 'S3_REGION', 'PUPPETEER_EXECUTABLE_PATH'
)
docker exec kiditem-api node -e @'
const keys = process.argv.slice(1);
for (const key of keys) {
  const value = process.env[key] ?? '';
  console.log(`${key}=${value ? `SET len=${value.length}` : 'UNSET'}`);
}
'@ $keys
```

Probe optional feature variables only when that Office feature is being enabled.
Use the same presence/length pattern and never print values.

Print the deployed immutable manifest and status:

```powershell
Get-Content C:\ProgramData\Kiditem\deployments\current.json
& C:\workspace\kiditem\deploy\office\apply-deployment.ps1 -Operation Status
```

## Success Criteria

- Required env for the Office runtime is present.
- Office Compose configuration succeeds with the protected env files.
- `apply-deployment.ps1 -Operation Status` reports healthy containers.
- `/login` returns `200`.
- `/api/auth/me` returns `401` or `403` when unauthenticated.

## Blocker Criteria

- Any required secret is missing for a feature being enabled.
- A `NEXT_PUBLIC_*` value was changed without rebuilding the web image.
- The protected `KIDITEM_AGENT_GATEWAY_TOKEN_FILE` or immutable deployment
  identity values are missing from the API runtime.
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
