// Tenant scope is owned by the backend via `@CurrentOrganization()`. The
// frontend must never send `organizationId` in API request bodies or query
// strings — that path is untrusted and the backend will ignore it. See
// `apps/web/AGENTS.md` (API Calls) for the full rule and rationale.

// Local dev sets NEXT_PUBLIC_API_URL=http://localhost:4000. Staging/prod leave
// it empty so nginx/ALB routes same-origin `/api/*` directly to NestJS.
//
// Auth refresh path implication: when API_BASE points at Nest directly (dev),
// fetch bypasses Next.js `proxy.ts` which would otherwise pre-refresh tokens
// on every request. In that mode `apiClient`'s 401 interceptor is the *only*
// refresh trigger, backed by the mutex in `lib/supabase/refresh.ts`. See
// `docs/runbooks/dev-preview-with-auth.md` for the verification flow.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
