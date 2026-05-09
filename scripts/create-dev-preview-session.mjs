/**
 * Dev preview session callback 생성 — 검증/디버깅 전용.
 *
 * 제품 로그인 방식이 아니다. 격리된 preview 브라우저가 같은 Supabase 세션
 * 쿠키/JWT 경로로 들어가도록 Supabase admin.generateLink 를 사용한다.
 *
 * URL 을 만들기 전에 다음을 모두 확인한다.
 *   1. Supabase auth.users 에 email 이 존재한다.
 *   2. local users 테이블에 같은 id 로 mirror 되어 있다.
 *   3. active OrganizationMembership 이 하나 이상 있다.
 *
 * 사용법:
 *   node scripts/create-dev-preview-session.mjs <email> [next] [web-origin]
 */
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !process.env.DATABASE_URL) {
  console.error('SUPABASE_URL + SUPABASE_SECRET_KEY + DATABASE_URL 이 .env 에 필요합니다.');
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
  console.error('usage: node scripts/create-dev-preview-session.mjs <email> [next] [web-origin]');
  process.exit(1);
}

const supabaseUser = await findSupabaseUser(email);
if (!supabaseUser) {
  console.error(
    `Supabase auth.users 에 ${email} 유저가 없습니다. dev preview session 을 만들 수 없습니다.`,
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let identity;
try {
  identity = await loadLocalPreviewIdentity(prisma, supabaseUser.id, email);
} finally {
  await prisma.$disconnect();
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
console.log(`PREVIEW_USER_ID=${identity.userId}`);
console.log(`PREVIEW_USER_EMAIL=${identity.email}`);
console.log(`PREVIEW_ORGANIZATION_ID=${identity.organizationId}`);
console.log(`PREVIEW_MEMBERSHIP_ID=${identity.membershipId}`);

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

async function findSupabaseUser(targetEmail) {
  const normalized = targetEmail.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await c.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error(error);
      process.exit(1);
    }
    const found = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function loadLocalPreviewIdentity(prisma, userId, targetEmail) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { status: 'active' },
        orderBy: [{ lastSelectedAt: 'desc' }, { joinedAt: 'asc' }],
        take: 1,
      },
    },
  });
  if (!user) {
    console.error(
      `local users mirror 가 없습니다: supabaseUserId=${userId}. ` +
        `npx tsx scripts/sync-supabase-user.ts --email ${targetEmail} --organizationId <uuid> 를 먼저 실행하세요.`,
    );
    process.exit(1);
  }

  const membership = user.memberships[0];
  if (!membership) {
    console.error(
      `active OrganizationMembership 이 없습니다: user=${user.id} (${targetEmail}). ` +
        'preview 검증은 organizationId 가 있는 세션만 허용합니다.',
    );
    process.exit(1);
  }

  return {
    userId: user.id,
    email: user.email,
    organizationId: membership.organizationId,
    membershipId: membership.id,
  };
}
