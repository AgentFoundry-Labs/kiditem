# Roadmap: KidItem

## Milestones

- [x] **v1.0 상세페이지 파이프라인 리팩토링** - Phases 1-4 (completed 2026-03-26)
- [ ] **v2.0 쿠팡 운영 대시보드** - Phases 1-3 (in progress)

## Phases

<details>
<summary>v1.0 상세페이지 파이프라인 리팩토링 (Phases 1-4) — COMPLETED 2026-03-26</summary>

### Phase 1: Schema Foundations
**Goal**: The database can store intermediate pipeline state separately from final output, preventing state overwrites at the DB level before any agent or frontend code is written
**Depends on**: Nothing (first phase)
**Requirements**: SCHM-01, SCHM-02
**Success Criteria** (what must be TRUE):
  1. `products` table has a nullable `draftContent` JSONB column that can be written independently of `processedData`
  2. `products` table has a nullable `pipelineStep` String column that accepts `null`, `content_ready`, and `images_generating` values
  3. Existing products with `processedData` set and no `draftContent` load in the editor without error (backward compatibility confirmed)
  4. `npx prisma generate` completes and TypeScript compilation passes with the new fields
**Plans:** 1/1 plans complete

Plans:
- [x] 01-01-PLAN.md — Add draftContent/pipelineStep columns, apply schema, verify compilation

### Phase 2: Python Agent Split
**Goal**: Two discrete Python pipeline steps replace the monolithic content pipeline — one that generates copywriting and stops, one that reads confirmed edits and runs FAL.AI — so both can be tested against real DB state before any frontend work begins
**Depends on**: Phase 1
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06
**Success Criteria** (what must be TRUE):
  1. Triggering a `content` agent task with `generation_mode='draft'` writes Korean copy and theme colors to `draftContent` and sets `pipelineStep = content_ready`; no FAL.AI calls are made
  2. Triggering a `content` agent task with `generation_mode='image'` reads `hero_image_url` from `agent_tasks.input` snapshot (not from live DB), runs FAL.AI in parallel, and writes the assembled `DetailPageData` to `processedData`
  3. Oneshot pipeline is deleted entirely
  4. Size chart OCR (`_scan_size_charts`) is preserved in Step 1; `_analyze_product` image classification is removed
**Plans:** 3/3 plans complete

Plans:
- [x] 02-01-PLAN.md — Update models/enums, delete oneshot, implement AIClient image methods
- [x] 02-02-PLAN.md — Split TemplatePipeline into run_step1/run_step2, rewrite ContentAgent routing
- [x] 02-03-PLAN.md — Test framework scaffold + automated tests for all PIPE requirements

### Phase 3: NestJS API Extensions
**Goal**: The backend exposes three new endpoint capabilities so the frontend can persist user edits, render a live preview from draft content, and trigger image generation — establishing the HTTP contract Phase 4 builds against
**Depends on**: Phase 2
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. `PUT /api/products/:id/draft-content` accepts a full draftContent object and overwrites the column
  2. `GET /api/products/:id/preview` returns data with processedData > draftContent > rawData priority, template='bold-vertical' when processedData or draftContent exists
  3. `POST /api/products/:id/trigger-image-generation` creates an `agent_tasks` row with the confirmed content snapshot and returns a task ID for polling
**Plans:** 1/1 plans complete

Plans:
- [x] 03-01-PLAN.md — Add draft-content save, preview with fallback priority, and image generation trigger endpoints

### Phase 4: Frontend Editor Integration
**Goal**: Users can edit AI-generated copywriting, theme colors, and hero image selection directly in the editor page and then trigger FAL.AI image generation with a single confirmation button
**Depends on**: Phase 3
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04
**Success Criteria** (what must be TRUE):
  1. User can edit title, hook text, key points, and spec fields in a structured form panel and see changes reflected in the template preview without a page reload
  2. User can open a color picker for each of the 7 theme colors and see the template preview update immediately on color change
  3. User can select a hero image from a grid of raw source images; the selection is persisted to `draftContent` via debounced PUT on every change
  4. Clicking "이미지 생성 확정" triggers Step 2 and shows a progress indicator; the editor transitions to the final preview when `processedData` is available
