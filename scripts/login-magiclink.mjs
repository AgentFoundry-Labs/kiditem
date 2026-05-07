/**
 * 1회용 magic link 생성 — 검증/디버깅 전용.
 * secret key 로 Supabase admin.generateLink 를 호출해 `hashed_token` 만 받고,
 * 우리 `/auth/callback?token_hash=...&type=magiclink&next=/` 로 직접 redirect 가능한
 * URL 을 출력한다.
 *
 * 이 흐름은 PKCE code_verifier 가 필요 없어 admin-generated link 와 호환된다.
 *
 * 사용법:
 *   node scripts/login-magiclink.mjs <email> [next] [web-origin]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error('SUPABASE_URL + SUPABASE_SECRET_KEY 가 .env 에 필요합니다.');
  process.exit(1);
}

const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = process.argv[2];
const next = process.argv[3] ?? '/';
const webOrigin = normalizeWebOrigin(
  process.argv[4] ?? process.env.DEV_WEB_ORIGIN ?? 'http://localhost:3000',
);
if (!email) {
  console.error('usage: node scripts/login-magiclink.mjs <email> [next] [web-origin]');
  process.exit(1);
}

const r = await c.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: `${webOrigin}/auth/callback` },
});
if (r.error) {
  console.error(r.error);
  process.exit(1);
}

const tokenHash = r.data.properties.hashed_token;
const callbackUrl = `${webOrigin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(next)}`;
console.log(`CALLBACK_URL=${callbackUrl}`);

function normalizeWebOrigin(input) {
  const origin = String(input ?? '').trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('unsupported protocol');
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('origin must not include path, query, or hash');
    }
    return parsed.origin;
  } catch {
    console.error(`invalid web origin: ${input}`);
    process.exit(1);
  }
}
