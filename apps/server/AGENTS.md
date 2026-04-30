# apps/server — NestJS Backend

Backend API. Runs in Docker. Port 4000.

## Run

```bash
npm run start:dev       # Local dev (watch mode)
npm run build           # Production build
docker compose up -d    # Run via Docker (from root)
```

Env: `.env` → `DATABASE_URL`, `CHATBOT_DATABASE_URL`, `COUPANG_*`, `GEMINI_API_KEY`

## Scoped Instructions

- Shared server rules live in this `AGENTS.md`.
- Nested domain guidance is still maintained in `src/{domain}/CLAUDE.md`. Read the matching file before editing that domain until nested `AGENTS.md` files are added.

## Backend Architecture Contract

Backend reconstruction follows **Domain-first modular architecture with
Application orchestration and selective Hexagonal Ports**. This is not full
Clean Architecture everywhere. It is a target for reconstructed domains and
runtime-boundary code; small legacy CRUD modules may remain flat until their
owner domain is reconstructed.

Target shape for new or materially rewritten owner domains:

```
src/{owner-domain}/
├── {owner-domain}.module.ts
├── adapter/
│   ├── in/
│   │   ├── http/             # controllers, HTTP DTO binding
│   │   │   └── dto/          # class-validator HTTP DTOs
│   │   ├── workflow/         # workflow runner entrypoints, when used
│   │   ├── cron/             # scheduled entrypoints, when used
│   │   └── agent/            # Agent OS entrypoints, when used
│   └── out/
│       ├── repository/       # DB-backed repository/query adapters
│       └── {provider}/       # external APIs, LLMs, storage, panel/event bus
├── application/
│   ├── port/
│   │   ├── in/               # use-case interfaces, when useful
│   │   └── out/              # DB, cross-domain, provider, runtime ports
│   └── service/              # use-case orchestration, transactions, tenant context
├── domain/
│   ├── model/                # pure domain types/entities/value objects
│   ├── policy/               # rules, thresholds, decisions
│   ├── repository/           # aggregate collection abstraction, only when real
│   └── service/              # pure domain services; no IO
└── mapper/                   # boundary row/DTO/domain mapping
```

Legacy flat modules may still look like this while they are simple CRUD:

```
src/{legacy-domain}/
├── {legacy-domain}.module.ts
├── {legacy-domain}.controller.ts
├── {legacy-domain}.service.ts
└── dto/
```

Adding a new top-level backend folder requires an owner-domain justification:
what data it owns, what mutations it authorizes, which transaction boundary it
controls, and which invariants would be weakened if it lived elsewhere. Do not
create table-shaped or frontend-page-shaped top-level folders by default.

`/api/categories` is a products/catalog compatibility route. The implementation
lives under `src/products/categories/`; it is not a standalone top-level owner
domain. Keep the route shape stable unless a product-catalog migration plan
explicitly retires the compatibility surface.

## Global Infrastructure (main.ts)

- `app.setGlobalPrefix('api')` → `@Controller('products')` = `GET /api/products`
- `ValidationPipe({ whitelist: true, transform: true })` — automatic DTO validation
- `GlobalExceptionFilter` — unified error response `{ statusCode, error, message, timestamp, path }`
- `ErrorCodes` from `@kiditem/shared` — domain-specific error codes
- `PrismaModule` is `@Global()` → `PrismaService` is available for outgoing Prisma adapters and transitional legacy CRUD services
- CORS: allows `localhost:*` pattern

## API Response Conventions

| Pattern | Shape | When |
|---|---|---|
| Paginated list | `{ items: T[], total, page, limit }` | Large datasets |
| Small list (under 100) | `T[]` | Bare array |
| Single resource GET | `T` | Direct object return |
| Create/Update | `T` | Return created/updated object |
| Delete/Command | `{ ok: true }` | — |
| Analytics/Dashboard | Domain-specific | Must define shared type |
| Error (unified) | `{ statusCode, error, message, timestamp, path }` | GlobalExceptionFilter |

**단일 리소스 GET**: 찾지 못하면 `throw new NotFoundException(...)` (404 응답). 서비스가 던지고 컨트롤러는 그대로 통과. 서비스 반환 타입에 null 포함 금지.

## Rules

