import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  CreateMasterProductInputSchema,
  CreateProductVariantRecipesIfEmptyInputSchema,
  CreateProductVariantInputSchema,
  MasterProductOperationsListQuerySchema,
  UpdateMasterProductInputSchema,
  UpdateProductVariantInputSchema,
  ReplaceProductVariantRecipeInputSchema,
  type CreateMasterProductInput,
  type CreateProductVariantInput,
  type UpdateMasterProductInput,
  type UpdateProductVariantInput,
  type ProductDepletionProjection,
  type ProductOperationsListSummary,
} from '@kiditem/shared/product-operations';
import {
  PRODUCT_OPERATIONS_REPOSITORY_PORT,
  type NormalizedCreateProductVariant,
  type ProductOperationsRepositoryPort,
} from '../port/out/repository/product-operations.repository.port';
import {
  INVENTORY_AVAILABILITY_PORT,
  type InventoryAvailabilityPort,
} from '../../../inventory/application/port/in/stock/inventory-availability.port';
import {
  SELLPIA_PRODUCT_DEPLETION_READ_PORT,
  type SellpiaProductDepletionReadPort,
} from '../../../analytics/sellpia-product-sales/sellpia-product-depletion-read.port';
import {
  mapProductOperationsDetail,
  mapProductOperationsListItem,
  mapProductOperationsVariant,
} from '../../mapper/product-operations-inventory.mapper';
import {
  CATALOG_DISPLAY_MEDIA_PORT,
  type CatalogDisplayMediaPort,
} from '../../../ai/application/port/in/workspace/catalog-display-media.port';
import type { ProductOperationsPort } from '../port/in/product-operations.port';

@Injectable()
export class ProductOperationsService implements ProductOperationsPort {
  private readonly logger = new Logger(ProductOperationsService.name);

  constructor(
    @Inject(PRODUCT_OPERATIONS_REPOSITORY_PORT)
    private readonly repository: ProductOperationsRepositoryPort,
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly inventory: InventoryAvailabilityPort,
    @Inject(SELLPIA_PRODUCT_DEPLETION_READ_PORT)
    private readonly depletion: SellpiaProductDepletionReadPort,
    @Inject(CATALOG_DISPLAY_MEDIA_PORT)
    private readonly catalogDisplayMedia: CatalogDisplayMediaPort,
  ) {}

  async listProducts(organizationId: string, rawQuery: unknown) {
    const query = parseOrBadRequest(
      MasterProductOperationsListQuerySchema,
      rawQuery,
      'Invalid product operations query',
    );
    const raw = await this.repository.listProducts(organizationId, query);
    const inventoryBySkuId = await this.loadInventory(
      organizationId,
      raw.items.flatMap(({ variants }) => variants),
    );
    const placeholder = noDirectSales();
    const hydrated = raw.items.map((item) =>
      mapProductOperationsListItem(item, inventoryBySkuId, placeholder));
    const filtered = query.inventoryStatus
      ? hydrated.filter(({ inventoryStatus }) =>
        inventoryStatus === query.inventoryStatus)
      : hydrated;
    const summaryMasterProductIds = filtered.map(({ id }) => id);
    const depletionByMasterProductId = await this.depletion.findByMasterProductIds({
      organizationId,
      masterProductIds: summaryMasterProductIds,
    });
    const items = filtered.map((item) => ({
      ...item,
      depletion: depletionByMasterProductId.get(item.id) ?? placeholder,
    }));
    const offset = (query.page - 1) * query.limit;
    const pageItems = items.slice(offset, offset + query.limit);
    return {
      items: await this.applyDisplayImages(organizationId, pageItems),
      total: items.length,
      page: query.page,
      limit: query.limit,
      summary: summarizeProducts(items),
    };
  }

  async getProduct(organizationId: string, masterProductId: string) {
    const product = await this.repository.getProduct(organizationId, masterProductId);
    const mapped = mapProductOperationsDetail(
      product,
      await this.loadInventory(organizationId, product.variants),
    );
    return (await this.applyDisplayImages(organizationId, [mapped]))[0]!;
  }

