import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * 보호 라우트 가드 — Supabase 세션 쿠키가 없으면 `/login?next=<원래 경로>` 로 리다이렉트.
 * 인증된 사용자가 `/login` 직접 접근 시 `/` 로 리다이렉트.
 *
 * `NEXT_PUBLIC_SUPABASE_*` 키가 없으면 보호 라우트는 로그인으로 보낸다.
 */
const PUBLIC_PATHS = ['/login', '/auth'];

/**
 * Same-origin transport for the AI chat runtime. The browser hits
 * `/api/chat/copilot[...]`, Next rewrites it to Nest (see
 * `apps/web/next.config.mjs`). The proxy must NOT redirect these to
 * `/login` because the caller is `fetch`/SSE, not a navigation — Nest
 * already returns JSON `401 auth_required` when the cookie is missing,
 * which CopilotKit can surface to the user. Returning a 307 to `/login`
 * here would corrupt the SSE stream and break the chat UI on first
 * unauthenticated load.
 */
const TRANSPORT_BYPASS_PATHS = ['/api/chat/copilot'];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const isTransportBypass = TRANSPORT_BYPASS_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  if (isTransportBypass) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    if (isPublic) return NextResponse.next();
    return redirectToLogin(req, path);
  }

  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  if (!claims && !isPublic) {
    return redirectToLogin(req, path);
  }
  if (claims && path === '/login') {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return res;
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
