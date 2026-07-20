Consult this document first instead of relying on memorized knowledge.

# web/components - Shared Frontend Components

`src/components/` owns shared React components used by multiple route groups:
layout, providers, panel, chat, generic product/coupang widgets, and reusable
UI primitives. Route-local UI should stay inside `src/app/(group)/route/`.

## Ownership Rules

- Promote a component here only after at least two route groups need it or it is
  part of the app shell.
- Keep domain-specific copy, query keys, and mutations route-local unless the
  component is intentionally a shared domain surface.
- Shared components may call `apiClient` only when the component owns a global
  app-shell concern such as readiness, chat, panel, or provider behavior.
- Prefer props for route-specific actions over importing route-local APIs.
- `sellpia-inventory/` is the app-shell freshness surface: one compact status,
  one drawer, per-file manual attestation fallback, authoritative completed
  current basis, and unified history. Established operations screens keep the
  floating compact status; `/product-hub/matching` renders its intentional
  inline copy instead. All placements open the same single drawer.

## Styling Rules

- Use Tailwind plus `cn()` from `@/lib/utils`.
- Use semantic CSS variables for edited shared UI.
- Use Lucide React for icons when an icon exists.
- Keep text and controls responsive; shared components are reused in dense
  operational screens.

## Boundary Rules

- Do not put page-specific sections here to avoid route ownership drift.
- Do not add global state when local props or route-local hooks are enough.
- Provider, panel, and UI primitive changes require checking their nested
  AGENTS guide first.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/components
```