- No `/v1/` in API paths → `/api/{domain}` direct mapping
- Self-contained owner domains — no casual direct imports of other domain Services. Cross-domain orchestration goes through an application service, explicit port, or existing platform/runtime boundary.
- Global infrastructure: `PrismaModule` is `@Global()`, but reconstructed code injects `PrismaService` only in outgoing Prisma adapters or transitional legacy CRUD services. Agent runtime access belongs behind application ports/adapters, not pure domain code.
- New endpoints → class-validator DTO required (no manual if + BadRequestException)
- DTO → Application: 컨트롤러에서 `as any` 캐스트 금지. Application service 시그니처를 DTO 모양 또는 application command type 에 맞춘다. 서비스 파라미터 타입으로 `Record<string, unknown>` 쓰지 말 것.
- Errors → throw HttpException (no `ok: false` in 200 responses)
- Types → import from `@kiditem/shared`, use `satisfies` pattern in services
- Application-internal command/result types → 해당 `application/service/*` 또는 `application/port/*` 근처에 둔다 (interface/type, not class). API DTOs(`adapter/in/http/dto/`)와 분리. `@kiditem/shared`에 넣지 않음.
- Agent trigger boundary: reconstructed domains inject automation ports such as
  `AGENT_RUNNER_PORT`; the compatibility implementation delegates to
  `AgentRegistryService.runByType()` → HeartbeatService → adapter execution
  (Claude CLI or Python HTTP).
- Agent data access: `AGENT_DATABASE_URL` (read-only PostgreSQL). Agents query DB directly via psql.
- Agent prompts: stored in `agent-config/prompts/`, NOT in DB. DB `prompt_template` field holds file path.
- No data injection in prompts — agents fetch what they need via db-query skill.

## Reconstruction Guardrails

- **No unsafe raw SQL** — production code must not use `$queryRawUnsafe` or `$executeRawUnsafe`. Use Prisma tagged templates with bound values; dynamic identifiers require an allowlist plus `Prisma.sql`.
- **Raw SQL tenant predicate** — `$queryRaw` over tenant-owned tables must bind `company_id = ${companyId}::uuid` or an equivalent tenant predicate in the SQL window.
- **Service companyId signature** — tenant-owned service methods take `companyId: string` explicitly. Controllers supply it from `@CurrentCompany()`, not from body/query DTOs.
- **Mutation scope** — create/update/delete paths must include company scope in the actual DB write path. For single-resource update/delete, read by `{ id, companyId }` before writing or use an equivalent scoped write.
- **No default company lookup** — never recover missing context with `company.findFirst({ isActive: true })`, env defaults, or first-row fallbacks.
- **DTO boundary** — controllers do not use `as any`; service parameters match DTOs or service-internal interfaces. Avoid `Record<string, unknown>` as a DTO substitute.
- **Large service policy** — do not add substantial behavior to 700+ line services. Split by domain capability or write a replacement plan before changing behavior.
- **Scanner evidence** — two complementary tenant-scope gates:
  - `npm run check:idor` — raw SQL tenancy (`$queryRaw` tagged templates must bind `company_id`).
  - `npm run check:tenant-scope` — ORM-level tenant scope (no bare-id `findUnique`, no bare-id `update`/`delete` without a preceding tenant-scoped read in the same function, no controller `@Body`/`@Query`/`@Param('companyId')`, no DTO `companyId` field).
  Both are valid completion evidence for reconstruction PRs that touch tenant-owned services or controllers. `check:tenant-scope` is baseline-reporting until the remaining cleanup lanes make it green; do not add new findings, and record any expected baseline failure in the PR. If a gate fails because the scanner is broken, repair the scanner before claiming a safety fix. Narrow false positives go in `scripts/.tenant-scope-allowlist.txt` with a per-pattern entry and a recorded reason — never broad globs.

## Data Access — Legacy Prisma vs Reconstructed Domains

`Service -> PrismaService` is a legacy/transitional shape for simple CRUD only.
Do not use it as the target architecture for reconstructed domains.

### Reconstructed domain rules

- Application services own use-case orchestration, transaction boundaries,
  tenant context, and calls to out ports.
- Application services in reconstructed domains depend on `application/port/out/*`
  contracts for DB access, cross-domain, provider, Agent OS, workflow, filesystem,
  and panel/event boundaries. Nest modules bind those ports to concrete
  adapters. Do not import concrete `adapter/out/**` implementations or another
  owner domain's service from `application/service/**`.
- Domain code is pure: no NestJS decorators/classes, no Prisma types/client,
  no AgentRegistry/workflow/panel runtime, no filesystem, no HTTP/provider SDKs,
  and no environment lookups.
- Incoming adapters translate HTTP/workflow/cron/agent input into application
  use cases. Controllers do not contain business rules.
- Outgoing adapters implement repository/query, provider, LLM, filesystem,
  event, and panel ports. Prisma belongs in DB-backed outgoing adapters, not in
  application or domain code.
