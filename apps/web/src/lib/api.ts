// Tenant scope is owned by the backend via `@CurrentCompany()`. The
// frontend must never send `companyId` in API request bodies or query
// strings — that path is untrusted and the backend will ignore it. See
// `apps/web/AGENTS.md` (API Calls) for the full rule and rationale.

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
