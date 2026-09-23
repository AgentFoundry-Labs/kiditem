import { Inject, Injectable } from '@nestjs/common';
import {
  SALES_PRODUCT_PORT,
  type SalesProductPort,
} from '../../../../channels/application/port/in/sales-product.port';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { SalesProduct, SalesProductStatus } from '@kiditem/shared/sales-product';
import type {
  SalesProductDraftFacts,
  SalesProductDraftPort,
} from '../../../application/port/out/cross-domain/sales-product-draft.port';

/** Sourcing → Channels. 초안 행은 Channels 가 쓴다; 여기서는 그 공개 계약만 부른다. */
@Injectable()
export class SalesProductDraftAdapter implements SalesProductDraftPort {
  constructor(@Inject(SALES_PRODUCT_PORT) private readonly salesProducts: SalesProductPort) {}

  findForSourceRecord(
    organizationId: string,
    sourceRecordId: string,
    transaction?: OwnerTransaction,
  ): Promise<{ salesProductId: string; status: SalesProductStatus } | null> {
    return this.salesProducts.findForSourceRecord(organizationId, sourceRecordId, transaction);
  }

  async createDraft(
    transaction: OwnerTransaction,
    organizationId: string,
    facts: SalesProductDraftFacts,
  ): Promise<{ salesProductId: string }> {
    return { salesProductId: await this.salesProducts.createDraft(organizationId, facts, transaction) };
  }

  getDraft(organizationId: string, salesProductId: string): Promise<SalesProduct> {
    return this.salesProducts.get(organizationId, salesProductId);
  }
}
