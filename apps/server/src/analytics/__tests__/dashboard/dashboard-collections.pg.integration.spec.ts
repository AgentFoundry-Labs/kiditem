import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import { DashboardCollectionsService } from '../../application/service/dashboard/dashboard-collections.service';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { orderCollectionFreshnessTestAdapter } from '../../../test-helpers/orders-operations';

describe('Dashboard collection completion provenance (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: DashboardCollectionsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    // Analytics reads Orders' freshness capability directly; there is no Analytics-side wrapper.
    service = new DashboardCollectionsService(orderCollectionFreshnessTestAdapter(prisma));
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('shows nothing for an organization with no succeeded collection operation — old completed import runs no longer count (KID-365)', async () => {
    await prisma.sourceImportRun.createMany({
      data: [
        { organizationId: TEST_ORGANIZATION_ID, sourceType: 'order_collection_mall', status: 'completed', importedAt: new Date('2026-09-20T01:00:00Z') },
        { organizationId: TEST_ORGANIZATION_ID, sourceType: 'sellpia_inventory', status: 'completed', importedAt: new Date('2026-09-11T01:00:00Z') },
      ],
    });
    await expect(service.getCollections(TEST_ORGANIZATION_ID)).resolves.toEqual({ lastCompleted: {} });
  });

  it('원천마다 마지막 성공 실행 시각을 웹이 읽는 옛 원천 이름으로 — 실패 실행·다른 조직·옛 run은 세지 않는다(KID-359, KID-365)', async () => {
    const organizationId = TEST_ORGANIZATION_ID;
    const operation = (kind: string, status: string, finishedAt: string, org = organizationId) => prisma.operation.create({
      data: {
        organizationId: org, kind, status, token: randomUUID(), expiresAt: new Date(finishedAt), startedAt: new Date(finishedAt),
        finishedAt: new Date(finishedAt), attempts: 1,
      },
    });
    await prisma.sourceImportRun.create({
      data: { organizationId, sourceType: 'sellpia_shipment_tracking', status: 'completed', importedAt: new Date('2026-09-25T01:00:00Z') },
    });
    await operation('orders.mall_orders', 'succeeded', '2026-09-22T01:00:00Z');
    await operation('orders.mall_orders', 'succeeded', '2026-09-24T01:00:00Z');
    await operation('orders.mall_orders', 'failed', '2026-09-26T01:00:00Z');
    await operation('orders.sellpia_shipment_tracking', 'succeeded', '2026-09-23T01:00:00Z');
    await operation('orders.coupang_directship', 'succeeded', '2026-09-21T01:00:00Z');
    await operation('orders.mall_orders', 'succeeded', '2026-09-26T05:00:00Z', OTHER_ORGANIZATION_ID);

    await expect(service.getCollections(organizationId)).resolves.toEqual({
      lastCompleted: {
        order_collection_mall: '2026-09-24T01:00:00.000Z',
        sellpia_shipment_tracking: '2026-09-23T01:00:00.000Z',
        coupang_direct_order_capture: '2026-09-21T01:00:00.000Z',
      },
    });
  });
});
