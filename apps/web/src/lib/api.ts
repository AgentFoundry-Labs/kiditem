// Tenant scope is owned by the backend via `@CurrentOrganization()`. The
// frontend must never send `organizationId` in API request bodies or query
// strings — that path is untrusted and the backend will ignore it. See
// `apps/web/AGENTS.md` (API Calls) for the full rule and rationale.

// Local dev sets NEXT_PUBLIC_API_URL=http://localhost:4000. Staging/prod leave
// it empty so nginx/ALB routes same-origin `/api/*` directly to NestJS.
const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export const API_BASE = getApiBase();

export function getApiBase(): string {
  if (!CONFIGURED_API_BASE || typeof window === 'undefined') return CONFIGURED_API_BASE;
  return normalizeLoopbackApiBase(CONFIGURED_API_BASE, window.location.hostname);
}

export function normalizeLoopbackApiBase(apiBase: string, browserHostname: string): string {
  try {
    const url = new URL(apiBase);
    if (isLoopbackHost(url.hostname) && isLoopbackHost(browserHostname)) {
      url.hostname = browserHostname;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return apiBase;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