- Mappers sit at boundaries. Keep Prisma rows, HTTP DTOs, and domain objects
  from bleeding into each other.

### Ports are mandatory when a use case touches

- Agent OS/runtime delegation, workflow runners, cron, or agent entrypoints.
- External APIs, LLM/model providers, browser/extension providers, filesystem,
  storage, panel events, or event buses.
- Raw SQL, complex tenant predicates, transactions, row locks, or core aggregate
  mutations.
- A use case exposed by more than one incoming adapter.

Ports are optional/deferred for tiny legacy CRUD and low-risk read-only endpoints
that are not being reconstructed in the current PR.

### Ports, Repository Adapters, and Naming

Ports belong to the application layer because they describe what a use case
offers (`application/port/in/*`) or needs from the outside world
(`application/port/out/*`). Do not create a second adapter-local interface for
the same contract. The adapter implements the application-owned port.

For DB-backed outgoing adapters, use the lane and name chosen by the scoped
plan. Inventory uses `adapter/out/repository/*.repository.adapter.ts` for
Prisma-backed repository/query implementations. Other domains may use a clearer
provider or gateway lane when the dependency is not DB-shaped. Do not make
`DAO`, `Repository`, or `Prisma` a global naming dogma.

Keep names concise and let folders carry the architecture role:

- `application/port/in/inventory.port.ts`
- `application/port/out/inventory.repository.port.ts`
- `application/service/inventory.service.ts`
- `adapter/out/repository/inventory.repository.adapter.ts`
- `adapter/out/products/bundle-stock.adapter.ts`

Use qualifiers such as `prisma`, `memory`, or a provider name only when multiple
implementations of the same port coexist. `persistence` is not the final naming
convention for new or materially rewritten backend code; existing files with
that name are migration waypoints until their owner domain is reconstructed.

### Domain topology target

Top-level backend folders are owner domains/platforms, not tables or pages.
During reconstruction, small table-shaped modules should fold into their owner
domain instead of growing as standalone bounded contexts:

| Target owner | Current folders likely to converge |
|---|---|
| `products` / `catalog` | `products` (includes `products/categories` compatibility capability for former top-level `categories`) |
| `sourcing` / `procurement` | `sourcing` (already folds supplier and purchase-order/procurement capabilities) |
| `inventory` | `inventory`, `warehouses`, `stock-transfers`, `stock-audits`, `picking` |
| `orders` | `orders`, `return-transfers`, CS/review/order-adjacent surfaces |
| `finance` | `finance`, `manual-ledger`, `processing-costs`, `supplier-payments`, `settlements` |
| `advertising` | advertising operations and ad-action execution surfaces |
| `channels` | channel listings, channel sync, external marketplace spine |
| `ai` / `media-ai` | thumbnail/image AI, generation, provider adapters |
| `rules` | business policy definitions, thresholds, rule evaluation result handling; delegates Agent OS work through automation ports |
| `automation` / `agent-os` | `agent-registry`, `workflows`, `action-task`, `marketplace`, `panel`, Agent OS runtime entrypoints/adapters; `rules` is a business policy domain that depends on automation ports — keep/delete/rewrite contract: [`docs/superpowers/plans/2026-04-29-automation-agent-os-hard-delete.md`](../../docs/superpowers/plans/2026-04-29-automation-agent-os-hard-delete.md) |
| `analytics` | `dashboard`, `statistics`, `traffic`, `supplier-stats` |
| `platform` | `auth`, `companies`, `feature-gate`, `common`, `prisma`, uploads/platform infra |

## 멀티테넌트 격리 — 회사 스코프

서비스 로직에서 companyId 는 **반드시 `@CurrentCompany()` 데코레이터가 주입한 값** 사용.

### 금지 (Hard bans)

- ❌ **`prisma.company.findFirst({ where: { isActive: true } })` 로 "기본 회사" 집기** — 멀티테넌트에서 타 회사 데이터 섞임. cs.service 와 channel-sync.service 에서 두 번 재발했던 anti-pattern.
- ❌ **`findUnique({ where: { id } })` 로 리소스 GET/PATCH/DELETE** — id 만으로 크로스-테넌트 접근 가능 (IDOR). 항상 `findFirst({ where: { id, companyId } })` 사용.
- ❌ `@Body() / @Query()` 에서 `companyId` 수신 — DTO 에 필드 포함 금지.
- ❌ Service 내부에서 `companyId` 기본값 폴백 생성 — 항상 매개변수로 받고, 없으면 throw.

### 패턴

