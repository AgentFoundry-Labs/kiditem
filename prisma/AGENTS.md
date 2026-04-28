# prisma — Shared Schema

DB schema source of truth for the entire system. Prisma v7 (multi-file).

## 파일 구조 (v7 best-practice)

```
prisma/
├── schema.prisma       # generator + datasource 만
├── migrations/         # 마이그레이션 이력
└── models/             # 도메인별 모델 (10 파일, alphabetical)
    ├── advertising.prisma      (AdAction, ScrapeTarget, ExecutionTask, ExecutionLog, ExecutionWorker)
    ├── agents.prisma           (AgentDefinition, AgentTask, AgentEvent, AgentLog, AgentWakeupRequest, HeartbeatRun, WorkflowRun, WorkflowTemplate)
    ├── ai.prisma               (Thumbnail*, ContentGeneration)
    ├── channels.prisma         (ChannelScrapeRun, ChannelScrapeSnapshot, ChannelListingDailySnapshot, ChannelListingOptionDailySnapshot, ChannelAdTargetDailySnapshot, ChannelAccountDailyKpiSnapshot — daily facts are source-of-truth for listing/option/day market data)
    ├── core.prisma             (Company, User, MasterProduct, ProductOption, ChannelListing, ChannelListingOption, BundleComponent, CategoryMapping)
    ├── finance.prisma          (ProfitLoss, GradeHistory, ManualLedger, ProcessingCost, SalesPlan)
    ├── inventory.prisma        (Inventory, Stock*, Warehouse, Picking*, ReturnTransfer)
    │                            ↳ StockTransaction 은 InventoryService 의 내부 ledger.
    │                              외부 모듈의 직접 read/write 금지 (ADR-0014).
    ├── orders.prisma           (Order + OrderLineItem + OrderReturn + OrderReturnLineItem (ADR-0015 channel-agnostic), Shipment, UnshippedItem, Settlement, CSRecord, Review)
    ├── supply.prisma           (Supplier*, PurchaseOrder*)
    └── system.prisma           (Marketplace, BusinessRule, ActionTask, FeatureGate, ActivityEvent, Alert, SystemSetting, ProductMemo, MigrationCheckpoint)
```

각 모델 위 `/// @namespace <도메인>` + `/// @describe <한줄>` 주석으로 도메인 경계 + 의미를 schema 자체에 inline. `prisma generate` 가 10 파일을 자동 merge (single schema 와 동일 동작). 새 모델 추가 시 도메인에 맞는 파일에 넣고 namespace 주석 붙이기.

**Prisma v7 config 위치**: `prisma.config.ts` (root) 의 `schema: 'prisma'` — 디렉토리 지정이 공식 best-practice.

## Commands

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Dev — apply directly to DB
npm run db:3layer-setup # Reapply partial indexes / RLS / CHECK constraints after db:push
npm run db:erd        # Regenerate docs/ERD.md after Prisma model changes
npm run graphify:schema # Regenerate ERD + graphify-out schema navigation artifacts
npm run db:migrate    # Production — create migration files
npm run db:studio     # DB browser (localhost:5555)
```

`DATABASE_URL` env required: `postgresql://kiditem:kiditem@localhost:5433/kiditem`

## DB 동기화 — schema vs. data (중요)

`git pull` 은 **코드만** 받는다. DB 는 로컬 볼륨에 남아있으므로 pull 후 스키마/데이터 동기화는 각자 수동으로 해야 한다.

### 표준 동기화 모델

| 계층 | 전달 수단 | 특성 |
|---|---|---|
| **스키마 (DDL)** | `schema.prisma` + `db:push` | 매 pull 후 실행. 안전 |
| **공유 개발 데이터** | Google Drive dev data bundle + replay (`npm run data:coupang:*`) | 팀원이 같은 화면 상태를 재현하는 표준 경로 |
| **운영 중 데이터 이전** | 명시적 SQL/seed 스크립트 (`prisma/backfill-*.sql`, 필요한 `scripts/*`) | 스키마 변경/마이그레이션 보조. 화면 데이터 공유 용도 아님 |
| **초기 스냅샷 예외** | `prisma/init.sql.gz` (`--data-only` pg_dump) | Fresh volume 전용 예외. 기본 개발 데이터 경로 아님 |

### Google Drive dev data bundle

팀원 간 같은 로컬 화면 데이터를 맞출 때는 `init.sql.gz` 나 synthetic seed 를 쓰지 않는다. Google Drive 의 `kiditem-coupang-{lane}-{datasetId}.zip` bundle 을 `.data/coupang/<datasetId>/` 로 pull 한 뒤 replay 한다.

```bash
export KIDITEM_DEV_DATA_DRIVE_DIR="$HOME/.../KidItem Dev Data"
export DEV_DEFAULT_USER_ID="<local dev user uuid>"
npm run data:coupang:pull -- --lane real
npm run data:coupang:replay -- --mode scoped-replace --yes
```

규칙:

