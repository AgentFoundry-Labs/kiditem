import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  ROCKET_CONFIRMATION_REQUEST_STATUSES,
  RocketPurchasePreviewRequestSchema,
  RocketPurchasePreviewDecisionSchema,
  type RocketPurchasePreviewRequest,
  type RocketPurchasePreviewResponse,
  type RocketPoCatalogRow,
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
    request: RocketPurchasePreviewRequest;
  }): Promise<RocketPurchasePreviewResponse> {
    const parsed = RocketPurchasePreviewRequestSchema.safeParse(input.request);
    if (!parsed.success) throw new BadRequestException('ROCKET_PREVIEW_REQUEST_INVALID');
    const catalog = await this.catalog.readComplete({
      organizationId: input.organizationId,
      channelAccountId: parsed.data.channelAccountId,
      sourceImportRunId: parsed.data.sourceImportRunId,
    });
    const { sourceImportRunId: _sourceId, inventoryAttemptId, ...decisionFields } = parsed.data;
    const decision = RocketPurchasePreviewDecisionSchema.safeParse({ ...decisionFields, collection: catalog.collection, rows: catalog.rows });
    if (!decision.success) throw new BadRequestException(decision.error.message);
    const request = decision.data;
    const selectedRows = previewRowsForScope(request);

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
    const collected = await this.freshness.requireCollectedStock({
      organizationId: input.organizationId,
      attemptId: inventoryAttemptId,
      sellpiaInventorySkuIds,
    });
    const inventoryGeneration = collected.generation;
    const stockById = new Map(collected.inventorySkus.map((sku) =>
      [sku.sellpiaInventorySkuId, sku.currentStock]));
    for (const row of previewRows) {
      row.components = row.components.map((component) => ({
        ...component,
        currentStock: stockById.get(component.sellpiaInventorySkuId) ?? null,
      }));
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
  request: { rows: RocketPoCatalogRow[]; previewScope?: RocketPurchasePreviewRequest['previewScope'] },
): RocketPoCatalogRow[] {
  if (request.previewScope !== 'confirmation_requested') return request.rows;
  return request.rows.filter((row) => (
    ['RI', 'RP'].includes(row.poStatusCode?.toUpperCase() ?? '')
    || ROCKET_CONFIRMATION_REQUEST_STATUSES.some(
      (status) => status === (row.confirmation?.poStatus.trim() ?? ''),
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
