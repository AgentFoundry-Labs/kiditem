# auth — Authentication And Authorization Infrastructure

Auth owns global HTTP authentication, organization context, role checks,
Supabase JWT enrichment, and `/api/auth/me`.

Auth stays flat because it is guard/decorator/middleware infrastructure, not a
business aggregate. Keep provider/JWT verification in middleware and guards. If
auth starts owning external account workflows, durable sessions, or mutation
invariants, introduce explicit ports/adapters instead of expanding services.

## Layout

```text
auth/
  decorators/       @CurrentUser, @CurrentOrganization, @Roles, @SkipAuth
  guards/           OrganizationScopeGuard, RolesGuard
  middleware/       SupabaseAuthMiddleware
  auth.controller.ts
  auth.module.ts
  auth.types.ts
  __tests__/
```

## AuthUser

`AuthUser` is populated on `req.authUser`:

```ts
interface AuthUser {
  id: string;
  organizationId: string | null;
  membershipId: string | null;
  role: string;
  type: string;
  email: string;
}
```

`organizationId`, `membershipId`, and `role` come from the active
`OrganizationMembership`. `User` must not regain a direct organization FK.

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

Global guard order is intentional: authentication/organization failures happen
before throttling counters.

## Decorators And Guards

- `@CurrentUser()` returns `AuthUser` or throws `auth_required`.
- `@CurrentOrganization()` returns a non-null organization id or throws
  `auth_required` / `no_organization_context`.
- `@Roles(...roles)` stores string role metadata; no enum and no role array.
- `@SkipAuth()` bypasses `OrganizationScopeGuard` only. Use it for health/public
  routes or `/api/auth/me`; never for sensitive/admin routes.
- `OrganizationScopeGuard` blocks missing auth or null organization context for
  normal HTTP routes.
- `RolesGuard` is pass-through when no role metadata exists; otherwise it checks
  a single string role.

## SupabaseAuthMiddleware

This is the only authentication entrypoint. Token priority:

1. `Authorization: Bearer <token>`
2. legacy `sb-access-token` cookie
3. Supabase SSR `sb-<project-ref>-auth-token` cookie, including chunked cookies

Verification:

- Fetch JWKS from `SUPABASE_URL/auth/v1/.well-known/jwks.json`.
- Verify issuer and audience with `jose`.
- `payload.sub` must map to local `users.id`.
- Select one active membership ordered by `lastSelectedAt desc, joinedAt asc`.
- Missing token/config/JWKS/user/membership is silent in middleware; guards and
  decorators produce the HTTP error.

Use asymmetric JWT verification. Do not configure verification with legacy
`SUPABASE_JWT_SECRET`.

## `/api/auth/me`

`GET /api/auth/me` uses `@SkipAuth()` but still calls `@CurrentUser()`, so
unauthenticated requests return 401 and system/unassigned users can inspect
their own identity. Response matches `@kiditem/shared/auth`.

## Hard Bans

- Per-route `@UseGuards(RolesGuard)`; guards are global.
- Mutating `req.authUser` after middleware.
- Role arrays.
- `User.organizationId`.
- Caching organization id inside decorators.
- `@SkipAuth` on sensitive/admin routes.
- Service-layer default organization lookup.
- `x-dev-user-id`, `?devUserId=`, `NEXT_PUBLIC_DEV_USER_ID`, `DevAuthMiddleware`,
  or `ALLOW_DEV_AUTH_IN_PROD`.

## Change Map

| Change | Also update |
|---|---|
| decorator signature | decorator tests + controller call sites |
| guard logic/order | guard tests + `app.module.ts` providers |
| `AuthUser` | middleware, decorators, guards, controller |
| public auth response | `packages/shared/src/schemas/auth.ts` + controller |
| Supabase verification | middleware tests + `docs/runbooks/auth-supabase.md` |
| metadata keys | decorator and guard together |

## Error Codes

| Code | HTTP | Source |
|---|---|---|
| `auth_required` | 401 | guards/decorators |
| `no_organization_context` | 401 | guard/current-org decorator |
| `insufficient_role` | 403 | RolesGuard |
| `user_not_found` | 404 | `/api/auth/me` local mirror miss |
