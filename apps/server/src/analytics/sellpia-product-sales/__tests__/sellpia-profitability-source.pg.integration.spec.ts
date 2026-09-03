import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { AlertsRepository } from '../../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import {
  SellpiaProfitabilitySourceService,
  buildSellpiaProfitabilityPlan,
} from '../sellpia-profitability-source.service';

const ATTEMPT_KEY = '11111111-1111-4111-8111-111111111111';

describe('Sellpia profitability source owner (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: SellpiaProfitabilitySourceService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = owner(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedMappedSku(prisma, TEST_ORGANIZATION_ID, 'SKU-1');
  });

  it('selects the latest twelve closed KST months on the server', () => {
    expect(buildSellpiaProfitabilityPlan(new Date('2026-09-03T01:00:00.000Z'))).toEqual({
      from: '2025-09-01',
      to: '2026-08-31',
      coveredMonths: [
        '2025-09', '2025-10', '2025-11', '2025-12',
        '2026-01', '2026-02', '2026-03', '2026-04',
        '2026-05', '2026-06', '2026-07', '2026-08',
      ],
    });
  });

  it('keeps staged rows invisible until the manifest and Alert resolve commit together', async () => {
    const attempt = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    const resolveFailure = new SourceFailureAlerts(new AlertsRepository(prisma));
    resolveFailure.resolveSourceFailure = async () => {
      throw new Error('alert write failed');
    };
    const failingOwner = new SellpiaProfitabilitySourceService(prisma as never, resolveFailure);

    await expect(
      failingOwner.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, completePayload(attempt)),
    ).rejects.toThrow('alert write failed');

    await expect(prisma.sellpiaProductMonthlySales.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceImportRunId: attempt.attemptId },
    })).resolves.toBe(1);
    await expect(service.readCanonicalGeneration(TEST_ORGANIZATION_ID)).resolves.toBeNull();

    const completed = await service.submitAttempt(
      TEST_ORGANIZATION_ID,
      attempt.attemptId,
      completePayload(attempt),
    );
    expect(completed).toMatchObject({ state: 'COMPLETE', generation: '1' });
    await expect(service.readCanonicalGeneration(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      sourceImportRunId: attempt.attemptId,
      generation: '1',
    });
  });

  it('keeps the prior COMPLETE generation current after a newer failure and exposes stale provenance', async () => {
    const first = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    await service.submitAttempt(TEST_ORGANIZATION_ID, first.attemptId, completePayload(first));

    const replacement = await service.beginAttempt(
      TEST_ORGANIZATION_ID,
      '22222222-2222-4222-8222-222222222222',
    );
    await service.failAttempt(TEST_ORGANIZATION_ID, replacement.attemptId, {
      attemptToken: replacement.attemptToken,
      errorCode: 'PROVIDER_INCOMPLETE',
      errorMessage: 'Sellpia pagination was incomplete.',
    });

    await expect(service.readCanonicalGeneration(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      sourceImportRunId: first.attemptId,
      generation: '1',
    });
    await expect(service.readSourceStatus(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      status: 'STALE',
      latestAttempt: {
        attemptId: replacement.attemptId,
        state: 'FAILED',
        errorCode: 'PROVIDER_INCOMPLETE',
      },
      latestComplete: { sourceImportRunId: first.attemptId },
    });
  });

  it('reads source status from one repeatable-read transaction', async () => {
    const attempt = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    await service.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, completePayload(attempt));

    const canonicalRead = vi.spyOn(service, 'readCanonicalGeneration');
    const transaction = vi.spyOn(prisma, '$transaction');
    try {
      await expect(service.readSourceStatus(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
        status: 'READY',
        latestAttempt: { attemptId: attempt.attemptId, state: 'COMPLETE' },
        latestComplete: { sourceImportRunId: attempt.attemptId, generation: '1' },
      });
      expect(canonicalRead).not.toHaveBeenCalled();
      expect(transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        }),
      );
    } finally {
      canonicalRead.mockRestore();
      transaction.mockRestore();
    }
  });

  it('freezes organization-scoped mapping and never mutates ABC publication tables', async () => {
    const before = await abcState(prisma);
    const attempt = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    await service.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, completePayload(attempt));

    const facts = await prisma.sellpiaProductMonthlySales.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceImportRunId: attempt.attemptId },
      select: {
        sellpiaInventorySkuId: true,
        masterProductId: true,
        costBasis: true,
        vatIncluded: true,
      },
    });
    expect(facts).toEqual([expect.objectContaining({
      sellpiaInventorySkuId: expect.any(String),
      masterProductId: expect.any(String),
      costBasis: 'ORDER_TIME_SUPPLY_COST',
      vatIncluded: true,
    })]);
    await expect(abcState(prisma)).resolves.toEqual(before);
  });

  it('requires provider proof for a complete empty generation', async () => {
    const attempt = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    await expect(service.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
      ...completePayload(attempt),
      products: [],
      providerBackedEmptyProof: false,
    })).rejects.toThrow('EMPTY_COVERAGE_NOT_PROVEN');
    await expect(service.readCanonicalGeneration(TEST_ORGANIZATION_ID)).resolves.toBeNull();
  });

  it('replays one idempotency key and rejects a changed request or parallel attempt', async () => {
    const first = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    await expect(service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY)).resolves.toEqual(first);
    await expect(service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY, {
      normalizedSourceAvailabilityDate: '2026-01-01',
    })).rejects.toThrow('SOURCE_IDEMPOTENCY_KEY_REUSED');
    await expect(service.beginAttempt(
      TEST_ORGANIZATION_ID,
      '22222222-2222-4222-8222-222222222222',
    )).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: first.attemptId,
      }),
    });
  });

  it('makes terminal submission replay a no-op and rejects conflicting content', async () => {
    const attempt = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    const payload = completePayload(attempt);
    const completed = await service.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, payload);
    await expect(service.submitAttempt(
      TEST_ORGANIZATION_ID,
      attempt.attemptId,
      payload,
    )).resolves.toEqual(completed);
    await expect(service.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
      ...payload,
      products: payload.products.map((product) => ({
        ...product,
        salePrice: product.salePrice + 1,
      })),
    })).rejects.toThrow('CONTENT_REPLAY_CONFLICT');
    await expect(prisma.sellpiaProductMonthlySales.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
  });

  it('rejects duplicate product identities and duplicate product-option-month facts', async () => {
    const attempt = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    const payload = completePayload(attempt);
    const product = payload.products[0]!;
    const firstMonth = product.months[0]!;

    await expect(service.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
      ...payload,
      products: [
        product,
        {
          ...product,
          months: [{
            ...firstMonth,
            yearMonth: payload.coveredMonths.at(-2)!,
          }],
        },
      ],
    })).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'DUPLICATE_PRODUCT_IDENTITY',
        statusCode: 422,
      }),
      status: 422,
    });

    await expect(service.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
      ...payload,
      products: [{
        ...product,
        months: [firstMonth, { ...firstMonth }],
      }],
    })).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'DUPLICATE_PRODUCT_MONTH',
        statusCode: 422,
      }),
      status: 422,
    });

    await expect(prisma.sellpiaProductMonthlySales.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceImportRunId: attempt.attemptId },
    })).resolves.toBe(0);
  });

  it('derives expiration without writing and terminalizes the orphan on the next begin', async () => {
    const expired = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    await prisma.sourceImportRun.update({
      where: { id: expired.attemptId },
      data: { expiresAt: new Date('2000-01-01T00:00:00.000Z') },
    });

    await expect(service.readSourceStatus(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      status: 'MISSING',
      latestAttempt: {
        state: 'FAILED',
        errorCode: 'ATTEMPT_EXPIRED',
      },
    });
    await expect(prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: expired.attemptId },
    })).resolves.toMatchObject({ status: 'running' });

    const replacement = await service.beginAttempt(
      TEST_ORGANIZATION_ID,
      '22222222-2222-4222-8222-222222222222',
    );
    expect(replacement.state).toBe('RUNNING');
    await expect(prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: expired.attemptId },
    })).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    await expect(prisma.alert.findUniqueOrThrow({
      where: {
        organizationId_dedupeKey: {
          organizationId: TEST_ORGANIZATION_ID,
          dedupeKey: 'source:sellpia-product-profitability',
        },
      },
    })).resolves.toMatchObject({
      status: 'OPEN',
      attemptId: expired.attemptId,
      href: '/stock-ops',
    });
  });

  it('rejects a stale attempt token for both completion and failure', async () => {
    const attempt = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    const staleToken = '99999999-9999-4999-8999-999999999999';
    await expect(service.submitAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
      ...completePayload(attempt),
      attemptToken: staleToken,
    })).rejects.toThrow('ATTEMPT_TOKEN_MISMATCH');
    await expect(service.failAttempt(TEST_ORGANIZATION_ID, attempt.attemptId, {
      attemptToken: staleToken,
      errorCode: 'PROVIDER_FAILED',
      errorMessage: 'failed',
    })).rejects.toThrow('ATTEMPT_TOKEN_MISMATCH');
  });

  it('isolates idempotency, attempts, and facts by organization', async () => {
    await seedMappedSku(prisma, OTHER_ORGANIZATION_ID, 'SKU-1');
    const own = await service.beginAttempt(TEST_ORGANIZATION_ID, ATTEMPT_KEY);
    const foreign = await service.beginAttempt(OTHER_ORGANIZATION_ID, ATTEMPT_KEY);
    await service.submitAttempt(TEST_ORGANIZATION_ID, own.attemptId, completePayload(own));
    await service.submitAttempt(OTHER_ORGANIZATION_ID, foreign.attemptId, completePayload(foreign));

    await expect(service.readCanonicalGeneration(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      sourceImportRunId: own.attemptId,
    });
    await expect(service.readCanonicalGeneration(OTHER_ORGANIZATION_ID)).resolves.toMatchObject({
      sourceImportRunId: foreign.attemptId,
    });
  });
});