**Plans:** 2/2 plans complete

Plans:
- [x] 04-01-PLAN.md — Install react-colorful, create sub-components (ColorPickerField, StructuredEditPanel, StructuredPreviewPane, ImageGenerationCTA)
- [x] 04-02-PLAN.md — Wire components into EditorPage with mode orchestration, save, poll, and human verification

</details>

## v2.0 쿠팡 운영 대시보드

**Milestone Goal:** 쿠팡 운영 현황을 한 화면에서 파악하고 즉시 행동할 수 있는 대시보드를 제공한다. 이미 적재된 주문·반품 데이터를 기반으로 KPI 카드, 트렌드 차트, 상품별 실적 테이블을 구축한다.

### Phase 1: Dashboard Infrastructure
**Goal**: Query correctness guard-rails are in place so that every subsequent dashboard query returns accurate KST-bucketed Korean data from the first line written
**Depends on**: Nothing (new milestone, existing seeded data)
**Requirements**: INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):
  1. A `kstDayStart(date)` helper converts any JS Date to a UTC timestamp representing midnight KST, and all date range queries use it — no raw `new Date()` in service filters
  2. `apps/server/src/coupang/constants.ts` exports `ORDER_STATUSES` and `RETURN_STATUSES` as `as const` objects, and all service queries reference these constants instead of string literals
  3. The `CoupangDashboardModule` is registered in `AppModule`, the `GET /api/coupang-dashboard` endpoint returns HTTP 200, and `Promise.all()` fan-out is verified in the service (not sequential awaits)
  4. `react-day-picker@9` is installed in `apps/web` and the date range picker renders inside a Radix Popover without console errors
**Plans**: TBD
**UI hint**: yes

### Phase 2: Orders Dashboard
**Goal**: Users can view Coupang order operations at a glance — today's KPIs, 30-day revenue trend, product performance ranking, and pending action counts — all driven from already-seeded DB data
**Depends on**: Phase 1
**Requirements**: ORD-01, ORD-02, ORD-03, ORD-04, ORD-05
**Success Criteria** (what must be TRUE):
  1. The orders page shows a KPI bar with today's order count, today's revenue (KRW), and pending-confirmation count — all figures update when the date range filter changes
  2. A 30-day revenue trend line chart renders with one data point per KST calendar day, using `DATE_TRUNC` bucketing via `$queryRaw`
  3. A top-20 product performance table lists products ranked by revenue, grouped by `sellerProductId`, with correct row counts matching DB aggregation
  4. The sidebar displays a live pending-action badge showing ACCEPT order count and UC return count
  5. A date range filter (7d / 30d / 90d / custom) controls all queries on the orders page simultaneously
**Plans**: TBD
**UI hint**: yes

### Phase 3: Returns Dashboard
**Goal**: Users can understand return patterns — overall return rate, reason breakdown, and fault attribution — so they can identify product and fulfilment issues from the returns page
**Depends on**: Phase 2
**Requirements**: RET-01, RET-02, RET-03
**Success Criteria** (what must be TRUE):
  1. The returns page shows a return rate KPI card (returns / orders × 100%) that recalculates when the date range filter changes
  2. A return reason breakdown bar chart renders `cancelReasonCategory1` values from `coupang_returns`, showing top reasons by count
  3. A CUSTOMER vs VENDOR fault split indicator shows the proportion of each fault type, enabling the user to distinguish carrier/product issues from customer behaviour
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundations | v1.0 | 0/1 | Planned    |  |
| 2. Python Agent Split | v1.0 | 3/3 | Complete | 2026-03-26 |
| 3. NestJS API Extensions | v1.0 | 1/1 | Complete | 2026-03-26 |
| 4. Frontend Editor Integration | v1.0 | 2/2 | Complete | 2026-03-26 |
| 1. Dashboard Infrastructure | v2.0 | 0/TBD | Not started | - |
| 2. Orders Dashboard | v2.0 | 0/TBD | Not started | - |
| 3. Returns Dashboard | v2.0 | 0/TBD | Not started | - |
