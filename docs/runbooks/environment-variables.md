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
- Root `.env` should stay narrow: Prisma CLI, shared dev-data paths, and the Agent OS seed model used by
  `npm run seed:agent-os`.
- Product-bound detail page, thumbnail, and image-edit generation are direct AI
  jobs, not Agent OS runs. For local preview, keep `AI_TEXT_MODEL`,
  `AI_IMAGE_MODEL`, and `AI_IMAGE_ANALYSIS_MODEL` set in `apps/server/.env`.
- Local env must not be copied to Office as-is.

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
AGENT_RUNTIME_WORKER_ENABLED
AGENT_DEFAULT_MODEL
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
| `INTERACTION_GATEWAY_URL` | Next server/build | Production interaction UI | Next same-origin rewrite | Server-only gateway base for `/api/copilotkit/:path*`. Production server startup fails closed when absent; local development alone defaults to `http://localhost:4100`. Never prefix this variable with `NEXT_PUBLIC_`. |

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
| `AGENT_OS_OPERATOR_RUNTIME` | Agent OS Operator should use the optional hosted provider runtime | Nest Agent OS Operator runtime handler | Set `openai_responses` for the optional hosted Operator runtime. Missing value keeps the deterministic path. Any other value fails closed with `operator_runtime_unsupported`. |
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
| `NAVER_API_HUB_CLIENT_ID` | NAVER Search Trend or Shopping Insight is enabled | Sourcing NAVER API HUB adapters | NAVER Cloud Platform API HUB client id. Server-side only. |
| `NAVER_API_HUB_CLIENT_SECRET` | NAVER Search Trend or Shopping Insight is enabled | Sourcing NAVER API HUB adapters | Client secret paired with the API HUB client id. Never expose to web or agents. |
| `NAVER_API_HUB_BASE_URL` | Non-production API HUB endpoint override is needed | Sourcing NAVER API HUB adapters | Optional. Defaults to `https://naverapihub.apigw.ntruss.com`. |
| `NAVER_SEARCHAD_API_KEY` | Naver SearchAd keyword research is enabled | Sourcing Naver keyword adapter | Access license from Naver SearchAd API manager. Server-side only. |
| `NAVER_SEARCHAD_SECRET_KEY` | Naver SearchAd keyword research is enabled | Sourcing Naver keyword adapter | HMAC signing secret. Never expose to web or agents. |
| `NAVER_SEARCHAD_CUSTOMER_ID` | Naver SearchAd keyword research is enabled | Sourcing Naver keyword adapter | SearchAd advertiser customer id used in `X-Customer`. |
| `NAVER_SEARCHAD_BASE_URL` | Non-production SearchAd endpoint override is needed | Sourcing Naver keyword adapter | Optional. Defaults to `https://api.searchad.naver.com`. |

## Agent OS And Claude CLI

These variables are feature-specific. They should not be present in Office
unless Agent OS execution or Claude CLI chat is intentionally enabled and
covered by an operator runbook.