- Bundle 원본은 Google Drive 의 `coupang-{lane}/bundles/` zip archive, 로컬 사본은 `.data/` 아래에 둔다. 둘 다 Git 커밋 금지.
- Drive 의 `latest.json` 이 현재 기준 dataset 과 archive checksum 을 가리킨다. 같은 날 다시 만들면 기존 zip 을 덮어쓰지 말고 `datasetId` 의 `vN` 을 올린다.
- 표준 replay 모드는 `scoped-replace` 다. manifest 의 company/channel/date range scope 만 교체한다.
- Coupang bundle 은 `POST /api/ads/extension/sync` 경로로 replay 한다. 앱이 실제 ingest 하는 코드와 다른 DB writer 를 만들지 않는다.
- `scripts/seed-channel-market-data.ts` 같은 synthetic market-data seed 는 금지. 실제 scrape payload replay 로 대체한다.
- 자세한 포맷/운영 절차는 [`docs/DEV_DATA_BUNDLES.md`](../docs/DEV_DATA_BUNDLES.md) 를 따른다.

### init.sql.gz 의 정확한 의미

- Postgres 도커 이미지의 `docker-entrypoint-initdb.d/` 패턴. **빈 볼륨 초기화 시에만** 자동 로드.
- 기존 볼륨이 있으면 **스킵** → `git pull` 로 새 `init.sql.gz` 받아도 아무 일도 안 일어남.
- 팀원 간 개발 데이터 공유 수단이 아니다. 공유 데이터는 Google Drive bundle replay 가 책임진다.
- 적용하려면 `docker compose down -v` 로 볼륨 삭제 후 재기동. **기존 로컬 데이터 손실 주의**.

### 스키마 변경 PR 받는 사람 플로우

```bash
git pull
npm install --legacy-peer-deps
npm run db:push -- --accept-data-loss   # drop 이 포함됐으면 플래그 필요
npx prisma generate
npm run db:3layer-setup                 # partial unique indexes + company-id RLS policies + 3 CHECK constraints 재적용
npm run db:erd                          # docs/ERD.md 재생성
npm run graphify:schema                 # graphify-out/schema/** + schema-consumers/** 재생성
```

`--accept-data-loss` 는 **삭제(drop)** 가 있을 때만 필수. PR 설명에 drop 포함 여부 명시한다.

`db:3layer-setup` 은 `prisma/3layer-setup.sql` 을 재실행한다. `prisma db push` 는 schema.prisma 에 표현되지 않는 partial unique index / RLS policy / CHECK constraint 를 **덮어쓰거나 누락** 시키므로, push 후에는 **반드시** 재실행해야 3계층 모델(master/option/bundle) 의 제약이 유지된다. 스크립트는 idempotent (`DROP ... IF EXISTS` → `CREATE`) 라 반복 실행 안전.

### init.sql.gz 재생성 시점

기본적으로 재생성하지 않는다. 다음 예외에만 사용한다:
1. Fresh Docker volume bootstrap snapshot 이 명시적으로 필요한 경우
2. 스키마 변경으로 기존 `init.sql.gz` 의 INSERT 가 fresh setup 에서 깨지는 경우
3. PR 템플릿에서 `init.sql.gz 변경 있음` 을 의도적으로 체크한 경우

```bash
docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts \
  --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
```

`--data-only` 이므로 스키마는 제외되고 INSERT 만 포함. 스키마는 항상 `prisma db push` 가 책임진다.

### 팀원 간 incremental 데이터 공유

기존 로컬 데이터를 **유지하면서** 새 공유 화면 데이터(예: 쿠팡 스크래퍼 결과)를 추가해야 하면 Google Drive bundle 의 `upsert` replay 를 사용한다. 스키마/운영 데이터 이전이 필요한 경우에만:

- `prisma/backfill-*.sql` — idempotent SQL 스크립트 (ON CONFLICT, IF NOT EXISTS 활용)
- `scripts/*` — 명시적 마이그레이션/운영 보조 스크립트
- PR 에 post-pull 수동 실행 명령과 되돌림/재실행 안전성을 명시

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
- After schema changes: always run the schema-change checklist above (`db:push` + `prisma generate` + `db:3layer-setup` + generated ERD/Graphify artifacts)
- Keep Zod schemas in sync: use `satisfies z.infer<typeof Schema>` pattern in services
- Json 흡수 패턴: 부모의 `items Json @default("[]")` 사용 (CoupangReturn 등 — 자식이 별도 테이블을 가질 이유가 없을 때). 서비스에서 `as unknown as T[]` 캐스트.
- **FK 컬럼에 `@@index` 명시 필수** — Prisma 는 FK 에 자동 인덱스를 만들지 **않는다**. JOIN/역방향 조회가 있는 FK (대부분) 는 명시적 `@@index([foreignKey])` 추가. 복합이 자주 쓰이면 `@@index([companyId, foreignKey])` 등 조합 인덱스도 함께.
- **Optional FK (`Foo?`) 에도 `onDelete` 명시** — default 동작에 의존하지 말 것. 부모 삭제 시 동작(`SetNull` / `Restrict` / `Cascade`)을 의도에 맞게 기입해 리뷰어가 정책을 바로 읽을 수 있게.

