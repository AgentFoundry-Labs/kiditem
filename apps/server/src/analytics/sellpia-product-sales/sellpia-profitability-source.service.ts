import { Prisma } from '@prisma/client';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { SELLPIA_PRODUCT_PROFITABILITY_KIND } from '@kiditem/shared/sellpia-operations';
import type { SellpiaProfitabilityAttemptSummary } from '@kiditem/shared/source-import';
import {
  type SellpiaProfitabilityGenerationFacts,
  type SellpiaProfitabilitySourceCatalog,
  type SellpiaProfitabilitySourceReadPort,
} from '../application/port/in/sellpia-profitability-source-read.port';
import { PrismaService } from '../../prisma/prisma.service';
import { businessDateKey } from '../../common/kst';
import {
  readLatestOperation,
  type OperationGenerationRow,
} from '../../common/operation/transaction/operation-generations';
import {
  MAX_GENERATION_FACT_ROWS,
  TRANSACTION_TIMEOUT_MS,
  boundedCatalogLimit,
  generationMetadata,
} from './sellpia-profitability-source.internal';
import { storedSellpiaProfitabilityPlan } from './domain/sellpia-profitability-operation';
import {
  readExactSellpiaProductMonthlyFacts,
  readSellpiaProfitabilityGenerations,
} from './read/sellpia-product-monthly-facts';

/**
 * 셀피아 상품 손익 세대의 읽기 문(Finance ABC 근거가 쓰는 `SELLPIA_PROFITABILITY_SOURCE_READ_PORT`). 수집·발행은 실행
 * kind `analytics.sellpia_product_profitability`(KID-361 J3)가 맡고, 여기서는 성공한 실행 = 세대를 읽는다.
 */
@Injectable()
export class SellpiaProfitabilitySourceService
  implements SellpiaProfitabilitySourceReadPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finance-facing read seam. The latest operation and the completed catalog are read from
   * one repeatable snapshot so a new publication cannot be mixed into an in-flight evidence load.
   */
  async readGenerationCatalog(input: {
    organizationId: string;
    limit?: number;
  }): Promise<SellpiaProfitabilitySourceCatalog> {
    const limit = boundedCatalogLimit(input.limit);
    return this.prisma.$transaction(async (tx) => {
      const [latest, completed] = await Promise.all([
        readLatestOperation(tx, { organizationId: input.organizationId, kind: SELLPIA_PRODUCT_PROFITABILITY_KIND }),
        readSellpiaProfitabilityGenerations(tx, { organizationId: input.organizationId, limit }),
      ]);
      return {
        latestAttempt: latest ? attemptSummary(latest) : null,
        completeGenerations: completed.map(generationMetadata),
      };
    }, {
      timeout: TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  /** Reads only the immutable facts belonging to the exact published operation. */
  async readGenerationFacts(input: {
    organizationId: string;
    operationId: string;
    masterProductIds?: readonly string[];
    yearMonths?: readonly string[];
  }): Promise<SellpiaProfitabilityGenerationFacts> {
    return this.prisma.$transaction(async (tx) => {
      const { generation: run, facts: rows } = await readExactSellpiaProductMonthlyFacts(tx, {
        organizationId: input.organizationId,
        operationId: input.operationId,
        scope: { limit: MAX_GENERATION_FACT_ROWS + 1 },
      });
      if (!run) throw new UnprocessableEntityException('SOURCE_GENERATION_NOT_FOUND');
      const generation = generationMetadata(run);
      if (rows.length > MAX_GENERATION_FACT_ROWS) {
        throw new UnprocessableEntityException('SOURCE_FACTS_OVERFLOW');
      }
      if (rows.length !== generation.quality.includedRowCount) {
        throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
      }
      const facts = [] as SellpiaProfitabilityGenerationFacts['facts'][number][];
      const unmappedFacts = [] as SellpiaProfitabilityGenerationFacts['unmappedFacts'][number][];
      const requestedMasterProductIds = input.masterProductIds
        ? new Set(input.masterProductIds)
        : null;
      const requestedYearMonths = input.yearMonths
        ? new Set(input.yearMonths)
        : null;
      for (const row of rows) {
        assertFactProvenance(row);
        if (row.operationId !== input.operationId) {
          throw new UnprocessableEntityException('SOURCE_GENERATION_MISMATCH');
        }
        if (!row.coverageStartDate || !row.coverageEndDate) {
          throw new UnprocessableEntityException('SOURCE_COVERAGE_MALFORMED');
        }
        const coverageStartDate = businessDateKey(row.coverageStartDate);
        const coverageEndDate = businessDateKey(row.coverageEndDate);
        const base = {
          operationId: input.operationId,
          productCode: row.productCode,
          optionCode: row.optionCode,
          yearMonth: row.yearMonth,
          coverageStartDate,
          coverageEndDate,
          revenue: row.orderAmount,
          orderTimeSupplyCost: row.inAmount,
          costBasis: 'ORDER_TIME_SUPPLY_COST' as const,
          vatIncluded: true as const,
          capturedAt: row.capturedAt.toISOString(),
        };
        if (requestedYearMonths && !requestedYearMonths.has(row.yearMonth)) continue;
        const historicalSkuId = row.legacySellpiaInventorySkuId ?? row.masterProductId!;
        if (row.masterProductId === null) {
          unmappedFacts.push({
            ...base,
            sellpiaInventorySkuId: row.legacySellpiaInventorySkuId,
            masterProductId: row.masterProductId,
            reason: 'SOURCE_UNMAPPED',
          });
        } else if (!requestedMasterProductIds || requestedMasterProductIds.has(row.masterProductId)) {
          facts.push({
            ...base,
            sellpiaInventorySkuId: historicalSkuId,
            masterProductId: row.masterProductId,
          });
        }
      }
      return { generation, facts, unmappedFacts };
    }, {
      timeout: TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }
}

/**
 * 최신 실행을 옛 attempt 요약 모양으로(ABC 준비 상태가 상태·오류 코드를 본다). 임대 만료는 `readLatestOperation`이
 * 실행 계약 규칙대로 이미 비춰 준다.
 */
function attemptSummary(operation: OperationGenerationRow): SellpiaProfitabilityAttemptSummary {
  const plan = storedSellpiaProfitabilityPlan(operation.plan);
  const running = operation.status === 'executing' || operation.status === 'prepared';
  return {
    attemptId: operation.id,
    state: operation.status === 'succeeded' ? 'COMPLETE' : running ? 'RUNNING' : 'FAILED',
    expiresAt: operation.expiresAt.toISOString(),
    capturedAt: operation.startedAt.toISOString(),
    generation: operation.status === 'succeeded' && operation.finishedAt ? String(operation.finishedAt.getTime()) : null,
    errorCode: operation.errorCode,
    errorMessage: operation.errorMessage,
    plan: { from: plan.from, to: plan.to, coveredMonths: [...plan.coveredMonths] },
  };
}

function assertFactProvenance(row: {
  costBasis: string;
  vatIncluded: boolean | null;
}): void {
  if (row.costBasis !== 'ORDER_TIME_SUPPLY_COST' || row.vatIncluded !== true) {
    throw new UnprocessableEntityException('SOURCE_PROVENANCE_MALFORMED');
  }
}
