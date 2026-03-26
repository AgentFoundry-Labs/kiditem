# Roadmap: KidItem

## Milestones

- [x] **v1.0 상세페이지 파이프라인 리팩토링** - Phases 1-4 (completed 2026-03-26)
- [x] **v2.0 쿠팡 운영 대시보드** - Phases 1-3 (completed 2026-03-26)
- [ ] **v2.1 WYSIWYG 상세페이지 에디터** - Phases 4-7 (in progress)

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

### Phase 4 (v1.0): Frontend Editor Integration
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

<details>
<summary>v2.0 쿠팡 운영 대시보드 (Phases 1-3) — COMPLETED 2026-03-26</summary>

### Phase 1 (v2.0): Dashboard Infrastructure
**Goal**: Query correctness guard-rails are in place so that every subsequent dashboard query returns accurate KST-bucketed Korean data from the first line written
**Depends on**: Nothing (new milestone, existing seeded data)
**Requirements**: INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):
  1. A `kstDayStart(date)` helper converts any JS Date to a UTC timestamp representing midnight KST, and all date range queries use it — no raw `new Date()` in service filters
  2. `apps/server/src/coupang/constants.ts` exports `ORDER_STATUSES` and `RETURN_STATUSES` as `as const` objects, and all service queries reference these constants instead of string literals
  3. The `CoupangDashboardModule` is registered in `AppModule`, the `GET /api/coupang-dashboard` endpoint returns HTTP 200, and `Promise.all()` fan-out is verified in the service (not sequential awaits)
  4. `react-day-picker@9` is installed in `apps/web` and the date range picker renders inside a Radix Popover without console errors
**Plans:** 1/1 plans complete

Plans:
- [x] 01-01-PLAN.md — Backend guard-rails (kst helper, status constants, CoupangDashboard module) + frontend DateRangePicker

### Phase 2 (v2.0): Orders Dashboard
**Goal**: Users can view Coupang order operations at a glance — today's KPIs, 30-day revenue trend, product performance ranking, and pending action counts — all driven from already-seeded DB data
**Depends on**: Phase 1 (v2.0)
**Requirements**: ORD-01, ORD-02, ORD-03, ORD-04, ORD-05
**Success Criteria** (what must be TRUE):
  1. The orders page shows a KPI bar with today's order count, today's revenue (KRW), and pending-confirmation count — all figures update when the date range filter changes
  2. A 30-day revenue trend line chart renders with one data point per KST calendar day, using `DATE_TRUNC` bucketing via `$queryRaw`
  3. A top-20 product performance table lists products ranked by revenue, grouped by `sellerProductId`, with correct row counts matching DB aggregation
  4. The sidebar displays a live pending-action badge showing ACCEPT order count and UC return count
  5. A date range filter (7d / 30d / 90d / custom) controls all queries on the orders page simultaneously
**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md — Backend: add getRevenueTrend and getProductRanking service methods + /trend and /ranking controller endpoints
- [x] 02-02-PLAN.md — Frontend: /coupang/orders page (KPI bar, trend chart, ranking table, date filter) + sidebar pending-action badges

### Phase 3 (v2.0): Returns Dashboard
**Goal**: Users can understand return patterns — overall return rate, reason breakdown, and fault attribution — so they can identify product and fulfilment issues from the returns page
**Depends on**: Phase 2 (v2.0)
**Requirements**: RET-01, RET-02, RET-03
**Success Criteria** (what must be TRUE):
  1. The returns page shows a return rate KPI card (returns / orders x 100%) that recalculates when the date range filter changes
  2. A return reason breakdown bar chart renders `cancelReasonCategory1` values from `coupang_returns`, showing top reasons by count
  3. A CUSTOMER vs VENDOR fault split indicator shows the proportion of each fault type, enabling the user to distinguish carrier/product issues from customer behaviour
**Plans:** 2/2 plans complete

Plans:
- [x] 03-01-PLAN.md — Backend: add getReturnSummary, getReturnReasonBreakdown, getReturnFaultSplit service methods + controller endpoints
- [x] 03-02-PLAN.md — Frontend: /coupang/returns page (return rate KPI, reason bar chart, fault split indicator, date filter) + sidebar nav item

</details>

## v2.1 WYSIWYG 상세페이지 에디터

**Milestone Goal:** 수집 직후 GrapesJS에서 상세페이지를 직접 편집하고, 개별 요소를 AI로 가공할 수 있다.

### Summary Checklist

- [x] **Phase 4: GrapesJS Editor Foundation** - Draft 진입 + 플레이스홀더 HTML 로드 + CSS 정확성 + OneShot 제거 (completed 2026-03-26)
- [ ] **Phase 5: Per-Element Text AI** - 텍스트 요소 AI 액션 패널 (다시쓰기/번역/축약) + 로딩/에러/Undo
- [ ] **Phase 6: Per-Element Image AI** - 이미지 요소 AI 편집 패널 (배경 제거/AI 생성) + 비동기 폴링
- [ ] **Phase 7: AI Fill CTA** - GrapesJS 모드 "AI로 나머지 채우기" 빈 필드 자동 생성

## Phase Details

