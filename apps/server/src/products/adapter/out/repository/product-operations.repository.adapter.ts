import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  MasterProductOperationsDetail,
  MasterProductOperationsListItem,
  MasterProductOperationsListQuery,
  ProductVariantDetail,
} from '@kiditem/shared/product-operations';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  projectProductInventory,
  projectVariantCapacity,
  type VariantCapacityComponent,
} from '../../../domain/product-variant-capacity';
import type {
  NormalizedCreateMasterProduct,
  NormalizedCreateProductVariant,
  ProductOperationsRepositoryPort,
} from '../../../application/port/out/repository/product-operations.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

function productInclude(organizationId: string, periodStart?: Date) {
  return {
    variants: {
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }],
      include: {
        components: {
          where: { organizationId },
          orderBy: { createdAt: 'asc' as const },
          include: {
            sellpiaInventorySku: {
              select: {
                id: true,
                code: true,
                name: true,
                optionName: true,
                barcode: true,
                currentStock: true,
                isActive: true,
              },
            },
          },
        },
      },
    },
    channelListings: {
      where: { organizationId },
      orderBy: { createdAt: 'asc' as const },
      include: {
        channelAccount: {
          select: { id: true, channel: true, name: true },
        },
        channelListingDailySnapshots: {
          where: {
            organizationId,
            ...(periodStart ? { businessDate: { gte: periodStart } } : {}),
          },
          select: {
            trafficViews: true,
            trafficOrders: true,
            trafficRevenue: true,
            adSpend: true,
          },
        },
        profitLoss: {
          where: { organizationId },
          select: { year: true, month: true, netProfit: true },
        },
      },
    },
  };
}

type ProductRow = Prisma.MasterProductGetPayload<{
  include: ReturnType<typeof productInclude>;
}>;

