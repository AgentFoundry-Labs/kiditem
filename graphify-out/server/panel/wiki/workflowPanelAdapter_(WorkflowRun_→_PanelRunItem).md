# workflowPanelAdapter (WorkflowRun → PanelRunItem)

> God node · 9 connections · `apps/server/src/panel/adapters/workflow.adapter.ts`

## Connections by Relation

### calls
- [[PanelService.snapshot (workflow runs <24h or active)]] `EXTRACTED`
- [[buildWorkflowPanelItem (single source of truth for upsert)]] `EXTRACTED`

### implements
- [[PanelRunAdapter<TInput> interface]] `EXTRACTED`
- [[defaultVisibility: triggeredByUserId == null ? 'company' : 'user']] `EXTRACTED`
- [[Panel item id namespace ('workflow:<runId>')]] `EXTRACTED`

### references
- [[panelRunAdapters registry (workflow → adapter, satisfies)]] `EXTRACTED`
- [[WorkflowRunInput interface (id, status, templateName, steps...)]] `EXTRACTED`
- [[VALID_STATUS Set (derived from PanelRunItem.shape.status.options)]] `EXTRACTED`

### shares_data_with
- [[PanelItem type from @kiditem/shared (consumed)]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*