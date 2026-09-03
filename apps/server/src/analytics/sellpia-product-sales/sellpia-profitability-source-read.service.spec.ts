import { describe, expect, it, vi } from 'vitest';
import { SellpiaProfitabilitySourceService } from './sellpia-profitability-source.service';
import { MAX_GENERATION_FACT_ROWS } from './sellpia-profitability-source.internal';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const SKU_ID = '22222222-2222-4222-8222-222222222222';
const MASTER_ID = '33333333-3333-4333-8333-333333333333';

function run(overrides: Record<string, unknown> = {}) {
  const capturedAt = new Date('2026-09-03T01:00:00.000Z');
  return {
    id: ATTEMPT_ID,
    organizationId: ORGANIZATION_ID,
    sourceType: 'sellpia_product_profitability',
    status: 'completed',
    attemptToken: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'source-read-test',
    requestFingerprint: 'f'.repeat(64),
    expiresAt: new Date('2026-09-03T01:30:00.000Z'),
    plan: {
      from: '2025-09-01',
      to: '2026-08-31',
      coveredMonths: ['2025-09', '2026-08'],
    },
    parserVersion: 'sellpia-profitability-v1',
    contentChecksum: 'a'.repeat(64),
    contentByteCount: 128,
    rowCount: 1,
    qualityReport: {
      contract: 'sellpia-profitability-v1',
      parserVersion: 'sellpia-profitability-v1',
      contentChecksum: 'a'.repeat(64),
      contentByteCount: 128,
      includedRowCount: 1,
      excludedRowCount: 0,
      mappedRowCount: 1,
      unmappedRowCount: 0,
      warningCount: 0,
      mappingGeneration: '4',
      provenance: {
        source: 'sellpia_stat_prd_profit',
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
      },
    },
    coveredMonths: ['2025-09', '2026-08'],
    mappingGeneration: 4n,
    publicationSequence: 7n,
    coverageStartDate: new Date('2025-09-01T00:00:00.000Z'),
    coverageEndDate: new Date('2026-08-31T00:00:00.000Z'),
    importedAt: capturedAt,
    errorCode: null,
    errorMessage: null,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    ...overrides,
  };
}