@Injectable()
export class ProductOperationsRepositoryAdapter
implements ProductOperationsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(
    organizationId: string,
    query: MasterProductOperationsListQuery,
  ) {
    const periodStart = startOfUtcDay(
      new Date(Date.now() - (query.periodDays - 1) * 86_400_000),
    );
    const rows = await this.prisma.masterProduct.findMany({
      where: productListWhere(organizationId, query),
      include: productInclude(organizationId, periodStart),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    const projected = rows.map((row) =>
      toListItem(row, periodStart),
    );
    const filtered = query.inventoryStatus
      ? projected.filter((row) => row.inventoryStatus === query.inventoryStatus)
      : projected;
    const offset = (query.page - 1) * query.limit;
    return {
      items: filtered.slice(offset, offset + query.limit),
      total: filtered.length,
      page: query.page,
      limit: query.limit,
    };
  }

  async getProduct(
    organizationId: string,
    masterProductId: string,
  ): Promise<MasterProductOperationsDetail> {
    const row = await this.prisma.masterProduct.findFirst({
      where: { id: masterProductId, organizationId },
      include: productInclude(organizationId),
    });
    if (!row) throw new NotFoundException('MasterProduct was not found');
    return toDetail(row);
  }

  async createProduct(input: {
    organizationId: string;
    userId: string;
    product: NormalizedCreateMasterProduct;
  }): Promise<MasterProductOperationsDetail> {
    try {
      const masterProductId = await this.prisma.$transaction(async (tx) => {
        for (const variant of input.product.variants) {
          await validateRecipeSkus(tx, input.organizationId, variant.components);
        }
        const { variants, ...metadata } = input.product;
        const product = await tx.masterProduct.create({
          data: {
            organizationId: input.organizationId,
            ...metadata,
          },
          select: { id: true },
        });
        const confirmedAt = new Date();
        for (const variant of variants) {
          await createVariantRow(tx, {
            organizationId: input.organizationId,
            userId: input.userId,
            masterProductId: product.id,
            variant,
            confirmedAt,
          });
        }
        return product.id;
      }, TRANSACTION_OPTIONS);
      return this.getProduct(input.organizationId, masterProductId);
    } catch (error) {
      throw translateMutationError(error);
    }
  }

  async updateProduct(
    organizationId: string,
    masterProductId: string,
    input: Parameters<ProductOperationsRepositoryPort['updateProduct']>[2],
  ): Promise<MasterProductOperationsDetail> {
    try {
      const result = await this.prisma.masterProduct.updateMany({
        where: { id: masterProductId, organizationId },
        data: {
          ...input,
          ...('healthScore' in input ? { healthUpdatedAt: new Date() } : {}),
        },
      });
      if (result.count === 0) throw new NotFoundException('MasterProduct was not found');
      return this.getProduct(organizationId, masterProductId);
    } catch (error) {
      throw translateMutationError(error);
    }
  }

  async createVariant(input: {
    organizationId: string;
    userId: string;
    masterProductId: string;
    variant: NormalizedCreateProductVariant;
  }): Promise<ProductVariantDetail> {
    try {
      const variantId = await this.prisma.$transaction(async (tx) => {
        const product = await tx.masterProduct.findFirst({
          where: { id: input.masterProductId, organizationId: input.organizationId },
          select: { id: true },
        });
        if (!product) throw new NotFoundException('MasterProduct was not found');
        await validateRecipeSkus(tx, input.organizationId, input.variant.components);
        return createVariantRow(tx, {
          ...input,
          confirmedAt: new Date(),
        });
      }, TRANSACTION_OPTIONS);
      return this.getVariant(input.organizationId, variantId);
    } catch (error) {
      throw translateMutationError(error);
    }
  }

  async updateVariant(
    organizationId: string,
    productVariantId: string,
    input: Parameters<ProductOperationsRepositoryPort['updateVariant']>[2],
  ): Promise<ProductVariantDetail> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findFirst({
          where: { id: productVariantId, organizationId },
          select: { id: true, masterProductId: true },
        });
        if (!variant) throw new NotFoundException('ProductVariant was not found');
        if (input.isDefault === true) {
          await tx.productVariant.updateMany({
            where: {
              organizationId,
              masterProductId: variant.masterProductId,
              id: { not: productVariantId },
            },
            data: { isDefault: false },
          });
        }
        await tx.productVariant.updateMany({
          where: { id: productVariantId, organizationId },
          data: input,
        });
      }, TRANSACTION_OPTIONS);
      return this.getVariant(organizationId, productVariantId);
    } catch (error) {
      throw translateMutationError(error);
    }
  }

  async replaceRecipe(input: {
    organizationId: string;
    userId: string;
    productVariantId: string;
    components: Array<{ sellpiaInventorySkuId: string; quantity: number }>;
  }): Promise<ProductVariantDetail> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const variant = await lockProductVariant(
          tx,
          input.organizationId,
          input.productVariantId,
        );
        if (!variant) throw new NotFoundException('ProductVariant was not found');
        await validateRecipeSkus(tx, input.organizationId, input.components);
        await tx.productVariantComponent.deleteMany({
          where: {
            organizationId: input.organizationId,
            productVariantId: input.productVariantId,
          },
        });
        if (input.components.length > 0) {
          const confirmedAt = new Date();
          await tx.productVariantComponent.createMany({
            data: input.components.map((component) => ({
              organizationId: input.organizationId,
              productVariantId: input.productVariantId,
              sellpiaInventorySkuId: component.sellpiaInventorySkuId,
              quantity: component.quantity,
              source: 'manual',
              confirmedBy: input.userId,
              confirmedAt,
            })),
          });
        }
      }, TRANSACTION_OPTIONS);
      return this.getVariant(input.organizationId, input.productVariantId);
    } catch (error) {
      throw translateMutationError(error);
    }
  }

  private async getVariant(
    organizationId: string,
    productVariantId: string,
  ): Promise<ProductVariantDetail> {
    const row = await this.prisma.productVariant.findFirst({
      where: { id: productVariantId, organizationId },
      include: productInclude(organizationId).variants.include,
    });
    if (!row) throw new NotFoundException('ProductVariant was not found');
    return toVariantDetail(row);
  }
}

