import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * 보호 라우트 가드 — Supabase 세션 쿠키가 없으면 `/login?next=<원래 경로>` 로 리다이렉트.
 * 인증된 사용자가 `/login` 직접 접근 시 `/` 로 리다이렉트.
 *
 * `NEXT_PUBLIC_SUPABASE_*` 키가 없으면 통과 (지원 환경 점진 셋업).
 */
const PUBLIC_PATHS = ['/login', '/auth'];

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(url, anon, {
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

  const { data: { user } } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', path);
    return NextResponse.redirect(redirectUrl);
  }
  if (user && path === '/login') {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    // _next, 정적 자원, favicon, 파일 확장자가 있는 경로 제외.
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