```typescript
// ✓ 컨트롤러
@Post('upload')
async upload(
  @UploadedFile() file: MulterFile,
  @CurrentCompany() companyId: string,   // 항상 데코레이터 경유
) {
  return this.service.upload(file, companyId);
}

// ✓ 서비스 — id + companyId 조합으로 접근 권한 검증
async getProduct(id: string, companyId: string) {
  const product = await this.prisma.product.findFirst({
    where: { id, companyId },  // cross-tenant 접근 차단
  });
  if (!product) throw new NotFoundException('Product not found');
  return product;
}
```

## Domain Guides — 서브도메인 작업 전 scoped instruction 먼저 Read

**규칙**: `src/{domain}/` 하위 파일을 Edit 하기 전, 아래 표의 해당 행이 가리키는 scoped document 를 먼저 Read 한다. 현재 전용 도메인 문서는 `CLAUDE.md` 로 유지 중이다. Index 에 없으면 부모 NestJS 패턴(이 문서)으로 충분하다.

### 전용 CLAUDE.md 가 있는 도메인 (16)

| 경로 | 크기 | 핵심 포인트 |
|---|---|---|
| [`src/advertising/CLAUDE.md`](src/advertising/CLAUDE.md) | ~90줄 | Ad Operations — 14+ endpoints `/api/ads/*`, 3-layer schema (listingId required + optionId nullable), AdAction 5 snapshot-level 규칙 (campaign/keyword target), 익스텐션 sync (vendorItemId > externalId 우선순위). Multi-tenant scope rule compliant |
| [`src/agent-registry/CLAUDE.md`](src/agent-registry/CLAUDE.md) | **260줄** | Agent OS compatibility module — controller/facade, heartbeat, safety, delegation, trace, wakeup; AgentRegistry implementation lives in automation application services |
| [`src/ai/CLAUDE.md`](src/ai/CLAUDE.md) | 69줄 | Dual-Path — Image=Agent 위임 / Text=Gemini Direct. Preset → hardcoded prompt 매핑 |
| [`src/analytics/CLAUDE.md`](src/analytics/CLAUDE.md) | ~120줄 | Reporting / read-model owner — folds `dashboard`, `statistics`, `traffic`, `supplier-stats`. Dashboard sub-domain follows full `adapter/in/http` + `adapter/out/repository` + `application/service` shape; the others stay flat until a fat-service driver appears. Routes preserved: `/api/dashboard/*`, `/api/statistics`, `/api/traffic/*`, `/api/supplier-stats`. Only mutation lane = `POST /api/traffic/upload`. |
| [`src/auth/CLAUDE.md`](src/auth/CLAUDE.md) | 158줄 | 인증/권한 인프라. `@CurrentUser`/`@CurrentCompany`/`@Roles`/`@SkipAuth`, CompanyScopeGuard, DevAuthMiddleware |
| [`src/channels/CLAUDE.md`](src/channels/CLAUDE.md) | ~160줄 | Coupang 통합 — `adapters/coupang/` 외부 API 격리, Sync 3종 (Products/Orders/Inventory), $queryRaw 분석. Products/Orders/Returns 는 channel-agnostic spine 사용, Inventory sync 는 InventoryService 단일 writer 경계 결정 전까지 stub |
| [`src/chat/CLAUDE.md`](src/chat/CLAUDE.md) | 155줄 | CopilotKit Runtime + ClaudeCliAdapter. Express pre-registration (NestJS 우회), SSE 토큰 스트리밍 |
| [`src/finance/CLAUDE.md`](src/finance/CLAUDE.md) | 70줄 | P&L + Sales Analysis — $queryRaw cross-table 집계, period parsing, pricing resolver |
| [`src/inventory/CLAUDE.md`](src/inventory/CLAUDE.md) | ~190줄 | Inventory owner domain — `adapter/application/domain/mapper` 분해. capabilities = inventory + unshipped + warehouses + stock-transfers + stock-audits + picking. `InventoryApplicationService` 단독 writer (ADR-0014). `PrismaService` import 는 `adapter/out/prisma/**` 에 한정 (architecture guard spec 동결). domain layer 는 NestJS/Prisma free. Transfer = record-only. capability state machine + bound check 는 `domain/policy/*` |
| [`src/orders/CLAUDE.md`](src/orders/CLAUDE.md) | 60줄 | Order/Return/CS 통합 — multi-controller 모듈, 외부 채널 어댑터 위임, status 필터링 |
| [`src/automation/adapter/out/panel-event/CLAUDE.md`](src/automation/adapter/out/panel-event/CLAUDE.md) | ~80줄 | Live Ops SSE projection adapter — `/api/panel/*` HTTP adapter + EventEmitter2 ring buffer + 4-source read-only projection |
| [`src/automation/adapter/out/agent-runtime/CLAUDE.md`](src/automation/adapter/out/agent-runtime/CLAUDE.md) | ~35줄 | Agent OS runtime adapter — Claude CLI / Python HTTP execution adapters, immutable ExecutionContext, observable adapter fallback |
| [`src/automation/adapter/out/workflow-runner/CLAUDE.md`](src/automation/adapter/out/workflow-runner/CLAUDE.md) | ~155줄 | Workflow runner outgoing adapter + folded HTTP surface guidance — slim-core executor registry, trusted tenant injection, execution flow, output/error contracts, no generic DB/HTTP/LLM executors. Public route owner = `automation/adapter/in/http/workflows.controller.ts` |
| [`src/products/CLAUDE.md`](src/products/CLAUDE.md) | ~60줄 | 3-layer Master/Option/Bundle + categories compatibility capability — `MasterProduct` family (code via `master_code_seq`), `ProductOption` SKU (race-free sku via `optionCounter` increment), `BundleComponent` (cross-master 허용, 3-way invariant, nested 금지 B1), `availableStock` = `BundleStockService.recompute` sole writer + `SELECT FOR UPDATE` row-lock. `src/products/categories/` owns `/api/categories` route compatibility under products/catalog |
| [`src/rules/CLAUDE.md`](src/rules/CLAUDE.md) | 83줄 | Event-Driven — 룰 평가는 automation `AgentRunnerPort` 경유로 Agent OS 에 위임하고 결과 콜백을 처리. CRUD 패턴 아님 |
| [`src/sourcing/CLAUDE.md`](src/sourcing/CLAUDE.md) | ~130줄 | Sourcing owner domain — folds supplier CRUD and purchase-order/procurement state machine while preserving `/api/sourcing/*`, `/api/suppliers/*`, `/api/purchase-orders/*`. Sourcing agent delegation goes through `SOURCING_AGENT_GATEWAY_PORT`. |

