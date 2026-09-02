# Office Local Authentication Implementation Plan

> Execute in the existing `develop` working tree. The user explicitly declined
> an isolated worktree and asked that reviews run only when needed, not after
> every task.

**Goal:** Replace Supabase user authentication with KidItem-owned email/password
authentication and revocable 30-day sessions that work across Office browsers
and the Chrome extensions, while preserving the existing organization-scoped
`AuthUser` request contract.

**Architecture:** NestJS owns password verification, opaque session issuance,
session revocation, and request enrichment. PostgreSQL stores scrypt password
hashes and SHA-256 hashes of opaque session tokens. The web app stores the raw
token only in browser storage, also receives it in an HttpOnly cookie, and
sends the same token to the Chrome extension. Organization membership remains
the sole tenant boundary.

**Release scope:** Staging has already been retired reversibly. This plan makes
the Office deployment self-contained for auth; it does not destroy staging,
its EC2 host, database, volumes, or Supabase infrastructure.

---

## Task 1: Persistence and shared auth contracts

**Files:**

- Modify: `prisma/models/core.prisma`
- Modify: `packages/shared/src/schemas/auth.ts`
- Modify focused shared auth exports/tests if present
- Modify generated Prisma navigation artifacts required by repository checks

1. Add failing schema/contract tests for a 30-day opaque session response.
2. Rename the Prisma `User.password` property to `passwordHash` while keeping
   `@map("password")` so the database column is preserved.
3. Add `AuthSession` with UUID id, user relation, unique token hash, created,
   expiry, and nullable revoked timestamps, plus foreign-key/expiry indexes.
4. Add focused schemas for login request, public auth user, public session, and
   login response without expanding unrelated barrels.
5. Run the focused shared tests/build and `prisma generate`.

## Task 2: NestJS local authentication boundary

**Files:**

- Create/modify files under `apps/server/src/auth/`
- Modify: `apps/server/src/app.module.ts`
- Modify: `apps/server/src/main.ts`
- Modify: `apps/server/e2e/helpers/mock-prisma.ts`
- Modify: `apps/server/package.json`

1. Add failing unit tests for password hashing/verification, opaque token
   hashing, login, single-session logout, all-session revocation, expiry,
   inactive users, missing membership, and generic invalid credentials.
2. Implement scrypt hashes in versioned form
   `scrypt$16384$<salt-base64url>$<digest-base64url>` using 16-byte salts,
   64-byte keys, bounded password lengths, and timing-safe comparison.
3. Implement 32-byte base64url session tokens, SHA-256 persistence hashes, and
   30-day absolute expiry. Store only token hashes.
4. Replace `SupabaseAuthMiddleware` with provider-neutral session middleware:
   Bearer token first, then `kiditem_session` cookie; load one active
   membership ordered by `lastSelectedAt desc, joinedAt asc`; keep the existing
   `req.authUser` shape.
5. Add `POST /api/auth/login`, `POST /api/auth/logout`, and retain
   `GET /api/auth/me`. Login is skipped by the org guard, rate-limited, sets an
   HttpOnly SameSite=Lax cookie, and returns the raw token for extension sync.
6. Replace manual Supabase middleware use in the raw Copilot route.
7. Add a stdin-only administrator CLI for `set-password` and
   `revoke-sessions`; password changes revoke all existing sessions.
8. Remove server auth-only `jose` dependency if unused and run focused auth
   tests plus server build/boot.

## Task 3: Next.js browser and extension session transport

**Files:**

- Create: `apps/web/src/lib/auth/session.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/lib/extension-auth.ts`
- Modify: `apps/web/src/components/providers/AuthProvider.tsx`
- Modify: `apps/web/src/hooks/useAuth.ts`
- Modify: `apps/web/src/app/login/hooks/useLoginForm.ts`
- Modify: `apps/web/src/components/panel/lib/panel-sse-client.ts`
- Modify: `apps/web/src/proxy.ts`
- Delete obsolete Supabase auth client/callback files after consumers migrate

1. Add failing tests for browser storage parsing, expiry, cross-tab events,
   login persistence, logout, 401 sign-out, proxy redirects/JSON failures,
   panel bearer headers, and extension token synchronization.
2. Store `{token, expiresAt}` at `kiditem.auth.session.v1`; reject malformed or
   expired values and notify same-tab/cross-tab subscribers.
3. Make `apiClient` send the local bearer token with credentials. On
   `auth_required`, clear local state once and redirect through the provider;
   do not refresh or retry an expired local session.
4. Convert login and `AuthProvider` to local sessions, preserve `/auth/me`
   organization validation, sync the same token to extensions, and expire on
   an absolute timer.
5. Convert Panel SSE and `useAuth`; make the Next proxy use cookie presence as
   an early route gate while NestJS remains the validation authority.
6. Remove web Supabase auth packages/files and run focused tests plus web build.

## Task 4: Office deployment and durable operational guidance

**Files:**

- Modify: `deploy/office/apply-deployment.ps1`
- Modify: `deploy/office/compose.office.yml`
- Modify: `deploy/office/office.env.example`
- Modify: `.github/workflows/office-images.yml`
- Modify staging/production image workflows only for obsolete web auth args
- Modify auth/environment/Office runbooks and script inventory
- Delete obsolete Supabase-auth-only scripts when no callers remain

1. Add contract tests for no Office Supabase auth variables and for an explicit
   Office schema-apply deployment switch.
2. Add an explicit `-ApplySchema` deploy-only path that starts database
   dependencies and runs Prisma `db push` from the candidate API image before
   the application starts. Document that runtime rollback cannot roll back the
   database schema.
3. Remove Supabase auth build/runtime variables while retaining unrelated
   Supabase storage/data-rebuild variables still owned by other workflows.
4. Add an Office local-auth runbook covering initial password setup, session
   revocation, verification from multiple PCs/extensions, backup, and rollback
   limits.
5. Remove obsolete auth-only scripts/docs and update durable script inventory.

## Task 5: Integration verification and one risk-based review

1. Run focused auth/server/web/extension/script contract suites under Node 22.
2. Run Prisma gates: `db:push`, `prisma generate`, shared build, ERD, Graphify.
3. Run server build and boot, web production build, script inventory/tests,
   conventions, and relevant deploy contract tests.
4. Perform one final security review of password handling, token persistence,
   tenant selection, revocation, cookie behavior, Office HTTP constraints, and
   extension token exposure. Fix findings and rerun affected gates.
5. Update the execution ledger with exact evidence. Do not claim live Office
   rollout until a Windows Office operator applies and verifies the bundle.
