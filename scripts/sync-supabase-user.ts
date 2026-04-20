/**
 * Supabase auth.users 를 local `users` 테이블로 mirror.
 *
 * 사용법:
 *   npx tsx scripts/sync-supabase-user.ts --email you@example.com [--companyId <uuid>] [--role admin]
 *
 * 필요 env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (Settings → API → service_role, 절대 커밋 금지)
 *   DATABASE_URL               (local Postgres)
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '..', '.env') });

import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function parseArgs(): { email: string; companyId?: string; role: string; name: string } {
  const args = process.argv.slice(2);
  const get = (k: string): string | undefined => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = get('email');
  if (!email) throw new Error('--email required');
  return {
    email,
    companyId: get('companyId'),
    role: get('role') ?? 'admin',
    name: get('name') ?? email.split('@')[0],
  };
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required in .env');
  }
  const { email, companyId, role, name } = parseArgs();

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Supabase 에서 해당 이메일 유저 찾기 (이미 존재해야 함 — 대시보드/Sign Up 으로 선 생성)
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const supaUser = data.users.find((u) => u.email === email);
  if (!supaUser) {
    throw new Error(
      `Supabase 에 ${email} 유저가 없어요. 먼저 Supabase Dashboard → Authentication → Add User 로 생성하세요.`,
    );
  }

  // 2. Local users 테이블에 upsert (id = Supabase auth.users.id 동일 UUID)
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://kiditem:kiditem@localhost:5433/kiditem';
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const existing = await prisma.user.findUnique({ where: { id: supaUser.id } });
    if (existing) {
      await prisma.user.update({
        where: { id: supaUser.id },
        data: {
          email,
          name,
          role,
          ...(companyId ? { companyId } : {}),
        },
      });
      console.log(`updated local user ${supaUser.id} (${email})`);
    } else {
      await prisma.user.create({
        data: {
          id: supaUser.id,
          email,
          name,
          role,
          type: 'human',
          ...(companyId ? { companyId } : {}),
        },
      });
      console.log(`created local user ${supaUser.id} (${email})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
