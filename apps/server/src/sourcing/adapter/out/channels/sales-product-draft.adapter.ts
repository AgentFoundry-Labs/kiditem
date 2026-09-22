import { Inject, Injectable } from '@nestjs/common';
import {
  SALES_PRODUCT_PORT,
  type SalesProductPort,
} from '../../../../channels/application/port/in/sales-product.port';
import type {
  SalesProductDraftPort,
  SalesProductDraftSourceFacts,
} from '../../../application/port/out/cross-domain/sales-product-draft.port';

/** Sourcing → Channels. 초안 행은 Channels 가 쓴다; 여기서는 그 공개 계약만 부른다. */
@Injectable()
export class SalesProductDraftAdapter implements SalesProductDraftPort {
  constructor(@Inject(SALES_PRODUCT_PORT) private readonly salesProducts: SalesProductPort) {}

  async createFromSource(
    organizationId: string,
    input: SalesProductDraftSourceFacts,
  ): Promise<{ salesProductId: string }> {
    const draft = await this.salesProducts.createFromSource(organizationId, input);
    return { salesProductId: draft.id };
  }

  findDraftIdForSource(organizationId: string, candidateId: string): Promise<string | null> {
    return this.salesProducts.findDraftIdForSource(organizationId, candidateId);
  }

  async retireForSource(organizationId: string, candidateId: string) {
    return this.salesProducts.retireDraftForSource(organizationId, candidateId);
  }
}
