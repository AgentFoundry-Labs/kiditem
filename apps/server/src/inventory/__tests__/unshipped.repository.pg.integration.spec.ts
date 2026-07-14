import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { UnshippedRepositoryAdapter } from '../adapter/out/repository/unshipped.repository.adapter';

describe('UnshippedRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: UnshippedRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new UnshippedRepositoryAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('returns only the active organization rows and derives its summary within that boundary', async () => {
    const [localAccount, foreignAccount] = await Promise.all([
      prisma.channelAccount.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Local Wing',
          externalAccountId: 'UNSHIPPED-LOCAL',
        },
      }),
      prisma.channelAccount.create({
        data: {
          organizationId: OTHER_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Foreign Wing',
          externalAccountId: 'UNSHIPPED-FOREIGN',
        },
      }),
    ]);
    const [localOrder, foreignOrder] = await Promise.all([
      prisma.order.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: localAccount.id,
          externalOrderId: 'UNSHIPPED-LOCAL',
        },
      }),
      prisma.order.create({
        data: {
          organizationId: OTHER_ORGANIZATION_ID,
          channelAccountId: foreignAccount.id,
          externalOrderId: 'UNSHIPPED-FOREIGN',
        },
      }),
    ]);
    const [localDelayed, localRecent, foreignDelayed] = await Promise.all([
      createOrderLine(TEST_ORGANIZATION_ID, localOrder.id, 'local-delayed'),
      createOrderLine(TEST_ORGANIZATION_ID, localOrder.id, 'local-recent'),
      createOrderLine(OTHER_ORGANIZATION_ID, foreignOrder.id, 'foreign-delayed'),
    ]);
    await prisma.unshippedItem.createMany({
      data: [
        row(TEST_ORGANIZATION_ID, localOrder.id, localDelayed.id, 'local-delayed', 4),
        row(TEST_ORGANIZATION_ID, localOrder.id, localRecent.id, 'local-recent', 1),
        row(OTHER_ORGANIZATION_ID, foreignOrder.id, foreignDelayed.id, 'foreign-delayed', 9),
      ],
    });

    const result = await repository.list(TEST_ORGANIZATION_ID, {
      minDays: 3,
      skip: 0,
      take: 20,
    });

    expect(result.items.map((item) => item.productName)).toEqual(['local-delayed']);
    expect(result.total).toBe(1);
    expect(result.delayedCount).toBe(1);
  });

  function createOrderLine(organizationId: string, orderId: string, productName: string) {
    return prisma.orderLineItem.create({
      data: {
        organizationId,
        orderId,
        productName,
        quantity: 1,
        externalLineId: productName,
      },
      select: { id: true },
    });
  }
});

function row(
  organizationId: string,
  orderId: string,
  orderLineItemId: string,
  productName: string,
  delayDays: number,
) {
  return {
    organizationId,
    orderId,
    orderLineItemId,
    productName,
    quantity: 1,
    orderDate: new Date('2026-07-01T00:00:00.000Z'),
    delayDays,
  };
}