function makeService(input: {
  completed?: unknown[];
  facts?: unknown;
  latestAttempt?: unknown;
}) {
  const completedRun = input.completed?.[0] ?? run();
  const tx = {
    sourceImportRun: {
      findFirst: vi.fn()
        .mockResolvedValueOnce(input.latestAttempt ?? completedRun)
        .mockResolvedValueOnce(completedRun),
      findMany: vi.fn().mockResolvedValue(input.completed ?? [run()]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    sellpiaProductMonthlySales: {
      findMany: vi.fn().mockResolvedValue(input.facts ?? []),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const service = new SellpiaProfitabilitySourceService(
    prisma as never,
    {} as never,
  );
  return { service, prisma, tx };
}

function fact(overrides: Record<string, unknown> = {}) {
  return {
    sourceImportRunId: ATTEMPT_ID,
    sellpiaInventorySkuId: SKU_ID,
    masterProductId: MASTER_ID,
    productCode: 'SKU-1',
    optionCode: '',
    yearMonth: '2026-08',
    orderAmount: 1000,
    inAmount: 400,
    costBasis: 'ORDER_TIME_SUPPLY_COST',
    vatIncluded: true,
    coverageStartDate: new Date('2026-08-01T00:00:00.000Z'),
    coverageEndDate: new Date('2026-08-31T00:00:00.000Z'),
    capturedAt: new Date('2026-09-03T01:00:00.000Z'),
    ...overrides,
  };
}

describe('Sellpia profitability source deep read', () => {
  it('returns an organization-fenced latest attempt and bounded COMPLETE catalog', async () => {
    const { service, tx } = makeService({ completed: [run()] });

    const catalog = await service.readGenerationCatalog({
      organizationId: ORGANIZATION_ID,
      limit: 5,
    });
    expect(catalog).toMatchObject({
      latestAttempt: { attemptId: ATTEMPT_ID, state: 'COMPLETE' },
      completeGenerations: [{
        sourceImportRunId: ATTEMPT_ID,
        publicationSequence: '7',
        mappingGeneration: '4',
        coverage: { from: '2025-09-01', to: '2026-08-31' },
        quality: { provenance: { costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: true } },
      }],
    });
    expect(catalog.latestAttempt).not.toHaveProperty('attemptToken');
    expect(tx.sourceImportRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      take: 5,
    }));
  });

  it('truncates a long COMPLETE history to the requested catalog limit', async () => {
    const { service, tx } = makeService({
      completed: [run(), run({
        id: '55555555-5555-4555-8555-555555555555',
        publicationSequence: 6n,
      })],
    });

    await expect(service.readGenerationCatalog({
      organizationId: ORGANIZATION_ID,
      limit: 1,
    })).resolves.toMatchObject({
      completeGenerations: [{ sourceImportRunId: ATTEMPT_ID }],
    });
    expect(tx.sourceImportRun.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
  });

  it('returns the write token only for an exact same-org effective RUNNING control read', async () => {
    const running = run({
      status: 'running',
      publicationSequence: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { service, tx } = makeService({ latestAttempt: running });

    await expect(service.readAttemptControl(ORGANIZATION_ID, ATTEMPT_ID)).resolves.toEqual({
      attemptId: ATTEMPT_ID,
      attemptToken: '44444444-4444-4444-8444-444444444444',
      state: 'RUNNING',
      expiresAt: (running.expiresAt as Date).toISOString(),
      plan: running.plan,
    });
    expect(tx.sourceImportRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: ATTEMPT_ID,
        organizationId: ORGANIZATION_ID,
        sourceType: 'sellpia_product_profitability',
      },
    });
  });

  it('rejects terminal and expired control reads without returning a token', async () => {
    const terminal = makeService({ latestAttempt: run({ status: 'failed' }) });
    await expect(terminal.service.readAttemptControl(ORGANIZATION_ID, ATTEMPT_ID))
      .rejects.toThrow('ATTEMPT_TERMINAL');

    const expired = makeService({ latestAttempt: run({
      status: 'running',
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    }) });
    await expect(expired.service.readAttemptControl(ORGANIZATION_ID, ATTEMPT_ID))
      .rejects.toThrow('ATTEMPT_EXPIRED');
  });

  it('reads only exact-generation facts and keeps unmapped rows separate', async () => {
    const quality = run().qualityReport as Record<string, unknown>;
    const { service, tx } = makeService({
      completed: [run({
        rowCount: 2,
        qualityReport: {
          ...quality,
          includedRowCount: 2,
          mappedRowCount: 1,
          unmappedRowCount: 1,
        },
      })],
      facts: [fact(), fact({
        sellpiaInventorySkuId: null,
        masterProductId: null,
        productCode: 'UNMAPPED',
      })],
    });

    await expect(service.readGenerationFacts({
      organizationId: ORGANIZATION_ID,
      sourceImportRunId: ATTEMPT_ID,
      masterProductIds: [MASTER_ID],
    })).resolves.toMatchObject({
      generation: { sourceImportRunId: ATTEMPT_ID, publicationSequence: '7' },
      facts: [{ masterProductId: MASTER_ID, orderTimeSupplyCost: 400 }],
      unmappedFacts: [{ productCode: 'UNMAPPED', reason: 'SOURCE_UNMAPPED' }],
    });
    expect(tx.sellpiaProductMonthlySales.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceImportRunId: ATTEMPT_ID,
      }),
    }));
  });

  it('throws on malformed quality/provenance and fact overflow', async () => {
    const malformed = makeService({ completed: [run({ qualityReport: null })] });
    await expect(malformed.service.readGenerationCatalog({ organizationId: ORGANIZATION_ID }))
      .rejects.toThrow('SOURCE_QUALITY_REPORT_MALFORMED');

    const invalidFact = makeService({ facts: [fact({ vatIncluded: false })] });
    await expect(invalidFact.service.readGenerationFacts({
      organizationId: ORGANIZATION_ID,
      sourceImportRunId: ATTEMPT_ID,
    })).rejects.toThrow('SOURCE_PROVENANCE_MALFORMED');

    const overflowRows = { length: MAX_GENERATION_FACT_ROWS + 1 } as unknown as unknown[];
    const overflow = makeService({ facts: overflowRows });
    await expect(overflow.service.readGenerationFacts({
      organizationId: ORGANIZATION_ID,
      sourceImportRunId: ATTEMPT_ID,
    })).rejects.toThrow('SOURCE_FACTS_OVERFLOW');
  });

  it('accepts more than 20,000 facts across multiple months within the source bound', async () => {
    const factCount = 20_001;
    const facts = Array.from({ length: factCount }, (_, index) => fact({
      productCode: `SKU-${index}`,
      yearMonth: index % 2 === 0 ? '2025-09' : '2026-08',
    }));
    const quality = run().qualityReport as Record<string, unknown>;
    const completed = run({
      rowCount: factCount,
      qualityReport: {
        ...quality,
        includedRowCount: factCount,
        mappedRowCount: factCount,
      },
    });
    const { service, tx } = makeService({ completed: [completed], facts });

    const result = await service.readGenerationFacts({
      organizationId: ORGANIZATION_ID,
      sourceImportRunId: ATTEMPT_ID,
      yearMonths: ['2026-08'],
    });

    expect(result.facts).toHaveLength(10_000);
    expect(tx.sellpiaProductMonthlySales.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: MAX_GENERATION_FACT_ROWS + 1,
      where: { organizationId: ORGANIZATION_ID, sourceImportRunId: ATTEMPT_ID },
    }));
  });
});
