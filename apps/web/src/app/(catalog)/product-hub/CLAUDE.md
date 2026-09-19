Before working in this directory, always read this document first rather than relying on memory.

# product-hub — Product Operations Center

This folder owns four surfaces:

- `/product-hub`: canonical product operations;
- `/product-hub/[id]`: product metadata, channel options, recipes, and
  capacity;
- `/product-hub/matching`: channel option recipe review;
- `/product-hub/sales-products`: 판매상품 list, Sabangnet workbook import
  (preview, then commit), and the one-screen editor with the option table,
  per-option Sellpia link, and per-mall values (ADR-0014). Saving sends only
  changed fields; options follow the basics save with the returned version.

## State Contract

- Filters, period, and page are URL-authoritative. Command-center counts use a
  dedicated unfiltered operating-catalog summary and do not change with row
  filters or pagination.
- Render unavailable metrics as uncollected rather than deriving them from
  unrelated aggregates.
- Product ABC/profit and depletion facts come from their owning backend
  projections. Unclassified is not C. The explicit grade-refresh command reads
  the latest `COMPLETE` source snapshots and invokes the Products-owned ABC
  recalculation; source collection never triggers it.
- Missing or stale Sellpia, mapping, or advertising evidence is shown as the
  source status, never as zero cost or C. Revenue/profit contribution, rank,
  and cumulative share are separate reporting metrics and do not affect the
  absolute ABC grade.
- Product detail and matching share the Products-owned complete
  option-component replacement API. A sole option is displayed as the default
  option; there is no separate listing-level product picker.
- Matching may confirm one clearly separated name candidate only when option
  facts do not conflict and selling quantity is confirmed. Ambiguous evidence
  remains for review. Catalog recollection preserves confirmed option recipes
  and does not create channel-origin MasterProducts.
- Product display uses calculated reference/image projections. Edit forms
  submit only operator-owned product media and never promote channel fallbacks.
Product operations tests under this directory are the executable authority for
layout, filter/count parity, route state, and mutation invalidation. Run:

    npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub
