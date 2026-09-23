import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPendingJob, ensureSalesProductWorkspace } from '../adapter/out/repository/thumbnail-generation-ledger.persistence';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';

/**
 * 초안의 썸네일 생성은 초안의 작업공간 하나에 묶인다(KID-310). 작업공간이 없을 때 동시에 들어온
 * 두 생성이 각자 만들려 해도, 호출자 트랜잭션을 깨지 않고 같은 작업공간을 쓴다.
 */
describe('sales product thumbnail workspace (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const job = (salesProductId: string) => prisma.$transaction(async (tx) => createPendingJob(tx, {
    organizationId: TEST_ORGANIZATION_ID,
    contentWorkspaceId: await ensureSalesProductWorkspace(tx, { organizationId: TEST_ORGANIZATION_ID, salesProductId }),
    method: 'generate',
    inputMeta: {},
  }));

  it('opens one workspace for concurrent first generations of the same draft', async () => {
    const product = await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: null, name: '초안 상품' },
    });

    const [first, second] = await Promise.all([job(product.id), job(product.id)]);

    const workspaces = await prisma.contentWorkspace.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id },
      select: { id: true },
    });
    expect(workspaces).toHaveLength(1);
    const generations = await prisma.thumbnailGeneration.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { contentWorkspaceId: true },
    });
    expect(generations.map((row) => row.contentWorkspaceId)).toEqual([workspaces[0]!.id, workspaces[0]!.id]);
  });

  it('reuses the draft workspace that already exists', async () => {
    const product = await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: null, name: '초안 상품' },
    });
    const existing = await prisma.contentWorkspace.create({
      data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId: product.id },
    });

    const created = await job(product.id);

    const generation = await prisma.thumbnailGeneration.findUniqueOrThrow({ where: { id: created.id } });
    expect(generation.contentWorkspaceId).toBe(existing.id);
  });
});
