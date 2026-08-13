# product-hub — Product Operations Center

This folder owns four surfaces:

- `/product-hub`: canonical product operations;
- `/product-hub/[id]`: product metadata, channel options, recipes, and
  capacity;
- `/product-hub/options`: read-only Sellpia inventory;
- `/product-hub/matching`: channel option recipe review.

## State Contract

- Filters, period, and page are URL-authoritative. Command-center counts use a
  dedicated unfiltered operating-catalog summary and do not change with row
  filters or pagination.
- Render unavailable metrics as uncollected rather than deriving them from
  unrelated aggregates.
- Product ABC/profit and depletion facts come from their owning backend
  projections. Unclassified is not C, and Product Management's explicit full
  refresh owns profit collection plus ABC recalculation.
- Product detail and matching share the Products-owned complete
  option-component replacement API. A sole option is displayed as the default
  option; there is no separate listing-level product picker.
- Matching candidates never confirm identity. Catalog recollection preserves
  confirmed option recipes and does not create channel-origin MasterProducts.
- Product display uses calculated reference/image projections. Edit forms
  submit only operator-owned product media and never promote channel fallbacks.
- The options page owns independent URL state and read-only provider facts.

Product operations tests under this directory are the executable authority for
layout, filter/count parity, route state, and mutation invalidation. Run:

    npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub
