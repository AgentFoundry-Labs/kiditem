// apps/server/src/products/__tests__/rls.pg.integration.spec.ts
//
// RLS 4-matrix — `chatbot_readonly` 역할이 Postgres row-level security 를 통해서만
// 회사별 데이터를 볼 수 있는지 확인. NestJS (`kiditem` owner) 는 RLS 우회이므로
// app-level `where.organizationId` 로 커버되고, 이 스펙은 그 반대편 (read-only tenant)
// 을 독립 검증한다.
//
// 4-matrix:
//   1. master_products — session 변수 set → own organization 만 보임
//   2. master_products — session 변수 미설정 → 0 rows (RLS deny)
//   3. cross-tenant guess — 공격자가 타 회사 UUID 를 알아도 own scope 하에선 0 rows
//   4. product_options — session 변수 set → own organization 만 보임 (두 번째 테이블 확인)
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma, resetDb, seedBaseFixture, withChatbotReadonly,
  TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

describe('RLS — chatbot_readonly', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    // Seed 1 master per organization. code 는 RLS 테스트용 고정값 (nextval sequence 무시).
    await prisma.masterProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: 'M-00000A01', name: 'A' },
    });
    await prisma.masterProduct.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, code: 'M-00000B01', name: 'B' },
    });
  });

  it('master_products — filter set → only own organization rows', async () => {
    const rows = await withChatbotReadonly(TEST_ORGANIZATION_ID, async (c) => {
      const r = await c.query('SELECT id, organization_id FROM master_products');
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(TEST_ORGANIZATION_ID);
  });

  it('master_products — no session variable → 0 rows', async () => {
    const rows = await withChatbotReadonly(null, async (c) => {
      const r = await c.query('SELECT id FROM master_products');
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("cross-tenant guess — attacker knows B's UUID → 0 rows under A", async () => {
    const bRow = await prisma.masterProduct.findUniqueOrThrow({
      where: { code: 'M-00000B01' },
    });
    const rows = await withChatbotReadonly(TEST_ORGANIZATION_ID, async (c) => {
      const r = await c.query(
        'SELECT id FROM master_products WHERE id = $1',
        [bRow.id],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('product_options — filter set → only own organization rows', async () => {
    // 각 회사에 1개씩 seeded master 에 매달린 option 생성.
    const aMaster = await prisma.masterProduct.findUniqueOrThrow({
      where: { code: 'M-00000A01' },
    });
    const bMaster = await prisma.masterProduct.findUniqueOrThrow({
      where: { code: 'M-00000B01' },
    });
    await prisma.productOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterId: aMaster.id,
        sku: 'M-00000A01-01',
        optionName: 'A-opt',
      },
    });
    await prisma.productOption.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        masterId: bMaster.id,
        sku: 'M-00000B01-01',
        optionName: 'B-opt',
      },
    });

    const rows = await withChatbotReadonly(TEST_ORGANIZATION_ID, async (c) => {
      const r = await c.query('SELECT id, organization_id FROM product_options');
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows.every((r: { organization_id: string }) => r.organization_id === TEST_ORGANIZATION_ID)).toBe(true);
  });
});
