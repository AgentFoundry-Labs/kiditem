Consult this document first instead of relying on memorized knowledge.

# web/dashboard - Operational Read Models

`dashboard/` owns the landing dashboard for aggregated operational read models:
sales, ads, inventory, trends, health, action tasks, and chart panels.

## Owned Surfaces

- KPI cards and date/range selection
- Dashboard chart panels
- Read-only action task and health summaries

## State Rules

- Use `queryKeys.dashboard.*` for dashboard read models.
- Prefer `apiClient.getParsed()` with shared schemas for dashboard endpoints.
- Filter state is local UI state; aggregation and calculations stay backend
  read-model responsibility.
- Dashboard action task widgets may read and execute explicit backend action
  endpoints, but action-board workflow ownership remains in automation.
- ABC cards and Top Products render the backend's nullable stored product grade.
  Show unclassified separately and never substitute C for `null`.

## Boundary Rules

- Do not recompute dashboard totals from product/order/ad raw endpoints in the
  browser.
- Do not add dashboard-local stores for data that React Query already owns.
- New dashboard metrics require checking backend dashboard schemas and this
  route rendering together.
