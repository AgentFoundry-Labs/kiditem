# prisma — Shared Schema

DB schema source of truth for the entire system. Prisma v7 (multi-file).

## 파일 구조 (v7 best-practice)

```
prisma/
├── schema.prisma       # generator + datasource 만
├── migrations/         # 마이그레이션 이력
└── models/             # 도메인별 모델 (9 파일, alphabetical)
    ├── advertising.prisma      (Ad, AdAction, AdSnapshot, ItemWinner, ScrapeTarget, TrafficStats, Execution*)
    ├── agents.prisma           (AgentDefinition, AgentTask, AgentEvent, AgentLog, AgentWakeupRequest, HeartbeatRun, WorkflowRun, WorkflowTemplate)
    ├── ai.prisma               (Thumbnail*, ContentGeneration)
    ├── core.prisma             (Company, User, Product, Master*, Option*, ProductItem, ProductMemo, CategoryMapping)
    ├── finance.prisma          (ProfitLoss, GradeHistory, ManualLedger, ProcessingCost, SalesPlan)
    ├── inventory.prisma        (Inventory, Stock*, Bundle*, Warehouse, Picking*, ReturnTransfer)
    ├── orders.prisma           (Order, CoupangOrder*, CoupangReturn, Shipment, UnshippedItem, Settlement, CSRecord, Review)
    ├── supply.prisma           (Supplier*, PurchaseOrder*)
    └── system.prisma           (Marketplace, BusinessRule, ActionTask, FeatureGate, ActivityEvent, Alert, SystemSetting)
```

각 모델 위 `/// @namespace <도메인>` + `/// @describe <한줄>` 주석으로 도메인 경계 + 의미를 schema 자체에 inline. `prisma generate` 가 9 파일을 자동 merge (single schema 와 동일 동작). 새 모델 추가 시 도메인에 맞는 파일에 넣고 namespace 주석 붙이기.

**Prisma v7 config 위치**: `prisma.config.ts` (root) 의 `schema: 'prisma'` — 디렉토리 지정이 공식 best-practice.

## Commands

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Dev — apply directly to DB
npm run db:migrate    # Production — create migration files
npm run db:studio     # DB browser (localhost:5555)
```

`DATABASE_URL` env required: `postgresql://kiditem:kiditem@localhost:5433/kiditem`

## DB 동기화 — schema vs. data (중요)

`git pull` 은 **코드만** 받는다. DB 는 로컬 볼륨에 남아있으므로 pull 후 스키마/데이터 동기화는 각자 수동으로 해야 한다.

### 3-tier 모델

| 계층 | 전달 수단 | 특성 |
|---|---|---|
| **스키마 (DDL)** | `schema.prisma` + `db:push` | 매 pull 후 실행. 안전 |
| **초기 시드 데이터 (스냅샷)** | `prisma/init.sql.gz` (`--data-only` pg_dump) | **fresh volume 에서만** 로드 |
| **운영 중 데이터 이전** | 명시적 SQL/seed 스크립트 (예: `scripts/migrate-dashboard-data.ts`) | 기존 DB 에 incremental 적용 |

### init.sql.gz 의 정확한 의미

- Postgres 도커 이미지의 `docker-entrypoint-initdb.d/` 패턴. **빈 볼륨 초기화 시에만** 자동 로드.
- 기존 볼륨이 있으면 **스킵** → `git pull` 로 새 `init.sql.gz` 받아도 아무 일도 안 일어남.
- 적용하려면 `docker compose down -v` 로 볼륨 삭제 후 재기동. **기존 로컬 데이터 손실 주의**.
- 즉 "팀원 간 실시간 데이터 동기화" 수단이 **아님** — "새 환경 셋업용 스냅샷"이다.

### 스키마 변경 PR 받는 사람 플로우

```bash
git pull
npm install --legacy-peer-deps
npm run db:push -- --accept-data-loss   # drop 이 포함됐으면 플래그 필요
npx prisma generate
```

`--accept-data-loss` 는 **삭제(drop)** 가 있을 때만 필수. PR 설명에 drop 포함 여부 명시한다.

### init.sql.gz 재생성 시점

다음 중 하나 발생하면 재생성:
1. 스키마 변경으로 기존 `init.sql.gz` 의 INSERT 가 fresh setup 에서 깨짐 (예: drop 된 테이블에 대한 INSERT)
2. 신규 팀원 온보딩을 위한 기본 데모 데이터 갱신 필요
3. PR 템플릿의 `init.sql.gz 갱신` 체크 항목에 해당

