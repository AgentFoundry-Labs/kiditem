import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import { CollectionFreshnessRepositoryAdapter } from '../../adapter/out/repository/dashboard/collection-freshness.repository.adapter';
import { DashboardCollectionsService } from '../../application/service/dashboard/dashboard-collections.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { orderCollectionFreshnessTestAdapter } from '../../../test-helpers/orders-operations';

describe('Dashboard collection completion provenance (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: DashboardCollectionsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new DashboardCollectionsService(
      new CollectionFreshnessRepositoryAdapter(prisma as PrismaService, orderCollectionFreshnessTestAdapter(prisma)),
    );
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('retains each source\'s last completed import across newer failed and running attempts', async () => {
    const organizationId = TEST_ORGANIZATION_ID;
    await prisma.sourceImportRun.createMany({
      data: [
        { organizationId, sourceType: 'sellpia_inventory', status: 'completed', importedAt: new Date('2026-09-10T01:00:00Z') },
        { organizationId, sourceType: 'sellpia_inventory', status: 'completed', importedAt: new Date('2026-09-11T01:00:00Z') },
        { organizationId, sourceType: 'sellpia_inventory', status: 'failed', importedAt: new Date('2026-09-12T01:00:00Z') },
        { organizationId, sourceType: 'sellpia_inventory', status: 'running', importedAt: new Date('2026-09-13T01:00:00Z') },
        { organizationId, sourceType: 'coupang_orders', status: 'completed', importedAt: new Date('2026-09-10T02:00:00Z') },
        { organizationId: OTHER_ORGANIZATION_ID, sourceType: 'sellpia_inventory', status: 'completed', importedAt: new Date('2026-09-14T01:00:00Z') },
        { organizationId: OTHER_ORGANIZATION_ID, sourceType: 'foreign_only', status: 'completed', importedAt: new Date('2026-09-14T01:00:00Z') },
      ],
    });

    await expect(service.getCollections(organizationId)).resolves.toEqual({
      lastCompleted: {
        sellpia_inventory: '2026-09-11T01:00:00.000Z',
        coupang_orders: '2026-09-10T02:00:00.000Z',
      },
    });
  });

  it('keeps missing imports and completed imports without observation timestamps absent', async () => {
    await prisma.sourceImportRun.createMany({
      data: [
        { organizationId: TEST_ORGANIZATION_ID, sourceType: 'no_timestamp', status: 'completed' },
        { organizationId: TEST_ORGANIZATION_ID, sourceType: 'failed_only', status: 'failed', importedAt: new Date('2026-09-12T01:00:00Z') },
      ],
    });
    await expect(service.getCollections(TEST_ORGANIZATION_ID)).resolves.toEqual({ lastCompleted: {} });
  });

  it('retains an explicitly completed empty import as a real collection observation', async () => {
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_orders',
        status: 'completed',
        rowCount: 0,
        providerBackedEmptyProof: true,
        importedAt: new Date('2026-09-12T01:00:00Z'),
      },
    });
    await expect(service.getCollections(TEST_ORGANIZATION_ID)).resolves.toEqual({
      lastCompleted: { coupang_orders: '2026-09-12T01:00:00.000Z' },
    });
  });

  it('실행 계약으로 옮긴 주문 수집은 마지막 성공 실행 시각으로 — 옛 run과 둘 중 늦은 쪽(KID-359: 송장·주문 수집 칸이 멈추지 않게)', async () => {
    const organizationId = TEST_ORGANIZATION_ID;
    const operation = (kind: string, status: string, finishedAt: string, org = organizationId) => prisma.operation.create({
      data: {
        organizationId: org, kind, status, token: randomUUID(), expiresAt: new Date(finishedAt), startedAt: new Date(finishedAt),
        finishedAt: new Date(finishedAt), attempts: 1,
      },
    });
    await prisma.sourceImportRun.createMany({
      data: [
        { organizationId, sourceType: 'order_collection_mall', status: 'completed', importedAt: new Date('2026-09-20T01:00:00Z') },
        { organizationId, sourceType: 'sellpia_shipment_tracking', status: 'completed', importedAt: new Date('2026-09-25T01:00:00Z') },
      ],
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
        sellpia_shipment_tracking: '2026-09-25T01:00:00.000Z',
        coupang_direct_order_capture: '2026-09-21T01:00:00.000Z',
      },
    });
  });
});
