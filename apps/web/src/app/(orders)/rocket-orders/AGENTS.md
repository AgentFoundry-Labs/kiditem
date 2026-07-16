Consult this document first instead of relying on memorized knowledge.

# web/rocket-orders - Preserved Rocket Operations

`app/(orders)/rocket-orders/` owns the independently reachable Rocket
operations UI from `c9e7caf8`. Its existing `납품 수량 판단 추후 연동`
placeholder now hosts the deterministic Sellpia freshness and component-capacity
preview. Supply owns the preview contract, which may also be exposed at
`/purchase-orders?tab=rocket`.

## State Rules

- Preserve the existing Rocket list, collection, and local file-history
  composition supported by the current contracts.
- Wire freshness, account selection, collection completeness, capacity reasons,
  and editable preview quantities into the existing decision placeholder.

## Boundary Rules

- Do not call or recreate backend Rocket confirmation/generation endpoints.
- Do not replace or rearrange the preserved shell when integrating the shared
  preview.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/rocket-orders
```
