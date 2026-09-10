# web/analytics - Dashboard Read Models

`app/(analytics)/` owns dashboard read-model UI: sales, ad, inventory, trends,
health, and chart panels. It consumes aggregated
backend read endpoints and should not rebuild domain calculations locally.

## Owned Surfaces

- Dashboard KPI cards and range filters
- Dashboard charts
- Read-only health and trend summaries

## Data Flow

```text
React Query + apiClient.getParsed()
  -> /api/dashboard/*
  -> dashboard components
  -> queryKeys.dashboard
```

## State Rules

- Prefer `apiClient.getParsed()` with shared Zod schemas for dashboard payloads.
- Date/range selection is UI state; aggregation remains backend-owned.
- Use `queryKeys.dashboard.*` for dashboard reads and invalidate specific range
  keys when filters change.

## Boundary Rules

- Do not call product, inventory, ad, or finance raw endpoints to recompute
  dashboard metrics in the browser.
- Do not introduce chart state stores unless multiple dashboard components need
  shared interactive state.
- Keep dashboard APIs read-only from this route group.