| Variable | Required when | Consumed by | Notes |
|---|---|---|---|
| `AGENT_RUNTIME_WORKER_ENABLED` | Background Agent OS execution should run | Agent run worker | Default is disabled. Use `1` or `true` only after handlers and model env are ready. |
| `AGENT_RUNTIME_WORKER_INTERVAL_MS` | Worker enabled and custom tick interval needed | Agent run worker | Defaults to `2000`. |
| `AGENT_DEFAULT_MODEL` | Any Agent OS definition should share one default model | Agent definition registry and Agent OS seed | Used only when a per-agent model env is empty. Local `npm run seed:agent-os` reads this from root `.env`; API runtime reads it from `apps/server/.env`. |
| `AGENT_MANAGER_MODEL` | Manager agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_RULES_EVALUATION_MODEL` | Rules evaluation agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_RULES_SUGGEST_MODEL` | Rules suggestion agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_AD_STRATEGY_MODEL` | Ad strategy agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_SOURCING_ADAPTER_TYPE` | Sourcing dashboard assistant enabled | Agent OS seed | Optional server-only override: `codex_cli` or `claude_cli`. The code-owned default is `codex_cli`; an unknown value fails seed instead of falling back. The browser cannot select it. |
| `AGENT_SOURCING_MODEL` | Sourcing agent enabled | Agent definition registry | Explicit local CLI model. This computer's Codex QA uses `gpt-5.6-terra`. |
| `AGENT_RUNTIME_EXECUTION_TIMEOUT_MS` | Local Agent OS CLI runtime enabled | Agent OS local CLI runtime | Defaults to `45000`. Timeout terminates the process and records a failed run; it is never resumed after restart. |
| `AGENT_RUNTIME_CONCURRENCY` | Local Agent OS CLI runtime enabled | Agent OS local process registry | Defaults to `2`. Bounds Claude/Codex child processes per Nest process. |
| `AGENT_RUNTIME_CAPACITY_WAIT_MS` | Local Agent OS CLI runtime enabled | Agent OS local process registry | Defaults to `5000`. Capacity expiry fails the request without spawning another process. |
| `AGENT_RUNTIME_CLAUDE_MAX_BUDGET_USD` | `claude_cli` is explicitly selected | Agent OS local CLI runtime | Defaults to `0.25` per invocation. It does not apply to Codex. |
| `AGENT_RUNTIME_CREDENTIAL_HMAC_KEY` | A durable Hermes or isolated CLI runtime host is enabled | Durable runtime credential broker | Required server/worker-only HMAC secret, at least 32 bytes. It signs one execution-and-attempt-bound credential; never expose it to browser, gateway, prompts, runtime logs, or `OperationRun.result`. |
| `AGENT_RUNTIME_CREDENTIAL_TTL_MS` | Durable runtime credential broker needs a non-default lifetime | Durable runtime credential broker | Optional integer from `1000` through `900000`; defaults to `300000` (5 minutes). A reconnect receives a new credential for the same execution/attempt scope. |
| `AGENT_RUNTIME_HANDLE_ENCRYPTION_KEY` | A durable Hermes or isolated CLI runtime host is enabled | Durable runtime handle cipher | Required server/worker-only 32-byte base64, hex, or raw UTF-8 key. It encrypts reconnect/native-process references only; rotation makes persisted handles unrecoverable and must be coordinated with terminal reconciliation. |
| `HERMES_RUNTIME_BASE_URL` | `hermes_http` or matrix-compatible `hermes_acp` is registered | Hermes durable runtime transport | Required explicit control-plane URL. Use HTTPS in Office; the adapter posts only execution-scoped prompt/context and run-scoped MCP config, never organization or policy-snapshot IDs. |
| `AGENT_DURABLE_RUNTIME_RUN_ROOT` | Isolated Codex/Claude durable worker is enabled | Isolated CLI runtime supervisor | Optional host/worker-owned base directory; defaults to `/var/lib/kiditem-agent-runs`. Each execution/attempt receives distinct `home`, `work`, and `state` directories and owner-only files. Do not mount it in API, gateway, or web containers. |
| `AD_KEYWORD_RELEVANCE_MODEL` | 광고 키워드 연관성 판정 사용 | `advertising` keyword relevance judge adapter | Text model id. No fallback — unset throws, because a silently different model still returns confident verdicts that propose pausing live ads. |
| `AGENT_THUMBNAIL_ANALYST_MODEL` | Thumbnail analyst agent enabled | Agent definition registry | Per-agent override. |
| `AGENT_CHAT_MODEL` | Chatbot agent enabled | Agent definition registry | Required unless `AGENT_DEFAULT_MODEL` is set. |
| `INTERACTION_GATEWAY_SHARED_SECRET` | Every production API boot | Agent OS interaction gateway guard | Required server-only shared credential (minimum 32 bytes) for gateway control and health routes. It has no default. Rotate it in a coordinated gateway/server rollout; in-flight requests using the old value fail closed. |
| `INTERACTION_PRINCIPAL_HMAC_KEY` | Every production API boot | Agent OS interaction identity service | Required server-only HMAC key (minimum 32 bytes) for opaque browser principal keys. It has no default. Rotation changes principal identities and requires an explicit identity/history migration plan. |
| `INTERACTION_RUN_INTENT_HMAC_KEY` | Every production API boot | Agent OS interaction authorization service | Required server-only HMAC key (minimum 32 bytes) for 30-second run intents. It has no default. Rotation immediately invalidates outstanding intents; allow the window to drain or expect clients to prepare again. |
| `INTERACTION_REPLAY_CURSOR_HMAC_KEY` | Every production API boot | Agent OS replay and live-join authorization | Required server-only HMAC key (minimum 32 bytes) for opaque replay cursors and short-lived live-join tokens. It has no default. Rotate only with a coordinated reconnect rollout; old cursors and join tokens fail closed. |
| `INTERACTION_ANALYTICS_HMAC_KEY` | Every production API boot | Agent OS product analytics adapter | Required server-only HMAC key (minimum 32 bytes) for hashing organization identity before metadata-only interaction analytics leaves the application boundary. It has no default. Rotate with an explicit analytics continuity decision; raw organization/user IDs, prompts, results, resources, tokens, and cookies must never enter this event. |
| `ANTHROPIC_API_KEY` | Claude CLI uses Anthropic API key auth | Claude CLI env allowlist | Passed only to the Claude child process. |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude CLI uses OAuth token auth | Claude CLI env allowlist | Passed only to the Claude child process. |

The Nest service account owns the persistent local Claude/Codex login used by
Agent OS. Existing CLI login files are discovered through that account's
isolated child environment. Optional API-key variables remain restricted server
secrets; they are never copied to the browser or KidItem MCP child process.
The five `INTERACTION_*` secrets have deliberately separate purposes and must
use independent random values. Never expose them through `NEXT_PUBLIC_*`, send
them to the browser or gateway request bodies, include them in Agent OS prompts,
or print their values in logs, deployment output, tests, issues, or pull
requests.

The browser sees only same-origin `/api/copilotkit`. `INTERACTION_GATEWAY_URL`
is a server-side Next rewrite destination and must point at the deployed OSS
gateway; it is not a CopilotKit public key or Enterprise endpoint.

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
| `AGENT_SEED_ORG_IDS` | Seeding Agent OS for only specific organizations | `scripts/seed-agent-os.ts` | Empty means seed every active local organization. |

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
- `AGENT_RUNTIME_WORKER_ENABLED=1` is set without model env and runtime handlers
  ready for the enabled agent types.
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
