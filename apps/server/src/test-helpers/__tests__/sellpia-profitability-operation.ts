import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { SELLPIA_PRODUCT_PROFITABILITY_KIND, type SellpiaProfitProduct } from '@kiditem/shared/sellpia-operations';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  monthsBetween,
  sellpiaProfitabilityPlan,
  sellpiaProfitabilitySubmission,
  SELLPIA_PROFITABILITY_PARSER_VERSION,
  type SellpiaProfitabilityPlan,
} from '../../analytics/sellpia-product-sales/domain/sellpia-profitability-operation';
import { SellpiaProfitabilityPublicationRepository } from '../../analytics/sellpia-product-sales/sellpia-profitability-publication.repository';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';

/**
 * 성공한 셀피아 상품 손익 실행(`analytics.sellpia_product_profitability`) 한 줄 — 세대를 읽는 스펙(ABC·재고 분석·Finance)이
 * 발행을 거치지 않고 세대를 세울 때 쓴다(KID-361 J3). 발행 자체는 owner PG 스펙이 실행 계약으로 증명한다. 월 사실은
 * 호출자가 `operationId`로 넣는다. 범위를 주지 않으면 `finishedAt` 기준 owner plan(어제까지 401일)이다.
 */
export async function seedSellpiaProfitabilityOperation(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    from?: string;
    to?: string;
    mappingGeneration?: bigint;
    rows?: number;
    mappedRows?: number;
    finishedAt?: Date;
    status?: 'succeeded' | 'failed' | 'executing';
    contentChecksum?: string;
    contentByteCount?: number;
  },
): Promise<{ id: string; from: string; to: string; coveredMonths: string[] }> {
  const finishedAt = input.finishedAt ?? new Date();
  const mappingGeneration = input.mappingGeneration ?? 0n;
  const planned = sellpiaProfitabilityPlan({}, finishedAt, mappingGeneration);
  const from = input.from ?? planned.from;
  const to = input.to ?? planned.to;
  const coveredMonths = monthsBetween(from, to);
  const rows = input.rows ?? 0;
  const mappedRows = input.mappedRows ?? rows;
  const id = randomUUID();
  const status = input.status ?? 'succeeded';
  await prisma.operation.create({
    data: {
      id,
      organizationId: input.organizationId,
      kind: SELLPIA_PRODUCT_PROFITABILITY_KIND,
      status,
      token: randomUUID(),
      expiresAt: new Date(finishedAt.getTime() + 30 * 60_000),
      plan: { parserVersion: SELLPIA_PROFITABILITY_PARSER_VERSION, from, to, coveredMonths, mappingGeneration: mappingGeneration.toString() },
      result: status === 'succeeded'
        ? {
          months: coveredMonths.length,
          rows,
          quality: {
            mappedRows,
            unmappedRows: rows - mappedRows,
            contentChecksum: input.contentChecksum ?? 'a'.repeat(64),
            contentByteCount: input.contentByteCount ?? 128,
          },
        }
        : undefined,
      windowStart: new Date(`${from}T00:00:00.000Z`),
      windowEnd: new Date(`${to}T00:00:00.000Z`),
      errorCode: status === 'failed' ? 'TEST_FAILED_GENERATION' : null,
      // 끝난 세대는 1분 전에 시작했고, 실패·도는 실행은 지금 시작했다(가장 최근 시도로 읽힌다).
      startedAt: status === 'succeeded' ? new Date(finishedAt.getTime() - 60_000) : finishedAt,
      finishedAt: status === 'executing' ? null : finishedAt,
      attempts: 1,
    },
  });
  return { id, from, to, coveredMonths };
}

/**
 * 실제 발행 경로(`SellpiaProfitabilityPublicationRepository.publish` — owner finalize가 부르는 것)로 세대 하나를 세운다.
 * 실행 계약 HTTP 없이 실행 줄을 열고, 한 트랜잭션에서 발행한 뒤 성공으로 닫는다. 지금 시각(`Date.now()`, 가짜 시계 포함)이
 * plan을 정한다. `products`는 plan(덮을 달)을 받아 제출 상품을 만든다.
 */
export async function publishSellpiaProfitability(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    products: (plan: SellpiaProfitabilityPlan) => SellpiaProfitProduct[];
    normalizedSourceAvailabilityDate?: string;
  },
): Promise<{ operationId: string; plan: SellpiaProfitabilityPlan }> {
  const publication = new SellpiaProfitabilityPublicationRepository(
    prisma as never,
    new SourceFailureAlerts(prisma as never),
    new ProductTransactionalReadRepositoryAdapter(),
  );
  const now = new Date();
  const plan = sellpiaProfitabilityPlan(
    input.normalizedSourceAvailabilityDate ? { normalizedSourceAvailabilityDate: input.normalizedSourceAvailabilityDate } : {},
    now,
    await publication.currentMappingGeneration(input.organizationId),
  );
  const operationId = randomUUID();
  await prisma.operation.create({
    data: {
      id: operationId,
      organizationId: input.organizationId,
      kind: SELLPIA_PRODUCT_PROFITABILITY_KIND,
      status: 'executing',
      token: randomUUID(),
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      plan: { ...plan },
      windowStart: new Date(`${plan.from}T00:00:00.000Z`),
      windowEnd: new Date(`${plan.to}T00:00:00.000Z`),
      startedAt: now,
      attempts: 1,
    },
  });
  const submission = sellpiaProfitabilitySubmission(
    [{ chunkKind: 'profit_months', sequence: 1, payload: input.products(plan) } as never],
    plan,
  );
  await prisma.$transaction(async (tx) => {
    const result = await publication.publish(ownerTransaction(tx), {
      organizationId: input.organizationId,
      operationId,
      plan,
      ...submission,
    });
    await tx.operation.update({
      where: { id: operationId },
      data: { status: 'succeeded', result, finishedAt: new Date() },
    });
  });
  return { operationId, plan };
}
