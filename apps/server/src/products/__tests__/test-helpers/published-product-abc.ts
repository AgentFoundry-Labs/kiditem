import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
  type ProductAbcGrade,
} from '@kiditem/shared/product-abc';

type PublishedGrade = Readonly<{
  masterProductId: string;
  abcGrade: ProductAbcGrade;
}>;

/**
 * Seed the public Products ABC contract for PG integration tests that exercise
 * another domain. Legacy `MasterProduct.abcGrade` fixture values are not an
 * official publication and deliberately have no effect on those consumers.
 */
export async function seedPublishedProductAbcGrades(
  prisma: PrismaClient,
  input: { organizationId: string; grades: readonly PublishedGrade[] },
): Promise<void> {
  if (input.grades.length === 0) return;

  let state = await prisma.masterProductAbcFormulaState.findUnique({
    where: { organizationId: input.organizationId },
  });
  let formulaVersionId = state?.activeFormulaVersionId ?? null;
  if (!formulaVersionId) {
    const formula = await prisma.masterProductAbcFormulaVersion.findFirst({
      where: { organizationId: input.organizationId },
      orderBy: { version: 'desc' },
      select: { id: true },
    }) ?? await prisma.masterProductAbcFormulaVersion.create({
      data: {
        organizationId: input.organizationId,
        formulaKey: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.formulaKey,
        version: 1,
        formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
      },
      select: { id: true },
    });
    formulaVersionId = formula.id;
  }

  const completeEnvelope = state?.publicationRevision && state.officialCutoffDate
    && state.publishedAt && state.publishedSellpiaOperationId
    && state.publishedAdvertisingSourceImportRunId
    && state.publishedMappingGeneration !== null;
  if (!completeEnvelope) {
    const [sellpia, advertising] = await Promise.all([
      prisma.sourceImportRun.create({ data: {
        organizationId: input.organizationId,
        sourceType: 'test_sellpia_product_profitability',
        status: 'completed',
        importedAt: new Date('2026-09-01T00:00:00.000Z'),
      } }),
      prisma.sourceImportRun.create({ data: {
        organizationId: input.organizationId,
        sourceType: 'test_coupang_ad_profitability',
        status: 'completed',
        importedAt: new Date('2026-09-01T00:00:00.000Z'),
      } }),
    ]);
    state = await prisma.masterProductAbcFormulaState.upsert({
      where: { organizationId: input.organizationId },
      create: {
        organizationId: input.organizationId,
        activeFormulaVersionId: formulaVersionId,
        formulaRevision: 1,
        publicationRevision: 1,
        officialCutoffDate: new Date('2026-08-31T00:00:00.000Z'),
        publishedAt: new Date('2026-09-01T00:00:00.000Z'),
        publishedSellpiaOperationId: sellpia.id,
        publishedAdvertisingSourceImportRunId: advertising.id,
        publishedMappingGeneration: 0n,
        mappingGeneration: 0n,
      },
      update: {
        activeFormulaVersionId: formulaVersionId,
        formulaRevision: Math.max(1, state?.formulaRevision ?? 0),
        publicationRevision: Math.max(1, state?.publicationRevision ?? 0),
        officialCutoffDate: new Date('2026-08-31T00:00:00.000Z'),
        publishedAt: new Date('2026-09-01T00:00:00.000Z'),
        publishedSellpiaOperationId: sellpia.id,
        publishedAdvertisingSourceImportRunId: advertising.id,
        publishedMappingGeneration: state?.mappingGeneration ?? 0n,
      },
    });
  }

  const publicationRevision = state!.publicationRevision;
  const formulaRevision = state!.formulaRevision;
  const cutoff = state!.officialCutoffDate!;
  const calculatedAt = state!.publishedAt!;
  const sellpiaOperationId = state!.publishedSellpiaOperationId!;
  const advertisingSourceImportRunId = state!.publishedAdvertisingSourceImportRunId!;
  const mappingGeneration = state!.publishedMappingGeneration!;

  await Promise.all(input.grades.map(({ masterProductId, abcGrade }) =>
    prisma.masterProductAbcEvaluation.upsert({
      where: {
        masterProductId_organizationId: {
          masterProductId,
          organizationId: input.organizationId,
        },
      },
      create: {
        organizationId: input.organizationId,
        masterProductId,
        formulaVersionId,
        abcGrade,
        weightedRevenue: 100,
        weightedOrderTimeSupplyCost: 20,
        weightedAdvertisingSpend: 10,
        weightedOperatingProfit: 70,
        operatingProfitVelocity30: 70,
        operatingMargin: 0.7,
        lossPersistence: 0,
        profitScore: 70,
        marginScore: 100,
        consistencyScore: 100,
        economicScore: abcGrade === 'A' ? 85 : abcGrade === 'B' ? 65 : 20,
        validObservationDays: 30,
        formulaRevision,
        publicationRevision,
        gradeBasisCutoffDate: cutoff,
        saleStartDate: new Date('2026-01-01T00:00:00.000Z'),
        sellpiaOperationId,
        advertisingSourceImportRunId,
        sellpiaGeneration: 1n,
        advertisingGeneration: 1n,
        mappingGeneration,
        calculatedAt,
      },
      update: { abcGrade },
    })));
}