  async createProduct(
    organizationId: string,
    userId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      CreateMasterProductInputSchema,
      omitLegacyAbcGrade(rawInput),
      'Invalid MasterProduct creation',
    );
    const variants = input.variants?.map(normalizeVariant) ?? [{
      code: `${input.code.slice(0, 92)}-DEFAULT`,
      name: input.name,
      optionLabel: null,
      isDefault: true,
      isActive: true,
      components: [],
    }];
    const product = await this.repository.createProduct({
      organizationId,
      userId,
      product: { ...input, variants },
    });
    const mapped = mapProductOperationsDetail(
      product,
      await this.loadInventory(organizationId, product.variants),
    );
    return (await this.applyDisplayImages(organizationId, [mapped]))[0]!;
  }

  async updateProduct(
    organizationId: string,
    masterProductId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      UpdateMasterProductInputSchema,
      omitLegacyAbcGrade(rawInput),
      'Invalid MasterProduct update',
    );
    const product = await this.repository.updateProduct(
      organizationId,
      masterProductId,
      input,
    );
    const mapped = mapProductOperationsDetail(
      product,
      await this.loadInventory(organizationId, product.variants),
    );
    return (await this.applyDisplayImages(organizationId, [mapped]))[0]!;
  }

  async createVariant(
    organizationId: string,
    userId: string,
    masterProductId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      CreateProductVariantInputSchema,
      rawInput,
      'Invalid ProductVariant creation',
    );
    const variant = await this.repository.createVariant({
      organizationId,
      userId,
      masterProductId,
      variant: normalizeVariant(input),
    });
    return mapProductOperationsVariant(
      variant,
      await this.loadInventory(organizationId, [variant]),
    );
  }

  async updateVariant(
    organizationId: string,
    productVariantId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      UpdateProductVariantInputSchema,
      rawInput,
      'Invalid ProductVariant update',
    );
    const variant = await this.repository.updateVariant(
      organizationId,
      productVariantId,
      input,
    );
    return mapProductOperationsVariant(
      variant,
      await this.loadInventory(organizationId, [variant]),
    );
  }

  async replaceRecipe(
    organizationId: string,
    userId: string,
    productVariantId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      ReplaceProductVariantRecipeInputSchema,
      rawInput,
      'Invalid ProductVariant recipe replacement',
    );
    const variant = await this.repository.replaceRecipe({
      organizationId,
      userId,
      productVariantId,
      components: input.components,
      expectedRecipe: input.expectedRecipe,
    });
    return mapProductOperationsVariant(
      variant,
      await this.loadInventory(organizationId, [variant]),
    );
  }

  async planRecipesIfEmpty(
    organizationId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      CreateProductVariantRecipesIfEmptyInputSchema,
      rawInput,
      'Invalid create-if-empty ProductVariant recipe plan',
    );
    return this.repository.planManualRecipesIfEmpty({
      organizationId,
      recipes: input.recipes,
    });
  }

  async createRecipesIfEmpty(
    organizationId: string,
    userId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      CreateProductVariantRecipesIfEmptyInputSchema,
      rawInput,
      'Invalid create-if-empty ProductVariant recipe batch',
    );
    return this.repository.createManualRecipesIfEmpty({
      organizationId,
      userId,
      recipes: input.recipes,
    });
  }

  private async loadInventory(
    organizationId: string,
    variants: Array<{ components: Array<{ sellpiaInventorySkuId: string }> }>,
  ) {
    const sellpiaInventorySkuIds = [...new Set(variants.flatMap(({ components }) =>
      components.map(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId)))].sort(
        (left, right) => left.localeCompare(right),
      );
    const availability = await this.inventory.findBySkuIds({
      organizationId,
      sellpiaInventorySkuIds,
    });
    return new Map(availability.items.map((item) => [
      item.sellpiaInventorySkuId,
      item,
    ]));
  }

  private async applyDisplayImages<
    T extends { id: string; imageUrls: string[]; displayImageUrls: string[] },
  >(organizationId: string, products: T[]): Promise<T[]> {
    const fallbackIds = products
      .filter((product) => product.imageUrls.length === 0)
      .map((product) => product.id);
    if (fallbackIds.length === 0) return products;

    try {
      const targets = await this.repository.listDisplayMediaTargets(
        organizationId,
        fallbackIds,
      );
      const byProductId = new Map<string, typeof targets>();
      for (const target of targets) {
        const existing = byProductId.get(target.masterProductId) ?? [];
        existing.push(target);
        byProductId.set(target.masterProductId, existing);
      }

      const media = await this.catalogDisplayMedia.findDisplayMedia({
        organizationId,
        requests: fallbackIds.flatMap((key) => {
          const candidates = byProductId.get(key) ?? [];
          return candidates.length === 0 ? [] : [{
            key,
            candidates: candidates.map(({ channelListingId }) => ({
              channelListingId,
              externalOptionId: null,
            })),
          }];
        }),
      });
      return products.map((product) => {
        if (product.imageUrls.length > 0) return product;
        const url = media.get(product.id)?.url;
        return { ...product, displayImageUrls: url ? [url] : [] };
      });
    } catch (error) {
      this.logger.warn(
        `Product display media enrichment failed for organization ${organizationId}.`,
        error instanceof Error ? error.stack : undefined,
      );
      return products;
    }
  }
}

