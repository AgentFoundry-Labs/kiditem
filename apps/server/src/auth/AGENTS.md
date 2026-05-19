# auth — Authentication + Organization Context

`src/auth/` owns global HTTP authentication, organization context, role checks,
Supabase JWT enrichment, and `/api/auth/me`. It is infrastructure, not a
business aggregate.

## Folder Map

```text
auth/
├── decorators/       # @CurrentUser, @CurrentOrganization, @Roles, @SkipAuth
├── guards/           # OrganizationScopeGuard, RolesGuard
├── middleware/       # SupabaseAuthMiddleware
├── auth.controller.ts
├── auth.module.ts
├── auth.types.ts
└── __tests__/
```

## Owned Surfaces

- Global authentication middleware and guards
- Current user/org decorators
- Role metadata and guard behavior
- `GET /api/auth/me`

## Main Data Models

- `User` is the local user mirror.
- `OrganizationMembership` is the source of truth for active organization and
  role.
- `AuthUser` is attached to `req.authUser` with `id`, `organizationId`,
  `membershipId`, `role`, `type`, and `email`.

`User.organizationId` must not return.

## Request Flow

```text
cookie-parser
  -> SupabaseAuthMiddleware
  -> OrganizationScopeGuard
  -> RolesGuard
  -> ThrottlerGuard
  -> @CurrentOrganization / @CurrentUser
  -> service(organizationId, ...)
```

Guard order is intentional: authentication and organization failures happen
before throttling counters.

## Supabase Auth Flow

Token priority:

1. `Authorization: Bearer <token>`
2. legacy `sb-access-token` cookie
3. Supabase SSR `sb-<project-ref>-auth-token` cookie, including chunks

The middleware verifies JWKS issuer/audience with `jose`, maps `payload.sub` to
local `users.id`, and selects one active membership ordered by
`lastSelectedAt desc, joinedAt asc`.

## Boundary Rules

- `@CurrentOrganization()` returns a non-null organization id or throws.
- `@SkipAuth()` bypasses `OrganizationScopeGuard` only; never use it for
  sensitive/admin routes.
- Roles are single string metadata, not arrays or enums.
- Do not mutate `req.authUser` after middleware.
- Do not configure legacy `SUPABASE_JWT_SECRET` verification.
- Do not add dev-auth shortcuts such as `x-dev-user-id`, `?devUserId=`, or
  `NEXT_PUBLIC_DEV_USER_ID`.

## Transitional Exceptions

- Auth stays flat while it remains guard/decorator/middleware infrastructure.
  External account workflows, durable sessions, or mutation invariants require
  explicit ports/adapters.
