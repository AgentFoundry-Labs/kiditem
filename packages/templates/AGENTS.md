Consult this document first instead of relying on memorized knowledge.

# packages/templates — Detail Page Templates

`packages/templates/` owns React template components and Zod schemas for Coupang
product detail pages. It is consumed by AI/detail-page rendering and editor
surfaces.

## Folder Map

```text
packages/templates/
├── src/
│   ├── templates/{id}/     # template component and local assets/styles
│   ├── schemas/            # template data schemas
│   └── index.ts            # getTemplate, parseDetailPageData, exports
├── package.json
└── tsup.config.ts
```

## Owned Surfaces

- `@kiditem/templates`
- `getTemplate(id)`
- `parseDetailPageData(apiResponse)`
- Template React components and layout schemas

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

- Templates are render components and schemas only; do not add backend data
  fetching, Prisma access, or provider SDK logic.
- Keep template-specific style/assets inside the template folder unless 2+
  templates share them.

## Verification

```bash
cd packages/templates && npm run build
```