### Panel — Live Ops SSE

`src/panel/` top-level surface 는 Phase 3C-4 에서 제거됐다. Panel 은 이제
`src/automation/adapter/in/http/panel.controller.ts` +
`src/automation/adapter/out/panel-event/` +
`src/automation/mapper/panel-event/` 조합으로 관리한다. SSE multiplex 채널.
`EventEmitter2` 버스로 도메인(workflow/agent/image/alert) 이벤트 받아 companyId
필터 + strip + ring buffer + monotonic seq → `@Sse()` 로
Observable<MessageEvent> 내보냄. Automation workflow application services 가 상태 전이 지점에서
`PANEL_EVENTS.UPSERT` emit (`automation/mapper/panel-event/workflow-run.mapper.ts`
경유). 단일 인스턴스 전제 (prod 멀티 인스턴스 시 pg LISTEN/Redis 도입 필요).

**가시성 모델**: Panel 은 요청 user 의 `User-WorkflowRun` 관계(ownership + 조회 권한)로 필터링된 이벤트만 스트림. 즉 동일 company 내에서도 사용자마다 보이는 WorkflowRun 이 다를 수 있음. `automation/adapter/out/panel-event/panel.service.ts` 의 snapshot backfill + ring buffer replay 가 이 관계를 경유한다.

### Notable Sub-Domains (LOW signal — 별도 scoped doc 없음)

부모 NestJS 패턴(이 문서)으로 거의 커버되지만, 아래 도메인은 한 가지 특이점이 있다. 별도 문서화 비용이 효익 대비 작아 inline 정리.

- **Action board (`src/automation/.../action-*`)** — Phase 3C-7 에서
  top-level `src/action-task/` 는 제거됐다. `/api/action-tasks/*` HTTP
  surface 는 `automation/adapter/in/http/action-task.controller.ts`, use-case
  orchestration 은 `automation/application/service/action-board.service.ts`,
  seed 임계값은 pure `automation/domain/policy/action-seeds.ts` 가 소유한다.
  룰 임계 변경은 여전히 hardcode 정책 변경이며 DB 설정이 아니다.
- **`src/feature-gate/`** — Feature flag 도메인. `allowedCompanies: string[]` array 로 회사별 enable. 멀티-레벨 enable 로직 (global / per-company). agent-registry 의 FeatureGateService 와 별개 (이건 endpoint, 그건 runtime 평가).

각 도메인 작업 시 위 특이점만 의식하면 부모 NestJS 패턴으로 충분.

## Tests

```bash
npx vitest run
```

- Location: `src/**/__tests__/*.spec.ts`
- Behavior verification only — no implementation detail (wiring) tests
