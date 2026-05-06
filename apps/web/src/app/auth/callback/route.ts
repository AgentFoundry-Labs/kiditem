import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeInternalRedirectPath } from '@/lib/auth-redirect';

/**
 * Auth callback — 두 흐름 지원:
 *
 *  1) `?token_hash=<hash>&type=magiclink|recovery|invite` — admin.generateLink 또는
 *     verifyOtp 로 발급한 link. PKCE code_verifier 없이도 동작.
 *  2) `?code=<authCode>` — OAuth (Google/GitHub) PKCE flow. 클라이언트가 시작한 흐름이므로
 *     `code_verifier` 쿠키가 보장됨.
 *
 * Route Handler 에서는 `cookies()` 가 read-only 이므로 supabase client 의 cookie
 * setter 를 redirect response 객체에 바인딩한다.
 */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const type = req.nextUrl.searchParams.get('type');
  const code = req.nextUrl.searchParams.get('code');
  const next = sanitizeInternalRedirectPath(req.nextUrl.searchParams.get('next'));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if ((!tokenHash || !type) && !code) {
    return NextResponse.redirect(new URL(next, req.url));
  }
  if (!url || !publishableKey) {
    return NextResponse.redirect(new URL(next, req.url));
  }

  const res = NextResponse.redirect(new URL(next, req.url));
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  let error: { message: string } | null = null;
  if (tokenHash && type) {
    const r = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'magiclink' | 'recovery' | 'invite' | 'signup' | 'email_change' | 'email',
    });
    error = r.error;
  } else if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code);
    error = r.error;
  }

  if (error) {
    const fallback = req.nextUrl.clone();
    fallback.pathname = '/login';
    fallback.searchParams.set('next', next);
    fallback.searchParams.set('error', error.message);
    return NextResponse.redirect(fallback);
  }
  return res;
}
