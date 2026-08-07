// Tenant scope is owned by the backend via `@CurrentOrganization()`. The
// frontend must never send `organizationId` in API request bodies or query
// strings — that path is untrusted and the backend will ignore it. See
// `apps/web/AGENTS.md` (API Calls) for the full rule and rationale.

// Local dev sets NEXT_PUBLIC_API_URL=http://localhost:4000. Office leaves it
// empty so nginx routes same-origin `/api/*` directly to NestJS.
//
// When API_BASE points at Nest directly (dev), fetch bypasses Next.js
// `proxy.ts`. In that mode `apiClient`'s 401 interceptor is still the only
// absolute-session expiry handling, owned by `lib/auth/session.ts`. See
// `docs/runbooks/auth-office-local.md` for the verification flow.
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
      url.hostname = normalizeBrowserLoopbackHost(browserHostname);
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return apiBase;
  }
}

function normalizeBrowserLoopbackHost(browserHostname: string): string {
  if (browserHostname === '0.0.0.0') return 'localhost';
  // Local auth also uses a host-only HttpOnly cookie. Keep the direct API and
  // web proxy on the same loopback host so both receive the cookie.
  return browserHostname;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  );
}
