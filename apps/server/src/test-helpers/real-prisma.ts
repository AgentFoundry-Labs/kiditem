/**
 * Real Prisma client for integration tests against docker-compose.test.yml Postgres.
 *
 * Prisma v7 은 constructor 에서 URL override 를 받지 않으므로, **환경변수 DATABASE_URL**
 * 을 테스트 DB 로 미리 세팅하고 PrismaClient 를 기본 생성자로 사용한다.
 *
 * 루트 `npm run test:integration` 스크립트가 DATABASE_URL 을 5434 포트로 덮어쓰고
 * vitest 를 실행하므로 테스트 파일에서는 별도 처리 불필요.
 *
 * Usage:
 *   import { makeTestPrisma, resetDb, seedBaseFixture } from '../test-helpers/real-prisma';
 *
 *   let prisma: PrismaClient;
 *   beforeAll(async () => {
 *     prisma = makeTestPrisma();
 *     await prisma.$connect();
 *   });
 *   afterAll(async () => { await prisma.$disconnect(); });
 *   beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';

/**
 * 안전장치: 테스트 DB 가 아니면 PrismaClient 생성을 거부한다.
 * 실수로 dev/prod DB 에 대해 `resetDb` (TRUNCATE) 가 돌지 않도록 방어.
 */
function assertTestDbUrl(): string {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('5434') && !url.includes('kiditem_test')) {
    throw new Error(
      `Refusing to use non-test DATABASE_URL for integration tests. ` +
        `Expected :5434 or db name "kiditem_test", got: ${url.replace(/:[^:@]+@/, ':***@')}`,
    );
  }
  return url;
}

export function makeTestPrisma(): PrismaClient {
  const connectionString = assertTestDbUrl();
  // 프로젝트 표준 어댑터 패턴 (apps/server/src/prisma/prisma.service.ts 와 동일)
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/**
 * TRUNCATE CASCADE 로 모든 테이블 초기화. 각 테스트 사이 깨끗한 상태 보장.
 *
 * pg_tables 조회 → 존재하는 모든 public 테이블 대상 (schema push 후 생성된 것 + 향후 추가된 것 자동 포함).
 * Prisma internal 테이블(`_prisma_migrations` 등) 은 제외 (마이그레이션 상태 보존).
 */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

/**
 * Test fixture — 테스트용 Company + User seed.
 * 각 테스트에서 직접 company/user 를 만들 필요 없이 공통 기반 제공.
 */
export const TEST_COMPANY_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const TEST_USER_ID = 'f1234567-89ab-4cde-8f01-23456789abcd';
export const OTHER_COMPANY_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
export const OTHER_USER_ID = 'e2345678-9abc-4def-8012-3456789abcde';

export async function seedBaseFixture(prisma: PrismaClient): Promise<void> {
  await prisma.company.createMany({
    data: [
      { id: TEST_COMPANY_ID, name: 'Test Co', slug: 'test-co' },
      { id: OTHER_COMPANY_ID, name: 'Other Co', slug: 'other-co' },
    ],
    skipDuplicates: true,
  });
  await prisma.user.createMany({
    data: [
      {
        id: TEST_USER_ID,
        companyId: TEST_COMPANY_ID,
        email: 'test@test.local',
        name: 'Tester',
        role: 'owner',
        type: 'human',
      },
      {
        id: OTHER_USER_ID,
        companyId: OTHER_COMPANY_ID,
        email: 'other@test.local',
        name: 'Other Tester',
        role: 'owner',
        type: 'human',
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * RLS-scoped pg client.
 *
 * Opens a raw `pg.Client` connected as `chatbot_readonly` (RLS-enforced role),
 * optionally sets `app.company_id` session variable, runs `fn`, and cleans up.
 *
 * 용도: Products domain RLS 4-matrix 검증 (filter set / no session / cross-tenant guess / option).
 * `chatbot_readonly` 역할은 `prisma/test-db-setup.sh` 가 테스트 DB 부팅 시 생성한다.
 *
 * @param companyId - UUID to set as `app.company_id`. `null` → no session var set (RLS → 0 rows).
 * @param fn - consumer receiving the connected pg client.
 */
export async function withChatbotReadonly<T>(
  companyId: string | null,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const testUrl = process.env.DATABASE_URL
    ?? 'postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test';
  // kiditem_test (owner) → chatbot_readonly (RLS-enforced)
  const url = testUrl.replace(
    /^postgresql:\/\/[^:]+:[^@]+/,
    'postgresql://chatbot_readonly:chatbot_readonly',
  );
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (companyId !== null) {
      await client.query(`SET app.company_id = '${companyId}'`);
    }
    return await fn(client);
  } finally {
    await client.end();
  }
}
