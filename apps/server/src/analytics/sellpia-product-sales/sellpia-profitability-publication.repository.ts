import { Inject, Injectable } from '@nestjs/common';
import { KiditemConflictError, KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { SellpiaProductProfitabilityResult, SellpiaProfitProduct } from '@kiditem/shared/sellpia-operations';
import type { OwnerTransaction } from '../../common/owner-transaction';
import { ownerTransactionClient } from '../../prisma/owner-transaction';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../products/application/port/in/product-transactional-read.port';
import type { SellpiaProfitabilityPlan } from './domain/sellpia-profitability-operation';
import {
  freezeFacts,
  insertFacts,
  lockMapping,
  readMappingGeneration,
  type InventoryCandidate,
} from './sellpia-profitability-source.internal';

/**
 * 셀피아 상품 손익 원장(`sellpia_product_monthly_sales`) 발행 — 실행 `analytics.sellpia_product_profitability`의 finish
 * 트랜잭션 안에서만 부른다(ADR-0025). 상품 매핑 잠금(`kiditem.product-mapping:<org>`, 트랜잭션 잠금이지 실행 잠금 키가
 * 아니다)을 잡고, 시작할 때의 매핑 세대가 그대로일 때만 제출 상품을 불변 월 사실 한 벌(실행 id)로 넣는다.
 */
@Injectable()
export class SellpiaProfitabilityPublicationRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly products: ProductTransactionalReadPort,
  ) {}

  /** 시작 시점의 상품 매핑 세대(plan에 남긴다). */
  async currentMappingGeneration(organizationId: string): Promise<bigint> {
    return readMappingGeneration(this.prisma as never, organizationId);
  }

  async publish(transaction: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    plan: SellpiaProfitabilityPlan;
    products: readonly SellpiaProfitProduct[];
    contentChecksum: string;
    contentByteCount: number;
  }): Promise<SellpiaProductProfitabilityResult> {
    const tx = ownerTransactionClient(transaction);
    await lockMapping(tx, input.organizationId);
    const mappingGeneration = await readMappingGeneration(tx, input.organizationId);
    if (mappingGeneration.toString() !== input.plan.mappingGeneration) {
      throw new KiditemConflictError('ANALYTICS_SELLPIA_PROFIT_MAPPING_CHANGED', {
        details: { planned: input.plan.mappingGeneration, current: mappingGeneration.toString() },
      });
    }
    const identities = await this.products.readSourceIdentities(
      { client: tx },
      { organizationId: input.organizationId, selector: { kind: 'all' } },
    );
    const candidates: InventoryCandidate[] = identities.map((identity) => ({
      id: identity.masterProductId,
      code: identity.code,
      sourceAccountKey: identity.sourceAccountKey,
      sourceProductCode: identity.sourceProductCode,
      sourceOptionCode: identity.sourceOptionCode,
      barcode: identity.barcode,
      masterProductId: identity.masterProductId,
    }));
    const facts = freezeFacts(input.operationId, input.plan, input.products, candidates);
    // 셀피아가 빈 목록을 주면(상품 0) 빈 세대가 증명된 것이다. 상품은 있는데 월 사실이 하나도 없으면 증명되지 않았다.
    if (facts.length === 0 && input.products.length > 0) {
      throw new KiditemInvalidValueError('ANALYTICS_SELLPIA_PROFIT_EMPTY_UNPROVEN', { details: { products: input.products.length } });
    }
    await insertFacts(tx, input.organizationId, facts);
    const persisted = await tx.sellpiaProductMonthlySales.count({
      where: { organizationId: input.organizationId, operationId: input.operationId },
    });
    if (persisted !== facts.length) {
      throw new Error(`Expected ${facts.length} Sellpia profitability facts, found ${persisted}`);
    }
    const mappedRows = facts.filter((fact) => fact.masterProductId !== null).length;
    return {
      months: input.plan.coveredMonths.length,
      rows: facts.length,
      quality: {
        mappedRows,
        unmappedRows: facts.length - mappedRows,
        contentChecksum: input.contentChecksum,
        contentByteCount: input.contentByteCount,
      },
    };
  }
}
