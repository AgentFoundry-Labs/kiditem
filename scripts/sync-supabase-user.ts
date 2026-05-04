/**
 * Supabase auth.users → local `users` 테이블 미러 + 활성 `OrganizationMembership` 보장.
 *
 * 사용법:
 *   npx tsx scripts/sync-supabase-user.ts \
 *     --email you@example.com \
 *     --organizationId <organization-uuid> \
 *     [--role admin|owner|member] \
 *     [--name "표시명"]
 *
 * 필요 env (루트 `.env`):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY    (Settings → API → service_role, 절대 커밋 금지)
 *   DATABASE_URL                 (local Postgres)
 *
 * 역할:
 *   1. Supabase auth.users 에서 이메일로 사용자 조회 (대시보드/Sign Up 으로 선 생성 필수).
 *   2. local `users` 테이블에 id = auth.users.id 로 upsert.
 *   3. `OrganizationMembership` 을 (organizationId, userId) 유니크로 upsert (status='active').
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '..', '.env') });

import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

interface Args {
  email: string;
  organizationId: string;
  role: string;
  name: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (k: string): string | undefined => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = get('email');
  if (!email) throw new Error('--email required');
  const organizationId = get('organizationId');
  if (!organizationId) {
    throw new Error('--organizationId required (한 명의 사용자는 항상 1개 이상의 조직에 속해야 한다)');
  }
  return {
    email,
    organizationId,
    role: get('role') ?? 'admin',
    name: get('name') ?? email.split('@')[0],
  };
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.');
  }
  const { email, organizationId, role, name } = parseArgs();

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Supabase 에서 해당 이메일 유저 찾기 (대시보드 → Authentication → Add User 로 선 생성).
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const supaUser = data.users.find((u) => u.email === email);
  if (!supaUser) {
    throw new Error(
      `Supabase 에 ${email} 유저가 없습니다. 먼저 Supabase Dashboard → Authentication → Add User → "Auto Confirm User: ON" 로 생성하세요.`,
    );
  }

  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://kiditem:kiditem@localhost:5433/kiditem';
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    // 2. Organization 존재 검증 (FK 위반 사전 차단).
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new Error(
        `organizationId=${organizationId} 가 organizations 테이블에 없습니다. \`SELECT id, name FROM organizations LIMIT 5;\` 로 확인하세요.`,
      );
    }

    // 3. local users upsert — id = Supabase auth.users.id 동일 UUID.
    const user = await prisma.user.upsert({
      where: { id: supaUser.id },
      update: { email, name },
      create: { id: supaUser.id, email, name, type: 'human', role: 'member' },
    });

    // 4. OrganizationMembership upsert — (organizationId, userId) 유니크.
    const membership = await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      update: { role, status: 'active' },
      create: { organizationId, userId: user.id, role, status: 'active' },
    });

    console.log(
      `synced: user=${user.id} (${email}), organization=${organization.id} (${organization.name}), membership=${membership.id} role=${role}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
