# Snapshot/Backfill Service

> 10 nodes · cohesion 0.22

## Key Concepts

- **PanelService.snapshot (workflow runs <24h or active)** (12 connections) — `apps/server/src/panel/panel.service.ts`
- **PanelService (snapshot + backfill)** (5 connections) — `apps/server/src/panel/panel.service.ts`
- **PanelService.backfill (PR1: same as snapshot)** (3 connections) — `apps/server/src/panel/panel.service.ts`
- **PanelController.backfill (@Get 'backfill')** (2 connections) — `apps/server/src/panel/panel.controller.ts`
- **PanelItem type from @kiditem/shared (consumed)** (2 connections) — `apps/server/src/panel/panel.service.ts`
- **24h window (active OR updatedAt >= now-24h)** (1 connections) — `apps/server/src/panel/panel.service.ts`
- **Pattern: steps Json narrowed via Array.isArray + cast** (1 connections) — `apps/server/src/panel/panel.service.ts`
- **take: 100 (snapshot result cap)** (1 connections) — `apps/server/src/panel/panel.service.ts`
- **prisma.workflowRun.findMany (companyId + status/updatedAt filter)** (1 connections) — `apps/server/src/panel/panel.service.ts`
- **Rule: No 'first active company' fallback in services** (1 connections) — `apps/server/CLAUDE.md`

## Relationships

- No strong cross-community connections detected

## Source Files

- `apps/server/CLAUDE.md`
- `apps/server/src/panel/panel.controller.ts`
- `apps/server/src/panel/panel.service.ts`

## Audit Trail

- EXTRACTED: 27 (93%)
- INFERRED: 2 (7%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*