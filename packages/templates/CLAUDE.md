Before working in this directory, always read this document first rather than relying on memory.

# packages/templates — Detail Page Templates

`packages/templates/` owns React template components and Zod schemas for Coupang
product detail pages. It is consumed by AI/detail-page rendering and editor
surfaces.

## Template Rules

- `parseDetailPageData()` converts snake_case API responses to camelCase
  template data.
- Theme customization uses CSS custom properties such as
  `--theme-color-main`.
- `layout.components[].enabled` controls per-section visibility.
- Adding a template means creating `src/templates/{id}/` and registering it in
  `getTemplate()`.
- Template data contracts belong in package schemas, not route-local frontend
  types.

## Boundary Rules

- Keep templates limited to render components and schemas. Put data fetching,
  Prisma access, and provider SDK logic in the owning backend module.
- Keep template-specific style/assets inside the template folder unless 2+
  templates share them.

## Verification

```bash
cd packages/templates && npm run build
```
