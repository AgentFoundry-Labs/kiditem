Consult this document first instead of relying on memorized knowledge.

# product-hub - Catalog Product Operations

`app/(catalog)/product-hub/` owns the public product catalog list, product
detail, product options, and catalog-local product actions. It backs
`/product-hub`, `/product-hub/[id]`, and `/product-hub/options`.

## Folder Map

```text
product-hub/
├── page.tsx
├── [id]/
│   ├── page.tsx
│   ├── components/
│   └── hooks/
├── components/
├── hooks/
├── lib/
├── matching/
└── options/
```

## Data Flow

```text
React Query + apiClient
  -> /api/products/*
  -> /api/products/options/*
  -> queryKeys.products, productOptions
```

## State Rules

- Use `queryKeys.products.*` for master product reads and invalidation.
- Keep product action mutations in route-local hooks.
- Put pure grading/export/page-model helpers in `lib/` and cover behavior with
  focused tests when rules change.
- Product option mutations invalidate `queryKeys.productOptions.all`.

## Boundary Rules

- Do not add a sibling legacy products implementation scope or public products
  alias route.
- Do not create sourcing candidates or generated content workspaces here.
- Do not duplicate backend catalog or traffic-upload validation rules in UI
  state.
- Workflow actions shown on product detail pages are backend workflow triggers;
  browser code does not implement workflow execution.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(catalog\)/product-hub
npm run build --workspace=apps/web
```
