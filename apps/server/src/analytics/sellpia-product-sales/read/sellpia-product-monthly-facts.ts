import { Prisma } from '@prisma/client';
import {
  SELLPIA_PRODUCT_PROFITABILITY_KIND,
  SellpiaProductProfitabilityResultSchema,
} from '@kiditem/shared/sellpia-operations';
import {
  readSucceededOperationGenerations,
  type OperationGenerationRow,
} from '../../../common/operation/transaction/operation-generations';
import { storedSellpiaProfitabilityPlan } from '../domain/sellpia-profitability-operation';

/**
 * 셀피아 상품 손익 세대 = 성공한 `analytics.sellpia_product_profitability` 실행 하나(KID-361 J3). 실행마다 월 사실
 * 한 벌을 불변으로 남기고(`operationId`), 세대의 범위·매핑 세대는 plan, 줄 수·품질 값은 result, 발행 시각은 실행이 끝난
 * 시각이다. `publicationSequence`는 끝난 시각(ms)이다 — 끝난 순서가 곧 발행 순서다.
 */
export type SellpiaProductMonthlyGeneration = Readonly<{
  id: string;
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
  const [latest] = await readSellpiaProfitabilityGenerations(tx, { organizationId, limit: 1 });
  return latest ?? null;
}

export async function readExactSellpiaProfitabilityGeneration(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; operationId: string }>,
): Promise<SellpiaProductMonthlyGeneration | null> {
  const [exact] = await readSellpiaProfitabilityGenerations(tx, { organizationId: input.organizationId, id: input.operationId });
  return exact ?? null;
}

/** 최신 먼저. `limit`을 주면 그만큼만. */
export async function readSellpiaProfitabilityGenerations(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; id?: string; limit?: number }>,
): Promise<SellpiaProductMonthlyGeneration[]> {
  const rows = await readSucceededOperationGenerations(tx, {
    organizationId: input.organizationId,
    kind: SELLPIA_PRODUCT_PROFITABILITY_KIND,
    ...(input.id ? { id: input.id } : {}),
    ...(input.limit ? { limit: input.limit } : {}),
  });
  return rows.map(toGeneration);
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
    operationId: string;
    scope?: SellpiaProductMonthlyFactScope;
  }>,
): Promise<SellpiaProductMonthlyFacts> {
  const generation = await readExactSellpiaProfitabilityGeneration(tx, input);
  return readFacts(tx, input.organizationId, generation, input.scope);
}

/**
 * 성공한 실행 → 세대. plan·result가 계약 모양이 아니면(쓴 적 없는 모양) 무결성 오류다. 품질 보고서는 옛 run의
 * `qualityReport`와 같은 모양으로 다시 세워, 세대 검증(`generationMetadata`)이 옛 규칙 그대로 돈다.
 */
function toGeneration(row: OperationGenerationRow): SellpiaProductMonthlyGeneration {
  const plan = storedSellpiaProfitabilityPlan(row.plan);
  const result = SellpiaProductProfitabilityResultSchema.safeParse(row.result);
  if (!result.success || !row.finishedAt) {
    throw new Error(`Sellpia profitability operation ${row.id} lacks its publication result.`);
  }
  const { rows, quality } = result.data;
  return {
    id: row.id,
    publicationSequence: BigInt(row.finishedAt.getTime()),
    mappingGeneration: BigInt(plan.mappingGeneration),
    coverageStartDate: row.windowStart,
    coverageEndDate: row.windowEnd,
    coveredMonths: [...plan.coveredMonths],
    importedAt: row.finishedAt,
    updatedAt: row.finishedAt,
    contentChecksum: quality.contentChecksum,
    contentByteCount: quality.contentByteCount,
    rowCount: rows,
    qualityReport: {
      contract: plan.parserVersion,
      parserVersion: plan.parserVersion,
      correctedCostEvidence: true,
      provenance: { source: 'sellpia_stat_prd_profit', costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: true },
      contentChecksum: quality.contentChecksum,
      contentByteCount: quality.contentByteCount,
      mappingGeneration: plan.mappingGeneration,
      includedRowCount: rows,
      excludedRowCount: 0,
      mappedRowCount: quality.mappedRows,
      unmappedRowCount: quality.unmappedRows,
      warningCount: quality.unmappedRows,
    },
  };
}

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
      operationId: generation.id,
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
