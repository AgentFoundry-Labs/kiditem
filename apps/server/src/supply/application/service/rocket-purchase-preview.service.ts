import { Inject, Injectable } from '@nestjs/common';
import {
  RocketPurchasePreviewRequestSchema,
  type RocketPurchasePreviewRequest,
  type RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import {
  ROCKET_PO_CATALOG_PORT,
  type RocketPoCatalogPort,
} from '../../../channels/application/port/in/rocket-po-catalog.port';
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
  type ChannelSkuAvailabilityPort,
} from '../../../channels/application/port/in/channel-sku-availability.port';
import {
  SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
  type SellpiaInventoryFreshnessGatePort,
} from '../../../inventory/application/port/in/stock/sellpia-inventory-freshness-gate.port';
import type { RocketPurchasePreviewPort } from '../port/in/procurement/rocket-purchase-preview.port';
import { previewRocketCapacity } from '../../domain/policy/rocket-capacity-preview';

@Injectable()
export class RocketPurchasePreviewService implements RocketPurchasePreviewPort {
  constructor(
    @Inject(ROCKET_PO_CATALOG_PORT)
    private readonly catalog: RocketPoCatalogPort,
    @Inject(CHANNEL_SKU_AVAILABILITY_PORT)
    private readonly availability: ChannelSkuAvailabilityPort,
    @Inject(SELLPIA_INVENTORY_FRESHNESS_GATE_PORT)
    private readonly freshness: SellpiaInventoryFreshnessGatePort,
  ) {}

  async preview(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchasePreviewRequest;
  }): Promise<RocketPurchasePreviewResponse> {
    const request = RocketPurchasePreviewRequestSchema.parse(input.request);
    const catalog = await this.catalog.publishAndResolve({
      organizationId: input.organizationId,
      userId: input.userId,
      request,
    });
    if (catalog.blockingReason) {
      return {
        collectionRunId: request.collection.collectionRunId,
        catalog: null,
        rows: request.rows.map((row) => ({
          poLineId: row.poLineId,
          poNumber: row.poNumber,
          productNo: row.productNo,
          productName: row.productName,
          orderQuantity: row.orderQty,
          recommendedQuantity: 0,
          maxQuantity: 0,
          editedQuantity: request.editedQuantities[row.poLineId] ?? null,
          reason: catalog.blockingReason,
          channelSkuId: null,
          components: [],
        })),
      };
    }

    const identityByLine = new Map(catalog.identities.map((identity) =>
      [identity.poLineId, identity.channelSkuId]));
    const channelSkuIds = [...new Set(catalog.identities.map(({ channelSkuId }) =>
      channelSkuId))];
    const availability = channelSkuIds.length > 0
      ? await this.availability.findByChannelSkuIds(input.organizationId, channelSkuIds)
      : [];
    const availabilityBySku = new Map(availability.map((item) => [item.sku.id, item]));
    const previewRows = request.rows.map((row) => {
      const channelSkuId = identityByLine.get(row.poLineId) ?? null;
      const item = channelSkuId ? availabilityBySku.get(channelSkuId) : undefined;
      return {
        poLineId: row.poLineId,
        poNumber: row.poNumber,
        productNo: row.productNo,
        productName: row.productName,
        plannedDeliveryDate: row.plannedDeliveryDate,
        orderQuantity: row.orderQty,
        channelSkuId,
        components: item?.components.map((component) => ({
          masterProductId: component.masterProductId,
          quantity: component.quantity,
          currentStock: component.currentStock,
          isActive: component.isActive,
        })) ?? [],
      };
    });
    const activeMasterProductIds = [...new Set(previewRows.flatMap(({ components }) =>
      components.filter(({ isActive }) => isActive)
        .map(({ masterProductId }) => masterProductId)))];
    if (activeMasterProductIds.length > 0) {
      await this.freshness.assertFreshAndActive({
        organizationId: input.organizationId,
        masterProductIds: activeMasterProductIds,
      });
    }

    return {
      collectionRunId: request.collection.collectionRunId,
      catalog: catalog.catalog,
      rows: previewRocketCapacity({
        rows: previewRows,
        editedQuantities: request.editedQuantities,
      }),
    };
  }
}
