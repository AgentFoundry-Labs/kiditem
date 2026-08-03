import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
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
import {
  RocketPreviewQuantityExceededError,
  previewRocketCapacity,
  resolveRocketPreviewEditedQuantity,
} from '../../domain/policy/rocket-capacity-preview';
import type { RocketPurchasePreviewPort } from '../port/in/procurement/rocket-purchase-preview.port';

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
    inventoryRequirement: 'advisory' | 'fresh';
    request: RocketPurchasePreviewRequest;
  }): Promise<RocketPurchasePreviewResponse> {
    const request = RocketPurchasePreviewRequestSchema.parse(input.request);
    const catalog = await this.catalog.publishAndResolve({
      organizationId: input.organizationId,
      userId: input.userId,
      request,
    });
    const selectedRows = previewRowsForScope(request);
    if (catalog.blockingReason) {
      return translatePreviewPolicy(() => ({
        status: 'ready' as const,
        collectionRunId: request.collection.collectionRunId,
        catalog: null,
        inventoryGeneration: null,
        rows: selectedRows.map((row) => {
          const editedQuantity = resolveRocketPreviewEditedQuantity(
            row.poLineId,
            request.editedQuantities[row.poLineId] ?? null,
            0,
            request.clampEditedQuantities === true,
          );
          return {
            poLineId: row.poLineId,
            poNumber: row.poNumber,
            productNo: row.productNo,
            productName: row.productName,
            plannedDeliveryDate: row.plannedDeliveryDate,
            orderQuantity: row.orderQty,
            recommendedQuantity: 0,
            maxQuantity: 0,
            editedQuantity,
            reason: catalog.blockingReason,
            channelListingOptionId: null,
            masterProductId: null,
            components: [],
          };
        }),
      }));
    }

    const identityByLine = new Map(catalog.identities.map((identity) =>
      [identity.poLineId, identity.channelSkuId]));
    const channelSkuIds = [...new Set(catalog.identities.map(({ channelSkuId }) =>
      channelSkuId))];
    const availability = channelSkuIds.length > 0
      ? await this.availability.findByChannelSkuIds(input.organizationId, channelSkuIds)
      : [];
    const availabilityBySku = new Map(availability.map((item) => [item.sku.id, item]));
    const previewRows = selectedRows.map((row) => {
      const channelSkuId = identityByLine.get(row.poLineId) ?? null;
      const item = channelSkuId ? availabilityBySku.get(channelSkuId) : undefined;
      return {
        poLineId: row.poLineId,
        poNumber: row.poNumber,
        productNo: row.productNo,
        productName: row.productName,
        plannedDeliveryDate: row.plannedDeliveryDate,
        orderQuantity: row.orderQty,
        channelListingOptionId: channelSkuId,
        masterProductId: item?.masterProductId ?? null,
        recipeStatus: item?.recipeStatus ?? 'unmatched' as const,
        components: item?.components.map((component) => ({
          sellpiaInventorySkuId: component.sellpiaInventorySkuId,
          code: component.code,
          name: component.name,
          optionName: component.optionName,
          quantity: component.quantity,
          currentStock: component.currentStock,
          isActive: component.isActive,
        })) ?? [],
      };
    });
    const sellpiaInventorySkuIds = [...new Set(previewRows
      .filter(({ recipeStatus }) => recipeStatus === 'matched')
      .flatMap(({ components }) => components
        .map(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId)))];
    const calculateRows = () => translatePreviewPolicy(() => previewRocketCapacity({
      rows: previewRows,
      editedQuantities: request.editedQuantities,
      clampEditedQuantities: request.clampEditedQuantities,
    }));
    let inventoryGeneration: string | null = null;
    if (
      input.inventoryRequirement === 'fresh'
      && sellpiaInventorySkuIds.length > 0
    ) {
      const gated = await this.freshness.readFreshCapacityOrRequest({
        organizationId: input.organizationId,
        sellpiaInventorySkuIds,
      });
      if (gated.status === 'refresh_required') {
        if (!catalog.catalog) {
          throw new InternalServerErrorException(
            'Rocket catalog checkpoint is missing before inventory refresh',
          );
        }
        return {
          status: 'freshness_pending',
          collectionRunId: request.collection.collectionRunId,
          catalog: catalog.catalog,
          requestedGeneration: gated.requestedGeneration,
          rows: calculateRows(),
        };
      }
      inventoryGeneration = gated.generation;
      const inventorySkuById = new Map(gated.inventorySkus.map((sku) =>
        [sku.sellpiaInventorySkuId, sku]));
      for (const row of previewRows) {
        row.components = row.components.map((component) => {
          const inventorySku = inventorySkuById.get(
            component.sellpiaInventorySkuId,
          );
          return {
            ...component,
            currentStock: inventorySku?.currentStock ?? 0,
            isActive: inventorySku?.isActive ?? false,
          };
        });
      }
    }

    return {
      status: 'ready',
      collectionRunId: request.collection.collectionRunId,
      catalog: catalog.catalog,
      inventoryGeneration,
      rows: calculateRows(),
    };
  }
}

function previewRowsForScope(
  request: RocketPurchasePreviewRequest,
): RocketPurchasePreviewRequest['rows'] {
  if (request.previewScope !== 'confirmation_requested') return request.rows;
  return request.rows.filter((row) => (
    ['RI', 'RP'].includes(row.poStatusCode?.toUpperCase() ?? '')
    || ['거래명세서확인요청', '거래처확인요청'].includes(
      row.confirmation?.poStatus.trim() ?? '',
    )
  ));
}

function translatePreviewPolicy<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof RocketPreviewQuantityExceededError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
