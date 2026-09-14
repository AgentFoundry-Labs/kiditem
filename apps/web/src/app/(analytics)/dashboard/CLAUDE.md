Before working in this directory, always read this document first rather than relying on memory.

# web/dashboard - Operational Read Models

`dashboard/` owns the landing dashboard for aggregated operational read models:
sales, ads, inventory, trends, health, action tasks, and chart panels.

## Owned Surfaces

- KPI cards and date/range selection
- Dashboard chart panels
- Read-only health summaries

## State Rules

- Use `queryKeys.dashboard.*` for dashboard read models.
- Prefer `apiClient.getParsed()` with shared schemas for dashboard endpoints.
- Filter state is local UI state; aggregation and calculations stay backend
  read-model responsibility.
- Agent OS department buttons that mirror an existing operational screen call
  that screen's promoted shared action. Trigger surface is the only intended
  difference; extension command, defaults, persistence, artifacts, and browser
  collection alerts stay identical. They read as a row under the chart rather
  than a full-height board: the departments and actions are the contract, the
  board was not.
- ABC cards, calculation-status/source freshness, contribution-profit totals,
  fixed-formula context, and Top Products render Products' stored evaluation
  snapshot. Never rebuild contribution profit locally. Source-stale, mapping,
  recalculation, and calculation-error states remain separate from C; only
  Dashboard's links lead to Product Management evidence. New evaluations do
  not wait for paid-order evidence; legacy order-related states are read-only
  compatibility values until recalculation replaces old snapshots.
- Gate each ABC warning and contribution value on its dedicated Products ABC
  basis. Show the contribution publication revision, cutoff, formula, included
  products, withheld products, and denominator; a generic catalog basis does
  not authorize those values.
- Advertising performance rows all use the selected period and their own
  server-published basis. Display the effective ad source and known-through
  date instead of describing a monthly value as selected-range evidence.

## Boundary Rules

- Do not recompute dashboard totals from product/order/ad raw endpoints in the
  browser.
- Do not add dashboard-local stores for data that React Query already owns.
- Do not replace an existing browser action with a dashboard-only count/status
  Operation handler or add a generic Operations panel. Agent OS entry points
  keep their departments and their promoted actions; their placement on the
  dashboard is layout, not contract.
- New dashboard metrics require checking backend dashboard schemas and this
  route rendering together.
