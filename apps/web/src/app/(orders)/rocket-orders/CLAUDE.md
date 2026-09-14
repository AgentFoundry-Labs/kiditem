Before working in this directory, always read this document first rather than relying on memory.

# web/rocket-orders — Rocket Review Workspace

`/rocket-orders` is the only operator-facing Rocket review route. Preserve
the calendar, chart, preview/workbook panel position, and local file history.
The date-scoped PO list is part of the preview table and must not become a
second list.

## Contract

- The selected active Rocket account scopes collection, source lists, saved
  evidence, and preview. Multiple accounts require explicit selection.
- Manual and dashboard collection share
  `collectAndPersistRocketPurchaseOrders`. Reopen one exact complete source
  run; never merge runs or expose a historical-source picker.
- Load the newest source automatically. Date selection narrows display and the
  workbook decision while server validation uses the complete source snapshot.
- Preview always shows the complete selected evidence. Quantity/reason edits
  make it dirty until whole-preview server revalidation succeeds.
- Preview reads the latest stored Sellpia snapshot immediately. Official export
  remains server-fenced to a fresh generation.
- Mapping blockers link to Product Hub. A confirmed option may create an empty
  component rule or replace a fully reviewed recipe through Products'
  optimistic API, then rerun the same source preview.
- Only recipe-backed insufficient capacity may continue with reviewed quantity
  zero and a shortage reason. Shared components allocate once in stable
  ETA/PO/line order.
- Browser workbook generation follows successful server revalidation and ends
  at download. Do not add provider submission, post-download workflow,
  commitment, stock mutation, or alternate workbook APIs.

Focused specs in this directory own the exact preserved shell, calendar/source
selection, blockers, allocation display, edit/revalidation, and export gates.
