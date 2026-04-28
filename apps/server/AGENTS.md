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

## Domain Module Pattern

```
src/{domain}/
├── {domain}.module.ts       # @Module — register Controller + Service
├── {domain}.controller.ts   # @Controller — use class-validator DTOs
├── {domain}.service.ts      # @Injectable — business logic + Prisma
├── dto/                     # Request/Response DTOs (class-validator decorators)
│   ├── {operation}.dto.ts
│   └── index.ts
└── services/
    └── types.ts             # Service-internal interfaces (no decorators, not in shared)
```

Adding a new domain: create module + controller + service + dto/ → register in `app.module.ts`.

## Global Infrastructure (main.ts)

- `app.setGlobalPrefix('api')` → `@Controller('products')` = `GET /api/products`
- `ValidationPipe({ whitelist: true, transform: true })` — automatic DTO validation
- `GlobalExceptionFilter` — unified error response `{ statusCode, error, message, timestamp, path }`
- `ErrorCodes` from `@kiditem/shared` — domain-specific error codes
- `PrismaModule` is `@Global()` → `PrismaService` injectable in all services
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
- Self-contained domain modules — no direct imports of other domain Services
- Global infrastructure: PrismaService, AgentRegistryService (both `@Global()`, injectable everywhere)
- New endpoints → class-validator DTO required (no manual if + BadRequestException)
- DTO → Service: 컨트롤러에서 `as any` 캐스트 금지. 서비스 시그니처를 DTO 모양에 맞춰(필요 시 `string | number` union 허용). 서비스 파라미터 타입으로 `Record<string, unknown>` 쓰지 말 것.
- Errors → throw HttpException (no `ok: false` in 200 responses)
- Types → import from `@kiditem/shared`, use `satisfies` pattern in services
- Service-internal types → `services/types.ts` (interface, not class). API DTOs(`dto/`)와 분리. `@kiditem/shared`에 넣지 않음.
- Agent trigger: `AgentRegistryService.runByType()` → HeartbeatService → adapter execution (Claude CLI or Python HTTP)
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
- **Scanner evidence** — `npm run check:idor` is the raw SQL tenancy gate. If it fails because the scanner is broken, repair the scanner before claiming a safety fix.

## Data Access — Service-level Prisma (+ 선택적 Repository 추출)

Prisma 공식 best-practice 에 따라 **기본은 Service 에서 `PrismaService` 를 직접 주입받아 CRUD**. Repository/DAL 레이어를 모든 도메인에 전면 도입하지 않는다 (Prisma 자체가 type-safe repository 역할).

### Repository 추출 트리거 (5+ rule)

동일 모델을 **5개 이상의 service 가 `this.prisma.<model>` 로 touch** 하면 공통 접근 로직을 `{domain}/repositories/{model}.repository.ts` 로 추출할 것을 **고려**한다. 자동 분기 규칙이지 필수는 아님 — 실제로 중복 로직 (companyId scope / 표준 include 프리셋 / soft-delete) 이 반복되는지 먼저 확인.

**검출 명령**:
```bash
# 모든 모델의 service touch 분산도 산출 (상위 10)
for model in $(grep -hE '^model ' prisma/models/*.prisma | awk '{print tolower($2)}'); do
  count=$(grep -rl "this\.prisma\.${model}\." apps/server/src --include="*.service.ts" 2>/dev/null | wc -l | tr -d ' ')
  [ "$count" -ge 5 ] && echo "$count $model"
done | sort -rn
```

**현재 트리거 해당 모델 (2026-04-17 감사)**:
| 모델 | touch service 수 | Repository 후보? |
|---|---|---|
| Product | 23 | 🔴 강한 후보 — companyId scope + include 프리셋 중복 가능성 큼 |
| Ad-related (Ad/AdSnapshot/AdAction) | 10 | 🟡 도메인 내부라 advertising module 안에 repo |
| Order | 7 | 🟡 |
| AgentDefinition | 6 | 🟡 |

나머지는 5 미만 또는 단일 도메인 내 소수 service 만 touch → 직접 Prisma 유지.

### Repository 도입 시 책임 경계

| 레이어 | 책임 |
|---|---|
| **Repository** | `companyId` scope 자동 적용 / 표준 `include`·`select` 프리셋 / soft-delete·audit hook / **비즈니스 로직 금지** |
| **Service** | Pipeline 전이, AI trigger, pricing resolver, cross-domain 집계 (repository 주입받아 사용) |
| **Controller** | DTO validation, route |

Repository 가 `{findBy<Scenario>}` 형태로 유스케이스별 메서드를 늘리는 것은 OK. 하지만 **도메인 로직 (예: `applyAbcGradeDowngrade`) 은 service 에 둔다**.

### Fat service 는 repository 가 아니라 service 분할로

1000+ LOC service (dashboard, ad-strategy 등) 는 repository 가 아니라 **도메인 관점으로 service 쪼개는 것** 이 답 (예: `dashboard-kpi` + `dashboard-ad` + `dashboard-inventory`). 다른 축이다.

## 멀티테넌트 격리 — 회사 스코프 (ADR-0006 연장)

서비스 로직에서 companyId 는 **반드시 `@CurrentCompany()` 데코레이터가 주입한 값** 사용.

### 금지 (Hard bans)

- ❌ **`prisma.company.findFirst({ where: { isActive: true } })` 로 "기본 회사" 집기** — 멀티테넌트에서 타 회사 데이터 섞임. cs.service 와 channel-sync.service 에서 두 번 재발했던 anti-pattern.
- ❌ **`findUnique({ where: { id } })` 로 리소스 GET/PATCH/DELETE** — id 만으로 크로스-테넌트 접근 가능 (IDOR). 항상 `findFirst({ where: { id, companyId } })` 사용.
- ❌ `@Body() / @Query()` 에서 `companyId` 수신 — DTO 에 필드 포함 금지 (ADR-0006).
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

### 전용 CLAUDE.md 가 있는 도메인 (14)

| 경로 | 크기 | 핵심 포인트 |
|---|---|---|
| [`src/advertising/CLAUDE.md`](src/advertising/CLAUDE.md) | ~90줄 | Ad Operations — 14+ endpoints `/api/ads/*`, 3-layer schema (listingId required + optionId nullable), AdAction 5 snapshot-level 규칙 (campaign/keyword target), 익스텐션 sync (vendorItemId > externalId 우선순위). ADR-0006 compliant |
| [`src/agent-registry/CLAUDE.md`](src/agent-registry/CLAUDE.md) | **261줄** | Agent OS — Adapters / EventEmitter2 / Manager Workflow / FeatureGate / ExecutionContext / Agent OS Phase 3+4 (8 patterns) |
| [`src/ai/CLAUDE.md`](src/ai/CLAUDE.md) | 69줄 | Dual-Path — Image=Agent 위임 / Text=Gemini Direct. Preset → hardcoded prompt 매핑 |
| [`src/auth/CLAUDE.md`](src/auth/CLAUDE.md) | 158줄 | 인증/권한 인프라. `@CurrentUser`/`@CurrentCompany`/`@Roles`/`@SkipAuth`, CompanyScopeGuard, DevAuthMiddleware |
| [`src/channels/CLAUDE.md`](src/channels/CLAUDE.md) | ~160줄 | Coupang 통합 — `adapters/coupang/` 외부 API 격리, Sync 3종 (Products/Orders/Inventory), $queryRaw 분석. Products/Orders/Returns 는 channel-agnostic spine 사용, Inventory sync 는 InventoryService 단일 writer 경계 결정 전까지 stub |
| [`src/chat/CLAUDE.md`](src/chat/CLAUDE.md) | 155줄 | CopilotKit Runtime + ClaudeCliAdapter. Express pre-registration (NestJS 우회), SSE 토큰 스트리밍 |
| [`src/dashboard/CLAUDE.md`](src/dashboard/CLAUDE.md) | 73줄 | Massive Parallel (Promise.all 11+ queries) + KST 경계 + MoM snapshot + $queryRaw ad metrics |
| [`src/finance/CLAUDE.md`](src/finance/CLAUDE.md) | 70줄 | P&L + Sales Analysis — $queryRaw cross-table 집계, period parsing, pricing resolver |
| [`src/inventory/CLAUDE.md`](src/inventory/CLAUDE.md) | ~75줄 | Inventory + StockTransaction — 단일 InventoryService (read + metadata + mutation + ledger). **ADR-0014 단독 writer**. BundleStockService restricted export. Transfer = record-only |
| [`src/marketplace/CLAUDE.md`](src/marketplace/CLAUDE.md) | 75줄 | Workflow/Agent 카탈로그 — read-only 카탈로그 + per-company 설치 추적 + param override |
| [`src/orders/CLAUDE.md`](src/orders/CLAUDE.md) | 60줄 | Order/Return/CS 통합 — multi-controller 모듈, 외부 채널 어댑터 위임, status 필터링 |
| [`src/products/CLAUDE.md`](src/products/CLAUDE.md) | 37줄 | 3-layer Master/Option/Bundle (ADR-0013) — `MasterProduct` family (code via `master_code_seq`), `ProductOption` SKU (race-free sku via `optionCounter` increment), `BundleComponent` (cross-master 허용, 3-way invariant, nested 금지 B1), `availableStock` = `BundleStockService.recompute` sole writer + `SELECT FOR UPDATE` row-lock |
| [`src/rules/CLAUDE.md`](src/rules/CLAUDE.md) | 83줄 | Event-Driven — 룰 평가는 agent 비동기 spawn → `@OnEvent` 콜백. CRUD 패턴 아님 |
| [`src/workflows/CLAUDE.md`](src/workflows/CLAUDE.md) | 90줄 | Workflow Engine — executor naming / registration / standard entities / action catalog |

### Panel — Live Ops SSE

`src/panel/` 은 별도 scoped 문서 없이 아래 inline 으로 관리. SSE multiplex 채널. `EventEmitter2` 버스로 도메인(workflow/agent/image/alert) 이벤트 받아 companyId 필터 + strip + ring buffer + monotonic seq → `@Sse()` 로 Observable<MessageEvent> 내보냄. Workflow 도메인 hook이 상태 전이 지점에서 `PANEL_EVENTS.UPSERT` emit ('completed' → 'succeeded' 정규화는 shared `panel/adapters/workflow-run-mapper.ts` 경유). 단일 인스턴스 전제 (prod 멀티 인스턴스 시 pg LISTEN/Redis 도입 필요).

**가시성 모델**: Panel 은 요청 user 의 `User-WorkflowRun` 관계(ownership + 조회 권한)로 필터링된 이벤트만 스트림. 즉 동일 company 내에서도 사용자마다 보이는 WorkflowRun 이 다를 수 있음. `panel.service.ts` 의 snapshot backfill + ring buffer replay 가 이 관계를 경유한다.

### Notable Sub-Domains (LOW signal — 별도 scoped doc 없음)

부모 NestJS 패턴(이 문서)으로 거의 커버되지만, 아래 도메인은 한 가지 특이점이 있다. 별도 문서화 비용이 효익 대비 작아 inline 정리.

- **`src/sourcing/`** — 익스텐션이 product 데이터를 push (POST `/api/sourcing/extension/products`). AgentRegistry 와 cross-coupling: `sourcing.service.ts` 가 `agentRegistry.runByType('sourcing_*')` 호출. 외부 push + 비동기 trigger 패턴.
- **`src/action-task/`** — `task.service.ts` 가 비즈 룰 임계값(low CTR / low profit / 고비용 광고 / 재주문) 으로 task seed 자동 생성. cron 으로 일일 실행. 룰 임계 변경은 hardcode (DB 아님).
- **`src/procurement/`** — Purchase Order **state machine** (`draft → pending → ordered → shipped → received`). 상태 전이 검증 + status groupBy 카운트. `__tests__/procurement.spec.ts` 로 흐름 보호.
- **`src/picking/`** — 확정 주문에서 PickingList 생성 + 아이템 단위 verification (`isPicked`, `isVerified`). 출고 단계와 연결 (orders → picking → shipment).
- **`src/ontology/`** — **DELETED (2026-04-28)**. `master_products` 를 `companyId` 없이 읽던 IDOR 후보였고 UI 소비처도 없어 제품 표면에서 hard-delete 했다. Do not reintroduce without product contract + tenant isolation test.
- **`src/feature-gate/`** — Feature flag 도메인. `allowedCompanies: string[]` array 로 회사별 enable. 멀티-레벨 enable 로직 (global / per-company). agent-registry 의 FeatureGateService 와 별개 (이건 endpoint, 그건 runtime 평가).

각 도메인 작업 시 위 특이점만 의식하면 부모 NestJS 패턴으로 충분.

## Tests

```bash
npx vitest run
```

- Location: `src/**/__tests__/*.spec.ts`
- Behavior verification only — no implementation detail (wiring) tests
