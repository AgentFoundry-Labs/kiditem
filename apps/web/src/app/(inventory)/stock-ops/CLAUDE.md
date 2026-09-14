Before working in this directory, always read this document first rather than relying on memory.

# web/stock-ops — Inventory Analysis

`/stock-ops` is analysis-only and owns product-outflow plus channel-zero.
Inventory actions and records belong in inventory-hub.

- Preserve `MOVED_TABS` compatibility for saved dashboard, automation, and
  bookmark links; keep its page spec synchronized.
- Mapping edits link to Product Hub and do not save recipes here.
- Product outflow renders the Analytics-owned depletion, reorder, and months
  projections plus the one canonical product ABC state. It does not recalculate
  them or treat unclassified/observation/stale states as C.
- Refresh explicitly requests physical-snapshot scope; profit/ABC full refresh
  remains Product Management-owned.
- Destination images are read-only channel media and never become Inventory
  data or ABC evidence.
- Mapping-required and not-collected rows are not zero stock and do not enter
  reorder counts. Preserve all linked destinations and identify aggregated
  demand.
- Keep inactive views from running timers, requests, or toasts.

Focused specs in this directory own redirects, filters, labels, refresh scope,
and projection semantics.
