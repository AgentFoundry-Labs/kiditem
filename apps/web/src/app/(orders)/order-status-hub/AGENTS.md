Consult this document first instead of relying on memorized knowledge.

# web/order-status-hub - Order Status Read Models

`order-status-hub/` owns read-model screens for delivery search, sync checks,
order comparison, order inventory risk, and order status projections. The
canonical `/order-hub` composes delivery search under Shipping and the other
read models under Exceptions; these components keep `h2` headings below the
shell.

## State Rules

- Use route-local `lib/orders-api.ts` for shared order-status API wrappers.
- Keep `order-projection` and `inventory-risk` helpers pure and tested.
- Use `queryKeys.orders.search`, `compare`, `sync`, and related inventory keys
  for server reads.
- Submitted date ranges are UI/query state; backend owns matching and sync
  semantics.

## Boundary Rules

- Do not mutate order, inventory, or shipment state from read-model components.
- Do not duplicate backend sync reconciliation rules in component code.
- If a projection starts driving mutations, move the rule backend-side first.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/order-status-hub
```
