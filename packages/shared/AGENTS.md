Consult this document first instead of relying on memorized knowledge.

# packages/shared — @kiditem/shared

`packages/shared/` owns frontend/backend Zod schemas, TypeScript contracts, and
shared error codes. It is a contract package, not a backend implementation
package.

## Owned Surfaces

- Public Zod schemas shared by server and web
- Shared TypeScript types inferred from schemas
- Focused `@kiditem/shared/*` subpath exports
- Compatibility root exports while consumers migrate

## Export Policy

- Treat `src/index.ts` and `src/schemas/index.ts` as compatibility surfaces.
- New or rebuilt domain contracts add focused subpath exports first, such as
  `@kiditem/shared/product`, `@kiditem/shared/inventory`, and
  `@kiditem/shared/errors`.
- New domain schemas/types must not expand the root barrel.
- Keep root exports only while migrating existing consumers; remove them after
  server and web builds prove no direct consumers remain.
- Backend-only concepts must not leak into frontend-facing root exports.
- Do not add legacy aliases during migration.

## Schema Rules

- Exported Zod values use PascalCase `FooSchema`.
- Exported TypeScript types use `export type Foo = z.infer<typeof FooSchema>`.
- Do not write separate interfaces for schema-derived contracts.
- Date fields use `zIsoDate` so Prisma `Date` and JSON strings both parse.
- Entity subset responses should derive with `.omit()` / `.pick()`.
- Split schemas by domain, for example `schemas/product.ts` and
  `schemas/order.ts`.

## Prisma Drift Guard

Backend service methods returning shared types close object literals with
`satisfies <SharedType>` so Prisma-row and shared-Zod drift is caught at compile
time.

```typescript
return items.map((item) => ({
  id: item.id,
  name: item.name,
} satisfies ProductCatalogListItem));
```

Prisma `JsonValue` fields must be narrowed during mapping, for example
`permissions: item.permissions as Record<string, unknown> | null`.

## Boundary Rules

- Shared contracts stay framework-neutral: no NestJS decorators, Prisma client,
  browser-only APIs, or backend provider SDKs.
- Add a package subpath export before importing a new shared domain from server
  or web.
- Prefer canonical schema/type names over aliases.

## Verification

After shared changes:

```bash
cd packages/shared && npm run build
```

If server services were changed and they return shared types, check the touched
services for missing `satisfies` closures.
