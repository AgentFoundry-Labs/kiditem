# Pluggable Adapter Pattern

> 10 nodes · cohesion 0.22

## Key Concepts

- **workflowPanelAdapter (WorkflowRun → PanelRunItem)** (9 connections) — `apps/server/src/panel/adapters/workflow.adapter.ts`
- **panelRunAdapters registry (workflow → adapter, satisfies)** (4 connections) — `apps/server/src/panel/adapters/registry.ts`
- **defaultVisibility: triggeredByUserId == null ? 'company' : 'user'** (2 connections) — `apps/server/src/panel/adapters/workflow.adapter.ts`
- **PanelRunAdapter<TInput> interface** (2 connections) — `apps/server/src/panel/adapters/types.ts`
- **Visibility filter: company OR (user AND actorUserId === currentUserId)** (2 connections) — `apps/server/src/panel/panel.service.ts`
- **Panel item id namespace ('workflow:<runId>')** (1 connections) — `apps/server/src/panel/adapters/workflow.adapter.ts`
- **PR1 scope: workflow source only (PR2 adds agent, image_edit, alert)** (1 connections) — `apps/server/src/panel/adapters/registry.ts`
- **VALID_STATUS Set (derived from PanelRunItem.shape.status.options)** (1 connections) — `apps/server/src/panel/adapters/workflow.adapter.ts`
- **WorkflowRunInput interface (id, status, templateName, steps...)** (1 connections) — `apps/server/src/panel/adapters/workflow.adapter.ts`
- **Rule: satisfies pattern in services (Prisma drift detection)** (1 connections) — `apps/server/CLAUDE.md`

## Relationships

- No strong cross-community connections detected

## Source Files

- `apps/server/CLAUDE.md`
- `apps/server/src/panel/adapters/registry.ts`
- `apps/server/src/panel/adapters/types.ts`
- `apps/server/src/panel/adapters/workflow.adapter.ts`
- `apps/server/src/panel/panel.service.ts`

## Audit Trail

- EXTRACTED: 24 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*