import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { normalizeSalesProductStatusMigration } from '../../../../../scripts/data-migrations/v0.1.31/027_normalize_sales_product_status';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

/**
 * KID-313 이전 행은 사방넷 상태 어휘(draft · paused · sold_out · unused)를 그대로 들고 있고, 코드가
 * 있는 `draft` 도 있다. 027 은 그 행을 `code IS NULL ⇔ status = 'draft'` 인 세 값으로 옮긴다.
 */
describe('027 normalize sales product status (PostgreSQL)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => { await resetDb(prisma); await prisma.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  let sequence = 0;
  async function legacy(organizationId: string, code: string | null, status: string): Promise<string> {
    const id = randomUUID();
    sequence += 1;
    // 옛 값은 지금 계약 밖이라 raw 로 넣는다.
    await prisma.$executeRaw`
      INSERT INTO sales_products (id, organization_id, code, status, name, created_at, updated_at)
      VALUES (${id}::uuid, ${organizationId}::uuid, ${code}, ${status}, ${`옛 상품 ${sequence}`}, now(), now())
    `;
    return id;
  }
  const statusOf = async (id: string) => (await prisma.salesProduct.findUniqueOrThrow({ where: { id } })).status;

  it('moves every retired value to the three-value contract across organizations, and is a no-op on re-run', async () => {
    const codedDraft = await legacy(TEST_ORGANIZATION_ID, 'KID00000077', 'draft');
    const paused = await legacy(TEST_ORGANIZATION_ID, 'KID00000078', 'paused');
    const soldOut = await legacy(OTHER_ORGANIZATION_ID, 'KID00000079', 'sold_out');
    const unused = await legacy(TEST_ORGANIZATION_ID, 'KID00000080', 'unused');
    const codelessActive = await legacy(OTHER_ORGANIZATION_ID, null, 'active');
    const codelessUnused = await legacy(TEST_ORGANIZATION_ID, null, 'unused');
    const active = await legacy(TEST_ORGANIZATION_ID, 'KID00000081', 'active');
    const archived = await legacy(TEST_ORGANIZATION_ID, 'KID00000082', 'archived');
    const draft = await legacy(TEST_ORGANIZATION_ID, null, 'draft');

    await expect(prisma.$transaction((tx) => normalizeSalesProductStatusMigration.run(tx, { target: 'local' })))
      .resolves.toEqual({
        affectedRows: 6,
        details: { codelessToDraft: 2, unusedToArchived: 1, codedToActive: 3 },
      });

    expect(await statusOf(codedDraft)).toBe('active');
    expect(await statusOf(paused)).toBe('active');
    expect(await statusOf(soldOut)).toBe('active');
    expect(await statusOf(unused)).toBe('archived');
    // 코드가 없으면 초안이다 — 보관은 코드를 지닌 판매 상품만 한다.
    expect(await statusOf(codelessActive)).toBe('draft');
    expect(await statusOf(codelessUnused)).toBe('draft');
    expect(await statusOf(active)).toBe('active');
    expect(await statusOf(archived)).toBe('archived');
    expect(await statusOf(draft)).toBe('draft');

    await expect(prisma.$transaction((tx) => normalizeSalesProductStatusMigration.run(tx, { target: 'local' })))
      .resolves.toEqual({
        affectedRows: 0,
        details: { codelessToDraft: 0, unusedToArchived: 0, codedToActive: 0 },
      });
  });

  it('refuses a status it does not know without changing any row', async () => {
    const paused = await legacy(TEST_ORGANIZATION_ID, 'KID00000090', 'paused');
    await legacy(TEST_ORGANIZATION_ID, 'KID00000091', 'mystery');

    await expect(prisma.$transaction((tx) => normalizeSalesProductStatusMigration.run(tx, { target: 'local' })))
      .rejects.toThrow(/mystery/);
    expect(await statusOf(paused)).toBe('paused');
  });
});