function omitLegacyAbcGrade(rawInput: unknown): unknown {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return rawInput;
  const { abcGrade: _legacyAbcGrade, ...input } = rawInput as Record<string, unknown>;
  return input;
}

function noDirectSales(): ProductDepletionProjection {
  return {
    coverage: 'no_direct_sales',
    needsReorder: false,
    reorderSkuCount: 0,
    minMonthsOfAvailableStockLeft: null,
  };
}

function summarizeProducts(
  products: Array<ReturnType<typeof mapProductOperationsListItem>>,
): ProductOperationsListSummary {
  return products.reduce<ProductOperationsListSummary>((counts, product) => {
    const abcGrade = product.abcGrade;
    if (abcGrade === 'A' || abcGrade === 'B' || abcGrade === 'C') {
      counts.abcGradeCounts[abcGrade] += 1;
    } else if (product.abcEvaluation === null) {
      counts.abcGradeCounts.unclassified += 1;
    }
    const evaluation = product.abcEvaluation;
    if (evaluation) {
      counts.abcLifecycleCounts[evaluation.lifecycleStage] += 1;
      if (evaluation.riskFlags.includes('LOSS')) counts.abcRiskCounts.loss += 1;
      if (evaluation.riskFlags.includes('ZERO_VALUE')) counts.abcRiskCounts.zeroValue += 1;
      if (evaluation.eligibilityReason !== 'ELIGIBLE') {
        counts.abcRiskCounts.dataQuality += 1;
      }
    }
    counts.channelConnectionCounts[
      product.channelCount > 0 ? 'connected' : 'unconnected'
    ] += 1;
    counts.inventoryStatusCounts[product.inventoryStatus] += 1;
    if (product.profit !== null && product.profit < 0) {
      counts.negativeProfitCount += 1;
    }
    if (product.depletion.needsReorder) counts.reorderProductCount += 1;
    if (product.depletion.coverage !== 'no_direct_sales') {
      counts.depletionCoveredProductCount += 1;
    }
    if (product.depletion.coverage === 'shared') {
      counts.sharedDepletionProductCount += 1;
    }
    return counts;
  }, {
    abcGradeCounts: { A: 0, B: 0, C: 0, unclassified: 0 },
    abcLifecycleCounts: { NEW: 0, PROVISIONAL: 0, ESTABLISHED: 0 },
    abcRiskCounts: { loss: 0, zeroValue: 0, dataQuality: 0 },
    channelConnectionCounts: { connected: 0, unconnected: 0 },
    inventoryStatusCounts: {
      sellable: 0,
      partial_out_of_stock: 0,
      out_of_stock: 0,
      configuration_required: 0,
      review_required: 0,
    },
    negativeProfitCount: 0,
    reorderProductCount: 0,
    depletionCoveredProductCount: 0,
    sharedDepletionProductCount: 0,
  });
}

function normalizeVariant(
  input: CreateProductVariantInput,
): NormalizedCreateProductVariant {
  return {
    ...input,
    optionLabel: input.optionLabel ?? null,
    isDefault: input.isDefault ?? false,
    isActive: input.isActive ?? true,
    components: input.components ?? [],
  };
}

function parseOrBadRequest<T>(
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false; error: { flatten(): unknown } } },
  input: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({ message, errors: parsed.error.flatten() });
  }
  return parsed.data;
}
