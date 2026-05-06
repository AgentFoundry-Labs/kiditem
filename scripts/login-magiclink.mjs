/**
 * 1회용 magic link 생성 — 검증/디버깅 전용.
 * secret key 로 Supabase admin.generateLink 를 호출해 `hashed_token` 만 받고,
 * 우리 `/auth/callback?token_hash=...&type=magiclink&next=/` 로 직접 redirect 가능한
 * URL 을 출력한다.
 *
 * 이 흐름은 PKCE code_verifier 가 필요 없어 admin-generated link 와 호환된다.
 *
 * 사용법:
 *   node scripts/login-magiclink.mjs <email> [next]
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
if (!email) {
  console.error('usage: node scripts/login-magiclink.mjs <email> [next]');
  process.exit(1);
}

const r = await c.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: 'http://localhost:3000/auth/callback' },
});
if (r.error) {
  console.error(r.error);
  process.exit(1);
}

const tokenHash = r.data.properties.hashed_token;
const callbackUrl = `http://localhost:3000/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(next)}`;
console.log(`CALLBACK_URL=${callbackUrl}`);
