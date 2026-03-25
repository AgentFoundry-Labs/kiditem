---
phase: 03-nestjs-api-extensions
plan: "01"
subsystem: products-api
tags: [nestjs, products, api, agent-tasks, pipeline]
dependency_graph:
  requires: [Phase 01 schema: draftContent + pipelineStep fields on Product]
  provides: [PUT /api/products/:id/draft-content, GET /api/products/:id/preview (extended), POST /api/products/:id/trigger-image-generation]
  affects: [Phase 04 frontend editor — calls these three endpoints]
tech_stack:
  added: []
  patterns: [NestJS controller thin pass-through, PrismaService direct queries, pg_notify agent trigger pattern]
key_files:
  created: []
  modified:
    - apps/server/src/products/products.service.ts
    - apps/server/src/products/products.controller.ts
decisions:
  - updateDraftContent does full JSONB replacement (no merge) — D-01
  - getPreview priority chain: processedData > draftContent > rawData — D-03
  - triggerImageGeneration snapshots draftContent at trigger time to avoid race condition — D-05
  - pipelineStep set to images_generating before returning task ID — D-06
metrics:
  duration: "8min"
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 2
---

# Phase 03 Plan 01: NestJS Products API Extensions Summary

Three new endpoint capabilities added to the products module: draft-content save, extended preview with fallback priority, and image generation trigger.

## What Was Built

**Service methods added to ProductsService** (`apps/server/src/products/products.service.ts`):
- `updateDraftContent(id, body)` — validates product exists, overwrites draftContent JSONB column with full request body (no merge)
- `getPreview(id)` — returns data with processedData > draftContent > rawData priority; template='bold-vertical' when draft or processed content exists
- `triggerImageGeneration(id)` — validates draftContent exists, creates agent_task with draftContent snapshot + pg_notify, sets pipelineStep='images_generating', returns taskId

**Controller routes added/modified in ProductsController** (`apps/server/src/products/products.controller.ts`):
- `PUT :id/draft-content` — new route, thin pass-through to service
- `GET :id/preview` — modified to delegate to service (was inline, now service handles all logic)
- `POST :id/trigger-image-generation` — new route, thin pass-through to service

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma client types missing draftContent and pipelineStep**
- **Found during:** Task 1 TypeScript compilation
- **Issue:** `npx tsc --noEmit` reported `draftContent` and `pipelineStep` don't exist on Prisma Product type. Phase 1 schema added these fields but `npx prisma generate` was not run, so the generated client was stale.
- **Fix:** Ran `DATABASE_URL=... npx prisma generate --schema prisma/schema.prisma` to regenerate the client. TypeScript compilation succeeded afterward.
- **Files modified:** `node_modules/@prisma/client` (generated, not tracked)
- **Commit:** caa03ae (included in Task 1 commit message)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Full JSONB replacement for updateDraftContent | Frontend always sends complete object; no partial merge needed; eliminates merge bugs (D-01) |
| processedData > draftContent > rawData priority in getPreview | Shows best available data; supports in-progress editing state where draftContent exists but not final images (D-03) |
| draftContent snapshot in triggerImageGeneration input | Race-condition-safe design established in Phase 2 D-06; agent reads snapshot, not live DB |
| pipelineStep='images_generating' set before return | Frontend polls GET :id for status changes; setting before return ensures no polling gap |

## Known Stubs

None — all three endpoints fully wired to Prisma queries and agent task creation.

## Self-Check: PASSED

Files verified:
- `apps/server/src/products/products.service.ts` — FOUND, contains updateDraftContent, getPreview, triggerImageGeneration
- `apps/server/src/products/products.controller.ts` — FOUND, contains draft-content, trigger-image-generation, getPreview delegation

Commits verified:
- `caa03ae` — feat(03-01): add service methods
- `483a48d` — feat(03-01): add controller routes
