import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductOperationsDataStatusRepositoryAdapter } from './product-operations-data-status.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

describe('ProductOperationsDataStatusRepositoryAdapter traffic readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T00:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('does not report READY when an interior selected date is missing', async () => {
    const { prisma, traffic } = makePrisma([
      ...['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01']
        .map((date) => trafficRow(date)),
      trafficRow('2026-09-03'),
    ]);
    const adapter = new ProductOperationsDataStatusRepositoryAdapter(
      prisma as never,
      evidence() as never,
    );

    const result = await adapter.read(ORGANIZATION_ID, 7);

    expect(result.traffic).toMatchObject({
      ready: false,
      actualCutoff: '2026-09-03',
    });
    expect(traffic.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessDate: {
          gte: new Date('2026-08-28T00:00:00.000Z'),
          lte: new Date('2026-09-03T00:00:00.000Z'),
        },
      }),
    }));
  });

  it('does not let a legacy period-as-day row become the latest READY fact', async () => {
    const { prisma } = makePrisma([
      ...['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']
        .map((date) => trafficRow(date)),
      trafficRow('2026-09-03', false),
    ]);
    const adapter = new ProductOperationsDataStatusRepositoryAdapter(
      prisma as never,
      evidence() as never,
    );

    const result = await adapter.read(ORGANIZATION_ID, 7);

    expect(result.traffic).toMatchObject({
      ready: false,
      actualCutoff: '2026-09-02',
    });
  });

  it('waits for cheap status reads before opening the profitability snapshot', async () => {
    let releaseTraffic!: (rows: ReturnType<typeof trafficRow>[]) => void;
    const trafficReady = new Promise<ReturnType<typeof trafficRow>[]>((resolve) => {
      releaseTraffic = resolve;
    });
    const { prisma, traffic } = makePrisma([]);
    traffic.findMany.mockReturnValue(trafficReady);
    const sourceEvidence = evidence();
    const adapter = new ProductOperationsDataStatusRepositoryAdapter(
      prisma as never,
      sourceEvidence as never,
    );

    const read = adapter.read(ORGANIZATION_ID, 7);
    await Promise.resolve();
    expect(sourceEvidence.load).not.toHaveBeenCalled();

    releaseTraffic([]);
    await read;
    expect(sourceEvidence.load).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      targetCutoff: '2026-09-03',
    });
  });
});

/** A day the traffic source reported, or (`observed: false`) one it never did. */
function trafficRow(date: string, observed = true) {
  return {
    businessDate: new Date(`${date}T00:00:00.000Z`),
    trafficObservedAt: observed ? new Date(`${date}T02:00:00.000Z`) : null,
    lastObservedAt: new Date(`${date}T02:00:00.000Z`),
  };
}

function makePrisma(rows: ReturnType<typeof trafficRow>[]) {
  const traffic = { findMany: vi.fn().mockResolvedValue(rows) };
  return {
    traffic,
    prisma: {
      channelListingDailySnapshot: traffic,
      masterProductAbcFormulaState: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      channelListing: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };
}

function evidence() {
  return {
    load: vi.fn().mockResolvedValue({
      targetCutoff: '2026-09-03',
      actualCutoff: null,
      mappingGeneration: null,
      contributionBasis: null,
      sourceVector: {
        sellpia: sourceView(),
        advertising: sourceView(),
      },
      sources: {
        sellpia: sourceStatus(),
        advertising: sourceStatus(),
      },
      products: [],
    }),
  };
}

function sourceView() {
  return {
    sourceImportRunId: null,
    publicationSequence: null,
    mappingGeneration: null,
    coverageStartDate: null,
    coverageEndDate: null,
    capturedAt: null,
  };
}

function sourceStatus() {
  return {
    ready: false,
    actualCutoff: null,
    capturedAt: null,
    latestAttemptState: null,
    errorCode: null,
  };
}
