// Tenant scope is owned by the backend via `@CurrentOrganization()`. The
// frontend must never send `organizationId` in API request bodies or query
// strings — that path is untrusted and the backend will ignore it. See
// `apps/web/CLAUDE.md` (API Calls) for the full rule and rationale.

// Local dev sets NEXT_PUBLIC_API_URL=http://localhost:4000. Office leaves it
// empty so nginx routes same-origin `/api/*` directly to NestJS.
//
// When API_BASE points at Nest directly (dev), fetch bypasses Next.js
// `proxy.ts`. The API and web origins must therefore share the same hostname so
// the HttpOnly session cookie remains the sole browser credential — including
// when another device on the LAN opens the dev web app by this machine's IP.
const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export const API_BASE = getApiBase();

export function getApiBase(): string {
  if (!CONFIGURED_API_BASE || typeof window === 'undefined') return CONFIGURED_API_BASE;
  return normalizeLoopbackApiBase(CONFIGURED_API_BASE, window.location.hostname);
}

export function normalizeLoopbackApiBase(apiBase: string, browserHostname: string): string {
  try {
    const url = new URL(apiBase);
    if (isLoopbackHost(url.hostname) && isLocalDevBrowserHost(browserHostname)) {
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
  // web proxy on the same host so both receive the cookie.
  return browserHostname;
}

function isLocalDevBrowserHost(hostname: string): boolean {
  return isLoopbackHost(hostname) || isPrivateNetworkHost(hostname);
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  );
}

// A phone or laptop on the same LAN opens the dev web app by this machine's
// private IP. Follow that host so the API request keeps the browser's origin
// host and its host-only session cookie.
function isPrivateNetworkHost(hostname: string): boolean {
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}
