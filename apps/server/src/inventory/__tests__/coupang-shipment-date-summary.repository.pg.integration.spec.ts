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
import { CoupangShipmentDateSummaryRepositoryAdapter } from '../adapter/out/repository/coupang-shipment-date-summary.repository.adapter';

describe('Coupang shipment date summary repository (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: CoupangShipmentDateSummaryRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new CoupangShipmentDateSummaryRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const oldTimestamp = new Date('2020-01-01T00:00:00.000Z');
    await prisma.coupangShipmentDateSummary.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          shipmentDate: '2026-07-27',
          count: 1,
          boxes: 2,
          capturedAt: oldTimestamp,
          createdAt: oldTimestamp,
          updatedAt: oldTimestamp,
        },
        {
          organizationId: OTHER_ORGANIZATION_ID,
          shipmentDate: '2026-07-27',
          count: 90,
          boxes: 91,
          capturedAt: oldTimestamp,
          createdAt: oldTimestamp,
          updatedAt: oldTimestamp,
        },
      ],
    });
  });

  it('upserts a staging-sized deduplicated batch in one organization boundary', async () => {
    const items = Array.from({ length: 60 }, (_, index) => ({
      date: `2026-${String(Math.floor(index / 28) + 8).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
      count: index + 1,
      boxes: index + 101,
    }));
    items.push({ date: '2026-07-27', count: 7, boxes: 8 });
    items.push({ date: '2026-07-27', count: 70, boxes: 80 });

    const result = await repository.upsertDateSummary(
      TEST_ORGANIZATION_ID,
      items,
    );

    expect(result).toHaveLength(61);
    expect(result.find(({ date }) => date === '2026-07-27')).toMatchObject({
      count: 70,
      boxes: 80,
    });
    const own = await prisma.coupangShipmentDateSummary.findUniqueOrThrow({
      where: {
        organizationId_shipmentDate: {
          organizationId: TEST_ORGANIZATION_ID,
          shipmentDate: '2026-07-27',
        },
      },
    });
    expect(own.capturedAt.getTime()).toBeGreaterThan(
      new Date('2020-01-01T00:00:00.000Z').getTime(),
    );
    expect(own.updatedAt.getTime()).toBe(own.capturedAt.getTime());

    await expect(prisma.coupangShipmentDateSummary.findUniqueOrThrow({
      where: {
        organizationId_shipmentDate: {
          organizationId: OTHER_ORGANIZATION_ID,
          shipmentDate: '2026-07-27',
        },
      },
      select: { count: true, boxes: true, capturedAt: true, updatedAt: true },
    })).resolves.toEqual({
      count: 90,
      boxes: 91,
      capturedAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    });
  });
});