function owner(prisma: PrismaClient): SellpiaProfitabilitySourceService {
  return new SellpiaProfitabilitySourceService(
    prisma as never,
    new SourceFailureAlerts(new AlertsRepository(prisma as never)),
  );
}

function completePayload(attempt: { attemptToken: string; plan: { coveredMonths: string[] } }) {
  return {
    attemptToken: attempt.attemptToken,
    parserVersion: 'sellpia-profitability-v1' as const,
    providerBackedEmptyProof: true,
    coveredMonths: attempt.plan.coveredMonths,
    provenance: {
      source: 'sellpia_stat_prd_profit' as const,
      costBasis: 'ORDER_TIME_SUPPLY_COST' as const,
      vatIncluded: true as const,
    },
    products: [{
      productCode: 'SKU-1',
      optionCode: '',
      productName: 'Mapped product',
      salePrice: 1_000,
      buyPrice: 600,
      months: [{
        yearMonth: attempt.plan.coveredMonths.at(-1)!,
        orderQty: 2,
        orderAmount: 2_000,
        inQty: 2,
        inAmount: 1_200,
      }],
    }],
  };
}

async function seedMappedSku(
  prisma: PrismaClient,
  organizationId: string,
  code: string,
): Promise<void> {
  const master = await prisma.masterProduct.create({
    data: {
      organizationId,
      code: `MASTER-${organizationId.slice(0, 4)}`,
      name: 'Master product',
    },
  });
  await prisma.sellpiaInventorySku.create({
    data: {
      organizationId,
      masterProductId: master.id,
      code,
      name: 'Sellpia SKU',
      currentStock: 1,
    },
  });
}

async function abcState(prisma: PrismaClient) {
  return Promise.all([
    prisma.masterProductAbcFormulaState.findMany(),
    prisma.masterProductAbcEvaluation.findMany(),
    prisma.masterProductAbcGradeHistory.findMany(),
    prisma.masterProduct.findMany({
      select: { id: true, organizationId: true, abcGrade: true },
      orderBy: { id: 'asc' },
    }),
  ]);
}
