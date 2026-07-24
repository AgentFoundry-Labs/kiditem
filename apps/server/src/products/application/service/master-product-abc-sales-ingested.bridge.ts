import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SELLPIA_PRODUCT_SALES_EVENTS,
  type SellpiaProductSalesIngestedEvent,
} from '../../../analytics/sellpia-product-sales/sellpia-product-sales.events';
import { MasterProductAbcService } from './master-product-abc.service';

@Injectable()
export class MasterProductAbcSalesIngestedBridge {
  constructor(private readonly abc: MasterProductAbcService) {}

  @OnEvent(SELLPIA_PRODUCT_SALES_EVENTS.INGESTED)
  async onSellpiaProductSalesIngested(event: SellpiaProductSalesIngestedEvent): Promise<void> {
    await this.abc.recalculate(event.organizationId);
  }
}
