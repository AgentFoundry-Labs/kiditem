# auth — Authentication + Organization Context

`src/auth/` owns global HTTP authentication, organization context, role checks,
local password/session authentication, and `/api/auth/*`. It is infrastructure, not a
business aggregate.

## Authority

- `User` owns the nullable scrypt password hash. Account creation remains an
  explicit data/bootstrap operation, not an auth side effect.
- `AuthSession` stores only a SHA-256 token hash plus absolute expiry and
  revocation timestamps. Raw tokens never enter the database or logs.
- `OrganizationMembership` is the source of truth for active organization and
  role.
- `AuthUser` is attached to `req.authUser` with `id`, `organizationId`,
  `membershipId`, `role`, `type`, and `email`.

`User.organizationId` must not return.

## Request Flow

```text
cookie-parser
  -> SessionAuthMiddleware
  -> OrganizationScopeGuard
  -> RolesGuard
  -> ThrottlerGuard
  -> @CurrentOrganization / @CurrentUser
  -> service(organizationId, ...)
```

Guard order is intentional: authentication and organization failures happen
before throttling counters.

## Local Session Flow

Browser requests authenticate only with the HttpOnly `kiditem_session` cookie.
`POST /api/auth/login` verifies the normalized email and scrypt hash, creates
an independent 30-day session, sets the raw opaque token only in that cookie,
and returns the public user projection. The middleware hashes the presented
credential, loads an unrevoked/unexpired session, verifies the user is active,
and selects one active membership ordered by `lastSelectedAt desc, joinedAt
asc`.

`GET /api/auth/me` is the UI authentication-state check. Chrome extensions
receive the current token only from the explicit authenticated
`POST /api/auth/extension-handoff` boundary. Extension API calls then use the
same hashed local-session lookup and organization context.

## Boundary Rules

- `@CurrentOrganization()` returns a non-null organization id or throws.
- `@SkipAuth()` bypasses `OrganizationScopeGuard`; middleware still attaches a
  valid optional session. Use it only where the controller explicitly owns the
  unauthenticated case, such as login and logout.
- Roles are single string metadata, not arrays or enums.
- Do not mutate `req.authUser` after middleware.
- Password changes and administrative revocation must revoke all existing
  sessions. CLI password input is stdin-only and must never accept argv values.
- Do not restore Supabase Auth/JWT/JWKS or legacy auth cookies.
- Do not add dev-auth shortcuts such as `x-dev-user-id`, `?devUserId=`, or
  `NEXT_PUBLIC_DEV_USER_ID`.
