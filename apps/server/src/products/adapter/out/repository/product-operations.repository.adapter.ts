import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  MasterProductOperationsListQuery,
  ReplaceProductVariantRecipeInput,
} from '@kiditem/shared/product-operations';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  NormalizedCreateMasterProduct,
  NormalizedCreateProductVariant,
  ProductOperationsRepositoryDetail,
  ProductOperationsRepositoryListItem,
  ProductOperationsRepositoryPort,
  ProductOperationsRepositoryVariant,
} from '../../../application/port/out/repository/product-operations.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

function productInclude(organizationId: string, periodStart?: Date) {
  return {
    originChannelListing: {
      select: {
        externalId: true,
        channelAccount: {
          select: { name: true },
        },
      },
    },
    variants: {
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }],
      include: {
        channelListingOptions: {
          where: { organizationId },
          select: {
            listingId: true,
            externalOptionId: true,
            listing: {
              select: {
                channelAccount: {
                  select: { name: true },
                },
              },
            },
          },
        },
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
    return {
      items: rows.map((row) => toListItem(row, periodStart)),
      page: query.page,
      limit: query.limit,
    };
  }

  async getProduct(
    organizationId: string,
    masterProductId: string,
  ): Promise<ProductOperationsRepositoryDetail> {
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
  }): Promise<ProductOperationsRepositoryDetail> {
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
  ): Promise<ProductOperationsRepositoryDetail> {
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
  }): Promise<ProductOperationsRepositoryVariant> {
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
  ): Promise<ProductOperationsRepositoryVariant> {
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

  async applyDeterministicRecipesIfEmpty(
    input: Parameters<ProductOperationsRepositoryPort['applyDeterministicRecipesIfEmpty']>[0],
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const recipes = [...input.recipes]
          .sort((left, right) => left.productVariantId.localeCompare(right.productVariantId));
        const variantIds = recipes.map((recipe) => recipe.productVariantId);
        const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id
          FROM product_variants
          WHERE organization_id = ${input.organizationId}::uuid
            AND id IN (${Prisma.join(variantIds)})
          ORDER BY id ASC
          FOR UPDATE
        `);
        if (locked.length !== variantIds.length) {
          throw new NotFoundException('One or more ProductVariants were not found');
        }

        const existing = await tx.productVariantComponent.findMany({
          where: {
            organizationId: input.organizationId,
            productVariantId: { in: variantIds },
          },
          select: { productVariantId: true },
        });
        const existingVariantIds = new Set(existing.map((row) => row.productVariantId));
        const pending = recipes.filter((recipe) =>
          !existingVariantIds.has(recipe.productVariantId));
        await validateActiveRecipeSkuIds(
          tx,
          input.organizationId,
          [...new Set(pending.map((recipe) => recipe.sellpiaInventorySkuId))],
        );

        if (pending.length > 0) {
          const confirmedAt = new Date();
          await tx.productVariantComponent.createMany({
            data: pending.map((recipe) => ({
              organizationId: input.organizationId,
              productVariantId: recipe.productVariantId,
              sellpiaInventorySkuId: recipe.sellpiaInventorySkuId,
              quantity: recipe.quantity,
              source: 'deterministic',
              confirmedBy: null,
              confirmedAt,
            })),
          });
        }
        return {
          appliedProductVariantIds: pending.map((recipe) => recipe.productVariantId),
          skippedExistingProductVariantIds: variantIds.filter((id) =>
            existingVariantIds.has(id)),
        };
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      throw translateMutationError(error);
    }
  }

  async replaceRecipe(input: {
    organizationId: string;
    userId: string;
    productVariantId: string;
    components: Array<{ sellpiaInventorySkuId: string; quantity: number }>;
    expectedRecipe: ReplaceProductVariantRecipeInput['expectedRecipe'];
  }): Promise<ProductOperationsRepositoryVariant> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const variant = await lockProductVariant(
          tx,
          input.organizationId,
          input.productVariantId,
        );
        if (!variant) throw new NotFoundException('ProductVariant was not found');
        const currentRecipe = await tx.productVariantComponent.findMany({
          where: {
            organizationId: input.organizationId,
            productVariantId: input.productVariantId,
          },
          select: {
            id: true,
            sellpiaInventorySkuId: true,
            quantity: true,
            source: true,
            confirmedBy: true,
            confirmedAt: true,
          },
        });
        if (!sameRecipeExpectation(currentRecipe, input.expectedRecipe)) {
          throw new ConflictException({
            message: 'ProductVariant recipe was changed by another operator',
            currentRecipe: canonicalRecipe(currentRecipe),
          });
        }
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
  ): Promise<ProductOperationsRepositoryVariant> {
    const row = await this.prisma.productVariant.findFirst({
      where: { id: productVariantId, organizationId },
      include: {
        ...productInclude(organizationId).variants.include,
        masterProduct: {
          select: { originChannelListingId: true },
        },
      },
    });
    if (!row) throw new NotFoundException('ProductVariant was not found');
    return toVariantDetail(row, row.masterProduct.originChannelListingId);
  }
}

type RecipeSnapshot = {
  id: string;
  sellpiaInventorySkuId: string;
  quantity: number;
  source: string;
  confirmedBy: string | null;
  confirmedAt: Date | string;
};

function canonicalRecipe(recipe: readonly RecipeSnapshot[]) {
  return [...recipe]
    .map((component) => ({
      id: component.id,
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      quantity: component.quantity,
      source: component.source,
      confirmedBy: component.confirmedBy,
      confirmedAt: new Date(component.confirmedAt).toISOString(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function sameRecipeExpectation(
  current: readonly RecipeSnapshot[],
  expected: readonly RecipeSnapshot[],
) {
  return JSON.stringify(canonicalRecipe(current)) === JSON.stringify(canonicalRecipe(expected));
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
  await validateActiveRecipeSkuIds(tx, organizationId, ids);
}

async function validateActiveRecipeSkuIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  ids: string[],
): Promise<void> {
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

function toDetail(row: ProductRow): ProductOperationsRepositoryDetail {
  return {
    ...metadata(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
    variants: row.variants.map((variant) =>
      toVariantDetail(variant, row.originChannelListingId)),
  };
}

function toListItem(
  row: ProductRow,
  periodStart: Date,
): ProductOperationsRepositoryListItem {
  const variants = row.variants.map((variant) =>
    toVariantDetail(variant, row.originChannelListingId));
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
    variants,
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
    displayReference: row.originChannelListing
      ? {
          type: 'channel_product' as const,
          label: `${row.originChannelListing.channelAccount.name} 상품번호`,
          value: row.originChannelListing.externalId,
        }
      : {
          type: 'product_code' as const,
          label: '상품 코드',
          value: row.code,
        },
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

function toVariantDetail(
  variant: ProductRow['variants'][number],
  originChannelListingId: string | null,
): ProductOperationsRepositoryVariant {
  const originOption = originChannelListingId
    ? variant.channelListingOptions.find((option) => option.listingId === originChannelListingId)
    : undefined;
  return {
    id: variant.id,
    code: variant.code,
    displayReference: originOption
      ? {
          type: 'channel_option',
          label: `${originOption.listing.channelAccount.name} 옵션번호`,
          value: originOption.externalOptionId,
        }
      : {
          type: 'product_variant_code',
          label: '옵션 코드',
          value: variant.code,
        },
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
      quantity: component.quantity,
      source: component.source as 'manual' | 'deterministic',
      confirmedBy: component.confirmedBy,
      confirmedAt: component.confirmedAt,
    })),
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
