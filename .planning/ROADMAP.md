# Roadmap: KidItem v1.0

## Overview

v1.0 refactors the monolithic AI content pipeline into a two-step human-in-the-loop flow: Step 1 generates Korean copywriting and theme colors; Step 2 lets the user review and edit in the existing editor; Step 3 fires FAL.AI image generation only after explicit confirmation. Four phases execute in strict dependency order — schema first, then Python agents, then NestJS API, then the frontend editor — so that every downstream layer builds against verified contracts.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Schema Foundations** - Add draftContent and pipelineStep columns to Product; generate Prisma client (completed 2026-03-25)
- [ ] **Phase 2: Python Agent Split** - Split monolithic ContentAgent into two-step pipeline (draft copywriting + image generation) with oneshot deletion
- [ ] **Phase 3: NestJS API Extensions** - Expose draft-content persistence and preview endpoints so the frontend has a stable HTTP contract
- [ ] **Phase 4: Frontend Editor Integration** - Extend the editor page with structured text/color/hero editing, live preview, and the two-step pipeline CTA buttons

## Phase Details

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
  3. Oneshot pipeline is deleted entirely (per user decision D-02)
  4. Size chart OCR (`_scan_size_charts`) is preserved in Step 1; `_analyze_product` image classification is removed
**Plans:** 1/3 plans executed

Plans:
- [x] 02-01-PLAN.md — Update models/enums, delete oneshot, implement AIClient image methods
- [x] 02-02-PLAN.md — Split TemplatePipeline into run_step1/run_step2, rewrite ContentAgent routing
- [x] 02-03-PLAN.md — Test framework scaffold + automated tests for all PIPE requirements

### Phase 3: NestJS API Extensions
**Goal**: The backend exposes two new endpoints so the frontend can persist user edits and render a live preview from draft content — establishing the HTTP contract Phase 4 builds against
**Depends on**: Phase 2
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. `PUT /api/products/:id/draft-content` accepts partial field updates and merges them into the existing `draftContent` JSONB without overwriting unrelated fields
  2. `GET /api/products/:id/preview` returns a `DetailPageData`-shaped payload built from `draftContent` when `processedData` is null, and falls back to `processedData` for legacy products
  3. `POST /api/products/:id/trigger-image-generation` creates an `agent_tasks` row with the confirmed content snapshot and returns a task ID for polling
**Plans**: TBD
**UI hint**: no

### Phase 4: Frontend Editor Integration
**Goal**: Users can edit AI-generated copywriting, theme colors, and hero image selection directly in the editor page and then trigger FAL.AI image generation with a single confirmation button
**Depends on**: Phase 3
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04
**Success Criteria** (what must be TRUE):
  1. User can edit title, hook text, key points, and spec fields in a structured form panel and see changes reflected in the template preview without a page reload
  2. User can open a color picker for each of the 7 theme colors and see the template preview update immediately on color change
  3. User can select a hero image from a grid of raw source images; the selection is persisted to `draftContent` via debounced PUT on every change
  4. Clicking "이미지 생성 확정" triggers Step 2 and shows a progress indicator; the editor transitions to the final preview when `processedData` is available
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema Foundations | 1/1 | Complete   | 2026-03-25 |
| 2. Python Agent Split | 1/3 | In Progress|  |
| 3. NestJS API Extensions | 0/TBD | Not started | - |
| 4. Frontend Editor Integration | 0/TBD | Not started | - |
