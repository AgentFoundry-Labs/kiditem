import { Prisma } from '@prisma/client';
import { SELLPIA_PROFITABILITY_SOURCE_TYPE } from '../domain/sellpia-profitability-source';

export type SellpiaProductMonthlyGeneration = Readonly<{
  id: string;
  status: string;
  publicationSequence: bigint;
  mappingGeneration: bigint | null;
  coverageStartDate: Date | null;
  coverageEndDate: Date | null;
  coveredMonths: string[];
  importedAt: Date | null;
  updatedAt: Date;
  contentChecksum: string | null;
  contentByteCount: number | null;
  rowCount: number;
  qualityReport: unknown;
}>;
export type SellpiaProductMonthlyFact = Prisma.SellpiaProductMonthlySalesGetPayload<{}>;

export type SellpiaProductMonthlyFactScope = Readonly<{
  fromYearMonth?: string;
  yearMonths?: readonly string[];
  limit?: number;
}>;

export type SellpiaProductMonthlyFacts = Readonly<{
  generation: SellpiaProductMonthlyGeneration | null;
  facts: SellpiaProductMonthlyFact[];
}>;

export async function readCurrentSellpiaProfitabilityGeneration(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<SellpiaProductMonthlyGeneration | null> {
  return tx.sourceImportRun.findFirst({
    where: publishedGenerationWhere(organizationId),
    orderBy: { publicationSequence: 'desc' },
    select: generationSelect,
  }) as Promise<SellpiaProductMonthlyGeneration | null>;
}

export async function readExactSellpiaProfitabilityGeneration(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; sourceImportRunId: string }>,
): Promise<SellpiaProductMonthlyGeneration | null> {
  return tx.sourceImportRun.findFirst({
    where: {
      ...publishedGenerationWhere(input.organizationId),
      id: input.sourceImportRunId,
    },
    select: generationSelect,
  }) as Promise<SellpiaProductMonthlyGeneration | null>;
}

export async function readCurrentSellpiaProductMonthlyFacts(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    scope?: SellpiaProductMonthlyFactScope;
  }>,
): Promise<SellpiaProductMonthlyFacts> {
  const generation = await readCurrentSellpiaProfitabilityGeneration(tx, input.organizationId);
  return readFacts(tx, input.organizationId, generation, input.scope);
}

export async function readExactSellpiaProductMonthlyFacts(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    sourceImportRunId: string;
    scope?: SellpiaProductMonthlyFactScope;
  }>,
): Promise<SellpiaProductMonthlyFacts> {
  const generation = await readExactSellpiaProfitabilityGeneration(tx, input);
  return readFacts(tx, input.organizationId, generation, input.scope);
}

function publishedGenerationWhere(
  organizationId: string,
): Prisma.SourceImportRunWhereInput {
  return {
    organizationId,
    sourceType: SELLPIA_PROFITABILITY_SOURCE_TYPE,
    status: 'completed',
    publicationSequence: { not: null },
  };
}

const generationSelect = {
  id: true,
  status: true,
  publicationSequence: true,
  mappingGeneration: true,
  coverageStartDate: true,
  coverageEndDate: true,
  coveredMonths: true,
  importedAt: true,
  updatedAt: true,
  contentChecksum: true,
  contentByteCount: true,
  rowCount: true,
  qualityReport: true,
} satisfies Prisma.SourceImportRunSelect;

async function readFacts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  generation: SellpiaProductMonthlyGeneration | null,
  scope: SellpiaProductMonthlyFactScope = {},
): Promise<SellpiaProductMonthlyFacts> {
  if (!generation) return { generation: null, facts: [] };
  const facts = await tx.sellpiaProductMonthlySales.findMany({
    where: {
      organizationId,
      sourceImportRunId: generation.id,
      ...(scope.fromYearMonth ? { yearMonth: { gte: scope.fromYearMonth } } : {}),
      ...(scope.yearMonths ? { yearMonth: { in: [...scope.yearMonths] } } : {}),
    },
    orderBy: [
      { productCode: 'asc' },
      { optionCode: 'asc' },
      { yearMonth: 'asc' },
    ],
    ...(scope.limit ? { take: scope.limit } : {}),
  });
  return { generation, facts };
}
