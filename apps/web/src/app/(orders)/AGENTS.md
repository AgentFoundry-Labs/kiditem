# web/orders — Collection, Processing, Rocket, And Reviews

`app/(orders)/` owns the active order collection, order processing, Rocket PO
review, and review screens. Backend state uses the Orders/Reviews query-key
families and NestJS owner APIs; generated files may use `fetchRaw()`.

## Boundaries

- Marketplace page access uses the unified extension bridge, never web-page
  scraping or direct page mutation.
- Order collection and order processing remain independent active routes.
- Products owns channel-option recipe repair. Rocket may create an empty recipe
  or replace a reviewed complete recipe through Products' optimistic APIs; it
  never edits physical stock.
- Rocket catalog and preview use Supply's purchase-order action contract and do
  not create Inventory commitments.
- Sellpia submission is a durable Orders transmission request. Prepare the
  stable intent before extension IO, finalize only observed submission, and
  abort only explicit confirmed non-submission. Unknown outcomes remain
  reconcilable and do not trigger Inventory work.
- Extension-backed local errors may suppress the global query toast. Local file
  history is convenience state, not order authority.

The nested guides own the preserved collection and Rocket layouts; their
focused specs are the executable composition contract.