```bash
docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts \
  --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
```

`--data-only` 이므로 스키마는 제외되고 INSERT 만 포함. 스키마는 항상 `prisma db push` 가 책임진다.

### 팀원 간 incremental 데이터 공유

기존 로컬 데이터를 **유지하면서** 새 데이터(예: 신규 상품, 테스트 캠페인)를 추가해야 하면 `init.sql.gz` 쓰지 말 것. 대신:

- `prisma/backfill-*.sql` — idempotent SQL 스크립트 (ON CONFLICT, IF NOT EXISTS 활용)
- `scripts/seed-*.ts` — TypeScript seed
- PR 에 "post-pull 수동 실행" 명령 명시

## Prisma v7 Config

`prisma.config.ts` (root) sets datasource URL. No `url` in `schema.prisma` (v7 pattern).

## Rules

- No native PG enums → `String` fields + app-level validation
- PascalCase model names → `@@map("snake_case")` for table names
- camelCase field names → `@map("snake_case")` for column names
- UUID PK: `@default(uuid()) @db.Uuid`
- Timestamps: `@db.Timestamptz`
- Currency: `Int` (KRW) or `Decimal(12,2)` (CNY)
- Python accesses snake_case DB column names directly (asyncpg raw SQL)
- After schema changes: always run `npm run db:push` + `npx prisma generate`
- Keep Zod schemas in sync: use `satisfies z.infer<typeof Schema>` pattern in services
- Json 흡수 패턴: 부모의 `items Json @default("[]")` 사용 (CoupangReturn, BundleProduct, WorkflowRun). 서비스에서 `as unknown as T[]` 캐스트.
- **FK 컬럼에 `@@index` 명시 필수** — Prisma 는 FK 에 자동 인덱스를 만들지 **않는다**. JOIN/역방향 조회가 있는 FK (대부분) 는 명시적 `@@index([foreignKey])` 추가. 복합이 자주 쓰이면 `@@index([companyId, foreignKey])` 등 조합 인덱스도 함께.
- **Optional FK (`Foo?`) 에도 `onDelete` 명시** — default 동작에 의존하지 말 것. 부모 삭제 시 동작(`SetNull` / `Restrict` / `Cascade`)을 의도에 맞게 기입해 리뷰어가 정책을 바로 읽을 수 있게.

## 통합 모델 규칙

- `AgentDefinition.rt_*` 필드: 런타임 상태 (sessionId, lastRunStatus, 토큰 사용량 등). 별도 테이블 없음.
- `AgentEvent`: eventType(`permission_denied`|`action_snapshot`)으로 구분. snapshot 필드는 해당 타입만 사용.
- `AdSnapshot`: level(`campaign`|`product`|null)로 구분. null은 raw 스냅샷.
- `Marketplace`: type(`agent`|`workflow`)으로 구분.

## Phase 3+4 스키마 필드 (2026-04-13)

AgentDefinition 추가 필드:
- `maxOutputTokens Int @default(16000)` — #21 Token Escalation. 출력 잘림 시 자동 확장.
- `fallbackChain String[] @default(["claude_local"])` — #6 Model Fallback. 어댑터 실패 시 체인 실행.
- `resultRetentionDays Int @default(30)` — #10 Selective Clearing. 오래된 결과 요약 기한.
- `contextStrategy String @default("single-shot")` — #3 Message Compression. 미래 멀티턴 전환용.

HeartbeatRun 추가 필드:
- `nextSchedule String?` — #30 Dynamic Cron. 에이전트가 설정한 다음 스케줄.
- `isSummarized Boolean @default(false)` — #10 요약 완료 여부.
- `summary String? @db.Text` — #10 규칙 기반 실행 요약.

## User Types

`User.type` 필드로 사람과 AI를 통합 관리:
- `human` — 사람 직원
- `agent` — AI 에이전트 (`agentDefinitionId` 연결)
- `system` — 챗봇 (`company_id = null`, 전체 공유)

## RLS (Row Level Security)

`chatbot_readonly` DB 유저에 `company_id` 기반 행 필터 적용 (11개 테이블).
- NestJS 서버 (`kiditem` 유저): 테이블 오너 → RLS 미적용 (코드에서 필터)
- 챗봇/에이전트 (`chatbot_readonly`): RLS 적용 → 세션변수 `app.company_id`로 자동 필터
