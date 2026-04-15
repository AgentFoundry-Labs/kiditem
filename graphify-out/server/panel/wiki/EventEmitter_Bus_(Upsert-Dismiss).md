# EventEmitter Bus (Upsert/Dismiss)

> 9 nodes · cohesion 0.22

## Key Concepts

- **PanelSseService.handleUpsert (@OnEvent UPSERT)** (4 connections) — `apps/server/src/panel/events/panel-sse.service.ts`
- **buildWorkflowPanelItem (single source of truth for upsert)** (3 connections) — `apps/server/src/panel/adapters/workflow-run-mapper.ts`
- **PanelSseService.handleDismiss (@OnEvent DISMISS)** (3 connections) — `apps/server/src/panel/events/panel-sse.service.ts`
- **normalizeWorkflowStatus ('completed' → 'succeeded')** (3 connections) — `apps/server/src/panel/adapters/workflow-run-mapper.ts`
- **PANEL_EVENTS constants (UPSERT, DISMISS event names)** (2 connections) — `apps/server/src/panel/events/panel-events.ts`
- **Pattern: workflow domain hook emits PANEL_EVENTS.UPSERT on status transition** (2 connections) — `apps/server/CLAUDE.md`
- **PanelDismissInternal (itemId + companyId payload)** (1 connections) — `apps/server/src/panel/events/panel-events.ts`
- **Legacy WorkflowRun rows pre-Task 6 lack companyId — return null** (1 connections) — `apps/server/src/panel/adapters/workflow-run-mapper.ts`
- **PanelUpsertInternal (item + companyId payload)** (1 connections) — `apps/server/src/panel/events/panel-events.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `apps/server/CLAUDE.md`
- `apps/server/src/panel/adapters/workflow-run-mapper.ts`
- `apps/server/src/panel/events/panel-events.ts`
- `apps/server/src/panel/events/panel-sse.service.ts`

## Audit Trail

- EXTRACTED: 20 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*