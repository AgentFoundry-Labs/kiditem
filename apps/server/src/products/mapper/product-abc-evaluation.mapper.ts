import { ProductAbcEvaluationSchema, ProductAbcFormulaPayloadSchema, type ProductAbcEvaluation } from '@kiditem/shared/product-abc';
import type { Prisma } from '@prisma/client';

function productAbcGrade(value: string | null): 'A' | 'B' | 'C' | null {
  return value === 'A' || value === 'B' || value === 'C' ? value : null;
}

export function productAbcEvaluation(
  row: Prisma.MasterProductAbcEvaluationGetPayload<{ include: { formulaVersion: true } }> | null,
) : ProductAbcEvaluation | null {
  if (!row) return null;
  const formula = row.formulaVersion
    ? ProductAbcFormulaPayloadSchema.safeParse(row.formulaVersion.formulaJson)
    : null;
  const parsed = ProductAbcEvaluationSchema.safeParse({
    abcGrade: productAbcGrade(row.abcGrade),
    weightedRevenue: decimalToFinite(row.weightedRevenue),
    weightedOrderTimeSupplyCost: decimalToFinite(row.weightedOrderTimeSupplyCost),
    weightedAdvertisingSpend: decimalToFinite(row.weightedAdvertisingSpend),
    weightedOperatingProfit: decimalToFinite(row.weightedOperatingProfit),
    operatingProfitVelocity30: decimalToFinite(row.operatingProfitVelocity30),
    operatingMargin: decimalToFinite(row.operatingMargin),
    lossPersistence: decimalToFinite(row.lossPersistence),
    profitScore: decimalToFinite(row.profitScore),
    marginScore: decimalToFinite(row.marginScore),
    consistencyScore: decimalToFinite(row.consistencyScore),
    economicScore: decimalToFinite(row.economicScore),
    validObservationDays: row.validObservationDays,
    formula: formula?.success ? formula.data : null,
    formulaRevision: row.formulaRevision,
    publicationRevision: row.publicationRevision,
    gradeBasisCutoffDate: calendarDate(row.gradeBasisCutoffDate),
    saleStartDate: row.saleStartDate ? calendarDate(row.saleStartDate) : null,
    sellpiaSourceImportRunId: row.sellpiaSourceImportRunId,
    advertisingSourceImportRunId: row.advertisingSourceImportRunId,
    sellpiaGeneration: row.sellpiaGeneration.toString(),
    advertisingGeneration: row.advertisingGeneration.toString(),
    mappingGeneration: row.mappingGeneration.toString(),
    calculatedAt: row.calculatedAt,
  });
  return parsed.success ? parsed.data : null;
}

function decimalToFinite(value: Prisma.Decimal | null): number | null {
  if (value === null) return null;
  const number = value.toNumber();
  return Number.isFinite(number) ? number : null;
}

function calendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