### Phase 4: GrapesJS Editor Foundation
**Goal**: Draft 상품에서 GrapesJS 에디터로 바로 진입하면 플레이스홀더 bold-vertical HTML이 캔버스에 로드되고, 반복 로드 시 CSS가 누적되지 않으며 OneShot 코드는 완전히 제거된다
**Depends on**: Nothing (first phase of v2.1; prior milestone infrastructure exists)
**Requirements**: EDIT-01, EDIT-02, CLEAN-01
**Success Criteria** (what must be TRUE):
  1. Draft 상태 상품의 에디터 페이지(/sourcing/[id]/editor)에 진입하면 AI 가공 없이 GrapesJS 캔버스에 bold-vertical 플레이스홀더 HTML이 표시된다
  2. 에디터에서 HTML을 5회 연속 다시 로드해도 `editor.getCss().length`가 증가하지 않는다 (CSS 누적 없음)
  3. 프론트엔드 및 templates 패키지 어디에도 OneShot 관련 코드가 존재하지 않는다 (`grep -r "oneshot" apps/web packages/` 결과 없음)
**Plans:** 1/1 plans complete

Plans:
- [x] 04-01-PLAN.md — OneShot cleanup, CSS accumulation fix, draft entry verification + TypeScript build

### Phase 5: Per-Element Text AI
**Goal**: GrapesJS 캔버스에서 텍스트 요소를 선택하면 AI 액션 패널이 나타나고, 다시쓰기/번역/축약 동작이 결과를 캔버스에 적용하며, 로딩 상태와 에러 피드백과 Undo가 올바르게 동작한다
**Depends on**: Phase 4
**Requirements**: AI-01, AI-03
**Success Criteria** (what must be TRUE):
  1. 텍스트 요소를 클릭하면 Canvas Spots API를 통해 해당 요소 근처에 AITextEditPanel이 나타나고, 다른 요소 클릭 시 사라진다
  2. "다시쓰기", "번역", "축약" 프리셋 중 하나를 선택하면 AI 요청이 시작되고 패널이 로딩 상태를 표시하며, 완료 시 캔버스의 텍스트가 결과로 교체된다
  3. AI 요청 중 에러가 발생하면 패널에 에러 메시지가 표시되고 원래 텍스트는 유지된다
  4. AI 적용 후 Cmd+Z(Undo)를 누르면 원래 텍스트로 정확히 되돌아간다 (단일 Undo 스텝)
  5. AI 액션 진행 중에는 다른 AI 액션(텍스트/이미지/AI Fill 포함)이 시작되지 않는다 (isBusy 가드)
**Plans:** 1 plan

Plans:
- [ ] 05-01-PLAN.md — NestJS TextAi module + AITextEditPanel component + Canvas Spots integration + isBusy guard
**UI hint**: yes

### Phase 6: Per-Element Image AI
**Goal**: GrapesJS 캔버스에서 이미지 요소를 선택하면 AI 편집 패널이 나타나고, 배경 제거/AI 생성 작업이 FAL.AI 비동기 파이프라인을 통해 완료되면 이미지가 캔버스에서 즉시 교체된다
**Depends on**: Phase 5
**Requirements**: AI-02, AI-04
**Success Criteria** (what must be TRUE):
  1. 이미지 요소를 클릭하면 AIImageEditPanel이 나타나고 배경 제거, AI 생성 등 편집 옵션이 표시된다
  2. 편집 옵션을 선택하면 NestJS를 통해 agent_task가 생성되고 패널이 진행 중 상태를 표시한다 (생성 중 편집 잠금)
  3. FAL.AI 처리가 완료되면(10-40초) 완성된 이미지가 캔버스의 해당 이미지 요소에 즉시 교체된다
  4. AI 처리 중 에러가 발생하면 패널에 에러 메시지가 표시되고 원래 이미지는 유지된다
**Plans**: TBD
**UI hint**: yes

### Phase 7: AI Fill CTA
**Goal**: GrapesJS 에디터 모드에서 "AI로 나머지 채우기" CTA를 클릭하면 draft 상품의 빈 필드가 AI content_draft 파이프라인으로 자동 생성되고, 완료 후 캔버스가 결과를 반영한다
**Depends on**: Phase 5
**Requirements**: EDIT-03
**Success Criteria** (what must be TRUE):
  1. GrapesJS 에디터 모드에서 "AI로 나머지 채우기" 버튼이 표시되고, 클릭하면 로딩 상태가 시작된다
  2. AI 생성이 완료되면(`pipelineStep === 'content_ready'` 폴링 감지) 캔버스의 플레이스홀더 텍스트가 AI 생성 카피로 교체된다
  3. AI Fill 진행 중에는 다른 AI 액션이 시작되지 않고, 완료 후 isBusy가 해제된다
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5 → 6 → 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundations | v1.0 | 1/1 | Complete | 2026-03-25 |
| 2. Python Agent Split | v1.0 | 3/3 | Complete | 2026-03-26 |
| 3. NestJS API Extensions | v1.0 | 1/1 | Complete | 2026-03-26 |
| 4. Frontend Editor Integration | v1.0 | 1/1 | Complete   | 2026-03-26 |
| 1. Dashboard Infrastructure | v2.0 | 1/1 | Complete | 2026-03-26 |
| 2. Orders Dashboard | v2.0 | 2/2 | Complete | 2026-03-26 |
| 3. Returns Dashboard | v2.0 | 2/2 | Complete | 2026-03-26 |
| 4. GrapesJS Editor Foundation | v2.1 | 1/1 | Complete | 2026-03-26 |
| 5. Per-Element Text AI | v2.1 | 0/1 | Planning | - |
| 6. Per-Element Image AI | v2.1 | 0/TBD | Not started | - |
| 7. AI Fill CTA | v2.1 | 0/TBD | Not started | - |