function productListWhere(
  organizationId: string,
  query: MasterProductOperationsListQuery,
): Prisma.MasterProductWhereInput {
  const search = query.query?.trim();
  return {
    organizationId,
    ...(search ? {
      OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.activeStatus === 'active' ? { isActive: true } : {}),
    ...(query.activeStatus === 'inactive' ? { isActive: false } : {}),
    ...(query.abcGrade ? { abcGrade: query.abcGrade } : {}),
    ...(query.adStatus === 'active' ? { adTier: { not: null } } : {}),
    ...(query.adStatus === 'inactive' ? { adTier: 'inactive' } : {}),
    ...(query.adStatus === 'unconfigured' ? { adTier: null } : {}),
  };
}

async function validateRecipeSkus(
  tx: Prisma.TransactionClient,
  organizationId: string,
  components: readonly { sellpiaInventorySkuId: string; quantity: number }[],
): Promise<void> {
  if (components.some((component) => component.quantity <= 0)) {
    throw new BadRequestException('ProductVariant component quantities must be positive');
  }
  const ids = [...new Set(components.map((component) => component.sellpiaInventorySkuId))];
  if (ids.length !== components.length) {
    throw new BadRequestException('ProductVariant component SKUs must be unique');
  }
  if (ids.length === 0) return;
  const rows = await tx.sellpiaInventorySku.findMany({
    where: { organizationId, id: { in: ids } },
    select: { id: true, isActive: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (ids.some((id) => !byId.has(id))) {
    throw new BadRequestException(
      'One or more SellpiaInventorySku components do not belong to this organization',
    );
  }
  if (ids.some((id) => byId.get(id)?.isActive !== true)) {
    throw new BadRequestException('Inactive SellpiaInventorySku components require review');
  }
}

async function lockProductVariant(
  tx: Prisma.TransactionClient,
  organizationId: string,
  productVariantId: string,
): Promise<{ id: string } | null> {
  const [variant] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM product_variants
    WHERE id = ${productVariantId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
  return variant ?? null;
}

async function createVariantRow(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    userId: string;
    masterProductId: string;
    variant: NormalizedCreateProductVariant;
    confirmedAt: Date;
  },
): Promise<string> {
  const { components, ...variantData } = input.variant;
  const variant = await tx.productVariant.create({
    data: {
      organizationId: input.organizationId,
      masterProductId: input.masterProductId,
      ...variantData,
    },
    select: { id: true },
  });
  if (components.length > 0) {
    await tx.productVariantComponent.createMany({
      data: components.map((component) => ({
        organizationId: input.organizationId,
        productVariantId: variant.id,
        sellpiaInventorySkuId: component.sellpiaInventorySkuId,
        quantity: component.quantity,
        source: 'manual',
        confirmedBy: input.userId,
        confirmedAt: input.confirmedAt,
      })),
    });
  }
  return variant.id;
}

function toDetail(row: ProductRow): MasterProductOperationsDetail {
  const inventory = projectProductInventory(row.variants.map(toInventoryVariant));
  return {
    ...metadata(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    inventoryStatus: inventory.inventoryStatus,
    inventoryUnits: inventory.inventoryUnits,
    channelListings: row.channelListings.map((listing) => ({
      id: listing.id,
      channelAccountId: listing.channelAccountId,
      channel: listing.channelAccount.channel,
      channelAccountName: listing.channelAccount.name,
      externalId: listing.externalId,
      displayName: listing.displayName,
      status: listing.status,
      isActive: listing.isActive,
    })),
    variants: row.variants.map(toVariantDetail),
  };
}

function toListItem(row: ProductRow, periodStart: Date): MasterProductOperationsListItem {
  const inventory = projectProductInventory(row.variants.map(toInventoryVariant));
  const variants = row.variants.map(toVariantDetail);
  const activeVariants = variants.filter((variant) => variant.isActive);
  const activeListings = row.channelListings.filter((listing) => listing.isActive);
  const dailyFacts = row.channelListings.flatMap(
    (listing) => listing.channelListingDailySnapshots,
  );
  const profits = row.channelListings.flatMap((listing) =>
    listing.profitLoss.filter((fact) => monthEndUtc(fact.year, fact.month) >= periodStart),
  );
  return {
    ...metadata(row),
    updatedAt: row.updatedAt,
    variantSummary: {
      total: variants.length,
      active: activeVariants.length,
      configured: activeVariants.filter((variant) => variant.warningState === 'none').length,
      warning: activeVariants.filter((variant) => variant.warningState !== 'none').length,
    },
    inventoryUnits: inventory.inventoryUnits,
    inventoryStatus: inventory.inventoryStatus,
    channelCount: activeListings.length,
    channelStatus: activeListings.length === 0
      ? 'unlisted'
      : activeListings.length < row.channelListings.length
        ? 'partial'
        : 'listed',
    traffic: nullableSum(dailyFacts, (fact) => fact.trafficViews),
    orderCount: nullableSum(dailyFacts, (fact) => fact.trafficOrders),
    salesAmount: nullableSum(dailyFacts, (fact) => fact.trafficRevenue),
    adSpend: nullableSum(dailyFacts, (fact) => fact.adSpend),
    profit: nullableSum(profits, (fact) => fact.netProfit),
  };
}

function metadata(row: ProductRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    brand: row.brand,
    tags: row.tags,
    imageUrls: row.imageUrls,
    abcGrade: row.abcGrade,
    profitTag: row.profitTag,
    adTier: row.adTier,
    adBudgetLimit: row.adBudgetLimit,
    healthScore: row.healthScore,
    healthUpdatedAt: row.healthUpdatedAt,
    isActive: row.isActive,
  };
}

function toInventoryVariant(variant: ProductRow['variants'][number]) {
  return {
    isActive: variant.isActive,
    components: variant.components.map(toCapacityComponent),
  };
}

function toCapacityComponent(
  component: ProductRow['variants'][number]['components'][number],
): VariantCapacityComponent {
  return {
    sellpiaInventorySkuId: component.sellpiaInventorySkuId,
    currentStock: component.sellpiaInventorySku.currentStock,
    quantity: component.quantity,
    isActive: component.sellpiaInventorySku.isActive,
  };
}

function toVariantDetail(
  variant: ProductRow['variants'][number],
): ProductVariantDetail {
  const projection = projectVariantCapacity(variant.components.map(toCapacityComponent));
  return {
    id: variant.id,
    code: variant.code,
    name: variant.name,
    optionLabel: variant.optionLabel,
    isDefault: variant.isDefault,
    isActive: variant.isActive,
    components: variant.components.map((component) => ({
      id: component.id,
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      code: component.sellpiaInventorySku.code,
      name: component.sellpiaInventorySku.name,
      optionName: component.sellpiaInventorySku.optionName,
      barcode: component.sellpiaInventorySku.barcode,
      currentStock: component.sellpiaInventorySku.currentStock,
      isActive: component.sellpiaInventorySku.isActive,
      quantity: component.quantity,
      source: component.source as 'manual' | 'deterministic',
      confirmedBy: component.confirmedBy,
      confirmedAt: component.confirmedAt,
    })),
    capacity: projection.capacity,
    warningState: projection.warningState,
  };
}

function nullableSum<T>(rows: readonly T[], value: (row: T) => number): number | null {
  return rows.length === 0 ? null : rows.reduce((sum, row) => sum + value(row), 0);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function monthEndUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function translateMutationError(error: unknown): unknown {
  if (
    error instanceof BadRequestException
    || error instanceof NotFoundException
    || error instanceof ConflictException
  ) {
    return error;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException('Product or variant code already exists in this organization');
  }
  return error;
}