## 통합 모델 규칙

- `AgentDefinition.rt_*` 필드: 런타임 상태 (sessionId, lastRunStatus, 토큰 사용량 등). 별도 테이블 없음.
- `AgentEvent`: eventType(`permission_denied`|`action_snapshot`)으로 구분. snapshot 필드는 해당 타입만 사용.
- `Marketplace`: type(`agent`|`workflow`)으로 구분.

## Partial unique index 패턴 (Plan A/B1 — ADR-0013)

`prisma/models/` 의 `@@unique([...])` 은 Prisma accessor 생성용으로 유지하되, 실제 DB constraint 는 [`prisma/3layer-setup.sql`](3layer-setup.sql) 의 **partial unique index** (`WHERE is_deleted = false`) 가 enforce. 이 조합이 보장하는 것:

- 소프트삭제된 row 의 unique 값을 새 row 가 재사용 가능 (운영상 `legacyCode`/`barcode` 재할당 필요).
- Restore 시 활성 row 와 충돌 → P2002 → `ConflictException`.

적용된 column 4개 (Plan A Task 11 + Plan B1):
- `master_products(company_id, legacy_code)` → `master_products_company_legacy_active`
- `product_options(master_id, option_name)` → `product_options_master_option_name_active` + `product_options_master_null_option` (`option_name IS NULL` 케이스)
- `product_options(company_id, barcode)` → `product_options_company_barcode_active`
- `product_options(company_id, legacy_code)` → `product_options_company_legacy_active`
- `channel_listings(company_id, channel, external_id)` → `channel_listings_company_channel_external_active` (ADR-0020, active-row uniqueness)

서비스 코드는 `findUnique({ companyId_xxx })` 대신 **`findFirst({ where: { ..., isDeleted: false } })`** 사용.

Prisma `db:push` 재실행 시 full unique constraint 가 다시 생성 → 반드시 `npm run db:3layer-setup` 재실행 (스크립트는 idempotent: `DROP ... IF EXISTS` → `CREATE`).

## Barcode 의미 분리 (R0)

- `MasterProduct.barcode` = source EAN/자사상품코드. **nullable + non-unique**, `(companyId, barcode)` index 만. 같은 EAN 이 여러 product family 에 걸치는 외부 데이터를 그대로 보존. 검색은 multi-result 가능 — `findUnique` 가정 금지.
- `ProductOption.barcode` = 진짜 옵션/스캐너 단위 barcode. `(companyId, barcode)` partial unique 유지 (`product_options_company_barcode_active`). `/options/by-barcode/:barcode` 의 single-result 의미는 이 컬럼이 보장.
- baseline import (`scripts/import-product-baseline.ts`) 는 source EAN 을 절대 `ProductOption.barcode` 에 쓰지 않는다 (null). master 식별자는 `(source barcode or blank fallback, normalized product name)` 결정적 키로 `MasterProduct.legacyCode = kiditem:v1:<sha256-16chars>` 에 저장 (idempotency 전용 — UI 노출 금지, user-facing code 는 `MasterProduct.code`).
- 별도 source 가 진짜 옵션 barcode 를 제공하면 별도 import path 로 `ProductOption.barcode` 채움. baseline path 와 섞지 말 것.

## ERD / Graphify 재생성

Prisma 모델 / `scripts/generate-prisma-erd.mjs` / 스키마 consumer (`apps/server/src/channels`, `packages/shared`, `scripts`) / 기타 import script 변경 후 반드시:

```bash
npm run db:erd
npm run graphify:schema
```

산출물 (`docs/ERD.md`, `graphify-out/schema/**`, `graphify-out/schema-consumers/**`) 는 navigation aid 일 뿐 source of truth 가 아님 — Graphify `INFERRED`/`AMBIGUOUS` edge 는 review 힌트로만 사용하고 중요한 주장은 source 파일로 검증한다.

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

`chatbot_readonly` DB 유저에 `company_id` 기반 행 필터 적용. 정책은 [`prisma/3layer-setup.sql`](3layer-setup.sql) 의 RLS 섹션이 source of truth — 새 company-scoped 테이블 추가 시 해당 파일에 같은 패턴(`ENABLE ROW LEVEL SECURITY` + `CREATE POLICY ... USING (company_id = current_setting('app.company_id', true)::uuid)`) 으로 등록한다.
- NestJS 서버 (`kiditem` 유저): 테이블 오너 → RLS 미적용 (코드에서 `where.companyId` 명시 필터, `apps/server/AGENTS.md` 참고)
- 챗봇/에이전트 (`chatbot_readonly`): RLS 적용 → 세션변수 `app.company_id`로 자동 필터
- 검증: `SELECT tablename FROM pg_policies WHERE schemaname='public' ORDER BY tablename;` 으로 정책 등록 테이블 확인 가능.
