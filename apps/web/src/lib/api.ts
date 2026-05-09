// Tenant scope is owned by the backend via `@CurrentOrganization()`. The
// frontend must never send `organizationId` in API request bodies or query
// strings — that path is untrusted and the backend will ignore it. See
// `apps/web/AGENTS.md` (API Calls) for the full rule and rationale.

// Local dev sets NEXT_PUBLIC_API_URL=http://localhost:4000. Staging/prod leave
// it empty so nginx/ALB routes same-origin `/api/*` directly to NestJS.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
