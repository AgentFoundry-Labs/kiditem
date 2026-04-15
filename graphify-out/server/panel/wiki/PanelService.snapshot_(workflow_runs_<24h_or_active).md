# PanelService.snapshot (workflow runs <24h or active)

> God node · 12 connections · `apps/server/src/panel/panel.service.ts`

## Connections by Relation

### calls
- [[workflowPanelAdapter (WorkflowRun → PanelRunItem)]] `EXTRACTED`
- [[PanelController.stream (@Sse 'stream')]] `EXTRACTED`
- [[normalizeWorkflowStatus ('completed' → 'succeeded')]] `EXTRACTED`
- [[PanelService.backfill (PR1: same as snapshot)]] `EXTRACTED`
- [[PanelController.snapshot (@Get 'snapshot')]] `EXTRACTED`
- [[prisma.workflowRun.findMany (companyId + status/updatedAt filter)]] `EXTRACTED`

### implements
- [[PanelService (snapshot + backfill)]] `EXTRACTED`
- [[Visibility filter: company OR (user AND actorUserId === currentUserId)]] `EXTRACTED`
- [[Pattern: steps Json narrowed via Array.isArray + cast]] `EXTRACTED`

### rationale_for
- [[Rule: No 'first active company' fallback in services]] `INFERRED`

### references
- [[24h window (active OR updatedAt >= now-24h)]] `EXTRACTED`
- [[take: 100 (snapshot result cap)]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*