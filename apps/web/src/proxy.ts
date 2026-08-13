import { NextResponse, type NextRequest } from 'next/server';
import type { AuthRequiredErrorBody } from '@kiditem/shared/auth';

/**
 * 보호 라우트 가드 — KidItem 세션 쿠키가 없으면:
 *   - navigation (HTML 요청)    → `/login?next=<원래 경로>` 307 redirect
 *   - fetch caller (`/api/*` 또는 `Accept: application/json`) → 401 JSON
 *
 * fetch caller 에게 307 을 주면 브라우저가 redirect 를 따라가 `/login` HTML 을
 * 받아오고, apiClient 가 JSON.parse 폭발해 사용자에게 의미 없는 에러가 노출됨.
 * Backend `GlobalExceptionFilter` 의 401 응답 envelope 와 byte-level 동일하게
 * `{ statusCode, error, message, timestamp, path }` 를 emit 해 apiClient 가
 * dev 직결 path 와 prod proxy path 양쪽에서 동일하게 인터셉트 가능.
 *
 * 이 계층은 쿠키 존재만 확인한다. 만료/폐기/사용자·조직 검증 권한은 NestJS의
 * SessionAuthMiddleware에 있다. `/login`은 stale cookie redirect loop 방지를 위해
 * 항상 public이다.
 */
const PUBLIC_PATHS = ['/login'];
const AUTH_SESSION_COOKIE = 'kiditem_session';

/**
 * Same-origin transport for the AI chat runtime. The browser hits
 * `/api/copilotkit[...]`, Next rewrites it to the interaction gateway (see
 * `apps/web/next.config.mjs`). The proxy must NOT redirect these to
 * `/login` because the caller is `fetch`/SSE, not a navigation — Nest
 * already returns JSON `401 auth_required` when the cookie is missing,
 * which CopilotKit can surface to the user. Returning a 307 to `/login`
 * here would corrupt the SSE stream and break the chat UI on first
 * unauthenticated load.
 */
const TRANSPORT_BYPASS_PATHS = ['/api/copilotkit'];

function isApiFetchCaller(req: NextRequest, path: string): boolean {
  if (path.startsWith('/api/')) return true;
  const accept = req.headers.get('accept') ?? '';
  return accept.includes('application/json');
}

function authRequiredJsonResponse(path: string): NextResponse {
  const body: AuthRequiredErrorBody = {
    statusCode: 401,
    error: 'Unauthorized',
    message: 'auth_required',
    timestamp: new Date().toISOString(),
    path,
  };
  return NextResponse.json(body, { status: 401 });
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const isTransportBypass = TRANSPORT_BYPASS_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  if (isTransportBypass) {
    return NextResponse.next();
  }

  if (isPublic) return NextResponse.next();
  if (!req.cookies.has(AUTH_SESSION_COOKIE)) {
    if (isApiFetchCaller(req, path)) return authRequiredJsonResponse(path);
    return redirectToLogin(req, path);
  }
  return NextResponse.next({ request: req });
}

function redirectToLogin(req: NextRequest, nextPath: string) {
  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = '/login';
  redirectUrl.searchParams.set('next', nextPath);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    // _next, 정적 자원, favicon, 파일 확장자가 있는 경로 제외.
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
