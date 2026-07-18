Consult this document first instead of relying on memorized knowledge.

# web/rocket-orders - Preserved Rocket Operations

`app/(orders)/rocket-orders/` owns the independently reachable Rocket
operations UI from `c9e7caf8`. Its existing `납품 수량 판단 추후 연동`
placeholder now hosts the deterministic Sellpia freshness, component-capacity,
and confirmation workspace. Supply owns the action contract and shared preview
components; `/rocket-orders` is the only operator-facing Rocket review route.

## State Rules

- Preserve the existing Rocket list, collection, and local file-history
  composition supported by the current contracts.
- Wire freshness, account selection, collection completeness, capacity reasons,
  editable quantities, confirmation/workbook, and allocation release into the
  existing decision placeholder.
- A quantity edit makes the preview dirty and disables confirmation. The
  operator must run one whole-preview revalidation; retained edits are sent
  together and the server returns the effective shared-capacity allocation.
- Render the server commitment list independently of transient workbook state
  so refresh preserves request/final status and release/settle actions.

## Boundary Rules

- Use only the Supply `/api/purchase-orders` action contract. Do not call or
  recreate `/api/orders/rocket/*` confirmation/generation endpoints.
- Confirmation must not call a marketplace provider or mutate Sellpia physical
  stock.
- Display `currentStock`, `activeCommitmentQuantity`, and `availableStock`
  separately. Final-order settlement is enabled only after a newer verified
  Sellpia generation.
- Do not replace or rearrange the preserved shell when integrating the shared
  preview.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/rocket-orders
```
