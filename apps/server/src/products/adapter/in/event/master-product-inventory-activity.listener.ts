import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SELLPIA_INVENTORY_EVENTS,
  type SellpiaInventorySnapshotVerifiedEvent,
} from '../../../../inventory/application/event/sellpia-inventory.events';
import { MasterProductAbcService } from '../../../application/service/master-product-abc.service';

@Injectable()
export class MasterProductInventoryActivityListener {
  constructor(private readonly products: MasterProductAbcService) {}

  @OnEvent(SELLPIA_INVENTORY_EVENTS.SNAPSHOT_VERIFIED)
  async onSellpiaInventorySnapshotVerified(
    event: SellpiaInventorySnapshotVerifiedEvent,
  ): Promise<void> {
    await this.products.reconcileInventoryActivity(event.organizationId);
  }
}
