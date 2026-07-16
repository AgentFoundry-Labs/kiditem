Consult this document first instead of relying on memorized knowledge.

# web/rocket-orders - Preserved Rocket Operations

`app/(orders)/rocket-orders/` owns the independently reachable pre-SDD Rocket
operations UI. The deterministic component-capacity preview is an additive,
separate surface at `/purchase-orders?tab=rocket` and belongs to Supply.

## State Rules

- Preserve the existing Rocket list, collection, and local file-history
  composition supported by the current contracts.
- Keep Sellpia freshness status and links to the preview additive to the
  existing page.

## Boundary Rules

- Do not call or recreate backend Rocket confirmation/generation endpoints.
- Do not embed the Supply preview as a replacement for the preserved page.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/rocket-orders
```
