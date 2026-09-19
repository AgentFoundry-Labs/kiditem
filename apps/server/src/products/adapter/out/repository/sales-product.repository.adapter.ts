import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SalesProductCertificationSchema,
  type SalesProduct,
  type SalesProductCertification,
  type SalesProductDeliveryFeeType,
  type SalesProductListQuery,
  type SalesProductListResponse,
  type SalesProductOptionSupplyStatus,
  type SalesProductStatus,
  type SalesProductTaxType,
} from '@kiditem/shared/sales-product';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  readInventoryAvailability,
  readInventorySkuIdentities,
} from '../../../../inventory/read/inventory-availability';
import {
  pickFingerprintBasics,
  salesProductImportFingerprint,
  type PlannedOptionWrite,
  type SalesProductOptionReplacementPlan,
} from '../../../domain/sales-product';
import type {
  LinkCandidateListing,
  LinkCandidateProduct,
  SalesProductLinkPlan,
} from '../../../domain/sales-product-links';
import type {
  MallPriceCandidateListingOption,
  MallPriceCandidateProduct,
} from '../../../domain/sales-product-mall-prices';
import type { MallSheetSourceProduct } from '../../../domain/mall-bulk-sheet/mall-sheet-product';
import type {
  SabangnetImportProductWrite,
  SalesProductBasicsRecord,
  SalesProductChannelOverrideRecord,
  SalesProductCreateRecord,
  SalesProductFromCandidateRecord,
  SalesProductImportResult,
  SalesProductOptionState,
  SalesProductRepositoryPort,
} from '../../../application/port/out/repository/sales-product.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;
const IMPORT_CHUNK = 20;
const MALL_VALUES_CHUNK = 200;
/** 사방넷에서 옮긴 상품 × 몰 값 키의 머리(`SALES_PRODUCT_SABANGNET_VALUE_KEYS`). */
const SABANGNET_VALUE_PREFIX = 'sabangnet';

type Tx = Prisma.TransactionClient;

const DETAIL_INCLUDE = {
  options: {
    orderBy: [{ sortOrder: 'asc' as const }, { optionCode: 'asc' as const }],
    include: {
      components: { orderBy: { createdAt: 'asc' as const } },
      _count: { select: { channelListingOptions: { where: { isActive: true } } } },
    },
  },
  channelOverrides: {
    orderBy: { createdAt: 'asc' as const },
    include: { channelAccount: { select: { channel: true, name: true } } },
  },
  channelListings: {
    orderBy: { updatedAt: 'desc' as const },
    select: {
      id: true,
      channelAccountId: true,
      externalId: true,
      displayName: true,
      status: true,
      isActive: true,
      channelAccount: { select: { channel: true, name: true } },
      options: {
        where: { isActive: true },
        orderBy: { externalOptionId: 'asc' as const },
        select: { id: true, externalOptionId: true, itemName: true, salePrice: true, salesProductOptionId: true },
      },
    },
  },
} satisfies Prisma.SalesProductInclude;

type SalesProductDetailRow = Prisma.SalesProductGetPayload<{ include: typeof DETAIL_INCLUDE }>;

@Injectable()
export class SalesProductRepositoryAdapter implements SalesProductRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: SalesProductListQuery): Promise<SalesProductListResponse> {
    const base: Prisma.SalesProductWhereInput = {
      organizationId,
      status: query.status ?? { not: 'archived' },
    };
    const search = query.query?.trim();
    const searchWhere: Prisma.SalesProductWhereInput = search
      ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search } },
          { ownCode: { contains: search } },
          { modelName: { contains: search } },
          { options: { some: { optionCode: { contains: search } } } },
        ],
      }
      : {};
    const withOptions: Prisma.SalesProductWhereInput = { optionAxes: { isEmpty: false } };
    const withUnlinked: Prisma.SalesProductWhereInput = {
      options: { some: { supplyStatus: { not: 'unused' }, components: { none: {} } } },
    };
    const focusWhere = query.focus === 'with_options'
      ? withOptions
      : query.focus === 'unlinked' ? withUnlinked : {};
    const where: Prisma.SalesProductWhereInput = { AND: [base, searchWhere, focusWhere] };
    const [total, summaryTotal, summaryWithOptions, summaryUnlinked, rows] = await Promise.all([
      this.prisma.salesProduct.count({ where }),
      this.prisma.salesProduct.count({ where: base }),
      this.prisma.salesProduct.count({ where: { AND: [base, withOptions] } }),
      this.prisma.salesProduct.count({ where: { AND: [base, withUnlinked] } }),
      this.prisma.salesProduct.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          code: true,
          ownCode: true,
          name: true,
          status: true,
          salePrice: true,
          imageUrls: true,
          optionAxes: true,
          updatedAt: true,
          options: {
            select: { supplyStatus: true, _count: { select: { components: true } } },
          },
          _count: {
            select: {
              channelListings: { where: { isActive: true } },
              channelOverrides: true,
            },
          },
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        ownCode: row.ownCode,
        name: row.name,
        status: row.status as SalesProductStatus,
        salePrice: row.salePrice,
        imageUrl: row.imageUrls[0] ?? null,
        optionAxes: row.optionAxes,
        optionCount: row.options.length,
        sellingOptionCount: row.options.filter((option) => option.supplyStatus === 'selling').length,
        unlinkedOptionCount: row.options.filter((option) =>
          option.supplyStatus !== 'unused' && option._count.components === 0).length,
        channelListingCount: row._count.channelListings,
        channelOverrideCount: row._count.channelOverrides,
        updatedAt: row.updatedAt,
      })),
      total,
      page: query.page,
      limit: query.limit,
      summary: {
        total: summaryTotal,
        withOptions: summaryWithOptions,
        withUnlinkedOptions: summaryUnlinked,
      },
    };
  }

  async get(organizationId: string, salesProductId: string): Promise<SalesProduct | null> {
    const row = await this.prisma.salesProduct.findFirst({
      where: { id: salesProductId, organizationId },
      include: DETAIL_INCLUDE,
    });
    if (!row) return null;
    const skuIds = [...new Set(row.options.flatMap((option) =>
      option.components.map((component) => component.sellpiaInventorySkuId)))];
    const [identities, availability] = skuIds.length === 0
      ? [[], null]
      : await Promise.all([
        readInventorySkuIdentities(this.prisma, {
          organizationId,
          selector: { kind: 'ids', values: skuIds },
        }),
        this.prisma.$transaction((tx) => readInventoryAvailability(tx, {
          organizationId,
          sellpiaInventorySkuIds: skuIds,
        }), TRANSACTION_OPTIONS),
      ]);
    const identityById = new Map(identities.map((identity) => [identity.sellpiaInventorySkuId, identity]));
    const stockById = new Map((availability?.items ?? []).map((item) =>
      [item.sellpiaInventorySkuId, item.currentStock]));
    return toSalesProduct(row, identityById, stockById);
  }

  async listCodesWithPrefix(organizationId: string, prefix: string): Promise<string[]> {
    const rows = await this.prisma.salesProduct.findMany({
      where: { organizationId, code: { startsWith: prefix } },
      select: { code: true },
    });
    return rows.map((row) => row.code);
  }

  async create(
    organizationId: string,
    record: SalesProductCreateRecord,
    plan: SalesProductOptionReplacementPlan,
  ): Promise<string> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.salesProduct.create({
          data: { organizationId, ...createData(record) },
          select: { id: true },
        });
        await writeOptions(tx, organizationId, product.id, plan.writes);
        return product.id;
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }

  async updateBasics(
    organizationId: string,
    salesProductId: string,
    expectedVersion: number,
    patch: Partial<SalesProductBasicsRecord>,
  ): Promise<boolean> {
    try {
      const updated = await this.prisma.salesProduct.updateMany({
        where: { id: salesProductId, organizationId, version: expectedVersion },
        data: { ...basicsData(patch), version: { increment: 1 } },
      });
      if (updated.count === 1) return true;
    } catch (error) {
      throw translateUniqueViolation(error);
    }
    const exists = await this.prisma.salesProduct.count({ where: { id: salesProductId, organizationId } });
    if (!exists) throw new NotFoundException('판매상품을 찾지 못했습니다.');
    return false;
  }

  async readOptionState(organizationId: string, salesProductId: string): Promise<SalesProductOptionState | null> {
    const row = await this.prisma.salesProduct.findFirst({
      where: { id: salesProductId, organizationId },
      select: {
        code: true,
        version: true,
        options: {
          select: {
            id: true,
            optionCode: true,
            optionKey: true,
            _count: { select: { channelListingOptions: { where: { isActive: true } } } },
          },
        },
      },
    });
    if (!row) return null;
    return {
      productCode: row.code,
      version: row.version,
      options: row.options.map((option) => ({
        id: option.id,
        optionCode: option.optionCode,
        optionKey: option.optionKey,
        linkedChannelOptionCount: option._count.channelListingOptions,
      })),
    };
  }

  async readOptionStatesByCodes(
    organizationId: string,
    codes: readonly string[],
  ): Promise<Map<string, SalesProductOptionState>> {
    const states = new Map<string, SalesProductOptionState>();
    for (let start = 0; start < codes.length; start += 500) {
      const rows = await this.prisma.salesProduct.findMany({
        where: { organizationId, code: { in: codes.slice(start, start + 500) } },
        select: {
          code: true,
          version: true,
          options: {
            select: {
              id: true,
              optionCode: true,
              optionKey: true,
              _count: { select: { channelListingOptions: { where: { isActive: true } } } },
            },
          },
        },
      });
      for (const row of rows) {
        states.set(row.code, {
          productCode: row.code,
          version: row.version,
          options: row.options.map((option) => ({
            id: option.id,
            optionCode: option.optionCode,
            optionKey: option.optionKey,
            linkedChannelOptionCount: option._count.channelListingOptions,
          })),
        });
      }
    }
    return states;
  }

  async applyOptionPlan(input: {
    organizationId: string;
    salesProductId: string;
    expectedVersion: number;
    optionAxes: string[];
    plan: SalesProductOptionReplacementPlan;
  }): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const bumped = await tx.salesProduct.updateMany({
          where: { id: input.salesProductId, organizationId: input.organizationId, version: input.expectedVersion },
          data: { optionAxes: input.optionAxes, version: { increment: 1 } },
        });
        if (bumped.count !== 1) return false;
        await applyPlan(tx, input.organizationId, input.salesProductId, input.plan);
        return true;
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }

  async upsertChannelOverride(input: {
    organizationId: string;
    salesProductId: string;
    channelAccountId: string;
    data: Partial<SalesProductChannelOverrideRecord>;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await assertProductAndAccount(tx, input.organizationId, input.salesProductId, input.channelAccountId);
      await upsertOverride(tx, input.organizationId, input.salesProductId, input.channelAccountId, input.data);
    }, TRANSACTION_OPTIONS);
  }

  async deleteChannelOverride(input: {
    organizationId: string;
    salesProductId: string;
    channelAccountId: string;
  }): Promise<void> {
    await this.prisma.salesProductChannelOverride.deleteMany({
      where: {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
        channelAccountId: input.channelAccountId,
      },
    });
  }

  async findInvalidSellpiaSkuIds(organizationId: string, skuIds: readonly string[]): Promise<string[]> {
    const unique = [...new Set(skuIds)];
    if (unique.length === 0) return [];
    const identities = await readInventorySkuIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'ids', values: unique },
    });
    const active = new Set(identities
      .filter((identity) => identity.isActive)
      .map((identity) => identity.sellpiaInventorySkuId));
    return unique.filter((id) => !active.has(id));
  }

  async listChannelAccounts(organizationId: string): Promise<{ id: string; channel: string; name: string }[]> {
    return this.prisma.channelAccount.findMany({
      where: { organizationId },
      select: { id: true, channel: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async readLinkCandidates(organizationId: string): Promise<{
    listings: LinkCandidateListing[];
    products: LinkCandidateProduct[];
  }> {
    const [listingRows, optionRows, products] = await Promise.all([
      this.prisma.$queryRaw<{
        id: string;
        channel: string;
        external_id: string;
        source: string | null;
        sabangnet_product_no: string | null;
        seller_code: string | null;
        sales_product_id: string | null;
      }[]>(Prisma.sql`
        SELECT l.id, a.channel, l.external_id,
          l.raw_json->>'source' AS source,
          l.raw_json->>'sabangnetProductNo' AS sabangnet_product_no,
          l.raw_json->>'sellerCode' AS seller_code,
          l.sales_product_id
        FROM channel_listings l
        JOIN channel_accounts a ON a.id = l.channel_account_id AND a.organization_id = l.organization_id
        WHERE l.organization_id = ${organizationId}::uuid AND l.is_active = true
      `),
      this.prisma.$queryRaw<{
        id: string;
        listing_id: string;
        sales_product_option_id: string | null;
        has_recipe: boolean;
      }[]>(Prisma.sql`
        SELECT o.id, o.listing_id, o.sales_product_option_id,
          EXISTS (
            SELECT 1 FROM channel_listing_option_inventory_components c
            WHERE c.channel_listing_option_id = o.id AND c.organization_id = o.organization_id
          ) AS has_recipe
        FROM channel_listing_options o
        WHERE o.organization_id = ${organizationId}::uuid AND o.is_active = true
      `),
      this.prisma.salesProduct.findMany({
        where: { organizationId, status: { not: 'archived' } },
        select: {
          id: true,
          code: true,
          ownCode: true,
          options: {
            select: {
              id: true,
              supplyStatus: true,
              components: { select: { sellpiaInventorySkuId: true, quantity: true } },
            },
          },
        },
      }),
    ]);
    const optionsByListing = new Map<string, LinkCandidateListing['options']>();
    for (const option of optionRows) {
      optionsByListing.set(option.listing_id, [
        ...(optionsByListing.get(option.listing_id) ?? []),
        { id: option.id, salesProductOptionId: option.sales_product_option_id, hasRecipe: option.has_recipe },
      ]);
    }
    return {
      listings: listingRows.map((row) => ({
        id: row.id,
        channel: row.channel,
        externalId: row.external_id,
        source: row.source,
        sabangnetProductNo: row.sabangnet_product_no,
        sellerCode: row.seller_code,
        salesProductId: row.sales_product_id,
        options: optionsByListing.get(row.id) ?? [],
      })),
      products,
    };
  }

  async applyLinks(
    organizationId: string,
    plan: Pick<SalesProductLinkPlan, 'listingLinks' | 'optionLinks'>,
  ): Promise<{ listings: number; options: number }> {
    const listingsByProduct = groupIds(plan.listingLinks, (link) => link.salesProductId, (link) => link.channelListingId);
    const optionsBySalesOption = groupIds(
      plan.optionLinks,
      (link) => link.salesProductOptionId,
      (link) => link.channelListingOptionId,
    );
    let listings = 0;
    let options = 0;
    const productEntries = [...listingsByProduct.entries()];
    for (let start = 0; start < productEntries.length; start += 100) {
      await this.prisma.$transaction(async (tx) => {
        for (const [salesProductId, ids] of productEntries.slice(start, start + 100)) {
          const updated = await tx.channelListing.updateMany({
            where: { id: { in: ids }, organizationId, salesProductId: null },
            data: { salesProductId },
          });
          listings += updated.count;
        }
      }, TRANSACTION_OPTIONS);
    }
    const optionEntries = [...optionsBySalesOption.entries()];
    for (let start = 0; start < optionEntries.length; start += 200) {
      await this.prisma.$transaction(async (tx) => {
        for (const [salesProductOptionId, ids] of optionEntries.slice(start, start + 200)) {
          const updated = await tx.channelListingOption.updateMany({
            where: { id: { in: ids }, organizationId, salesProductOptionId: null },
            data: { salesProductOptionId },
          });
          options += updated.count;
        }
      }, TRANSACTION_OPTIONS);
    }
    return { listings, options };
  }

  async readImportFingerprints(
    organizationId: string,
    codes: readonly string[],
  ): Promise<Map<string, { fingerprint: string; imageUrls: string[] }>> {
    const fingerprints = new Map<string, { fingerprint: string; imageUrls: string[] }>();
    for (let start = 0; start < codes.length; start += 500) {
      const rows = await this.prisma.salesProduct.findMany({
        where: { organizationId, code: { in: codes.slice(start, start + 500) } },
        include: { options: { include: { components: true } } },
      });
      for (const row of rows) {
        const fingerprint = salesProductImportFingerprint({
          basics: pickFingerprintBasics({
            ...row,
            certifications: parseCertifications(row.certifications),
          }),
          optionAxes: row.optionAxes,
          options: row.options.map((option) => ({
            optionCode: option.optionCode,
            optionKey: option.optionKey,
            extraPrice: option.extraPrice,
            supplyStatus: option.supplyStatus,
            components: option.components.map((component) => ({
              sellpiaInventorySkuId: component.sellpiaInventorySkuId,
              quantity: component.quantity,
            })),
          })),
        });
        fingerprints.set(row.code, { fingerprint, imageUrls: row.imageUrls });
      }
    }
    return fingerprints;
  }

  async readMallPriceCandidates(organizationId: string): Promise<{
    products: (MallPriceCandidateProduct & { code: string; name: string })[];
    listingOptions: MallPriceCandidateListingOption[];
  }> {
    const [products, listingOptions] = await Promise.all([
      this.prisma.salesProduct.findMany({
        where: { organizationId },
        select: {
          id: true,
          code: true,
          name: true,
          salePrice: true,
          options: { select: { id: true, extraPrice: true } },
          channelOverrides: { select: { channelAccountId: true, salePrice: true, priceRateBp: true } },
        },
      }),
      this.prisma.$queryRaw<{ channel_account_id: string; sales_product_option_id: string; sale_price: number | null }[]>(Prisma.sql`
        SELECT l.channel_account_id, o.sales_product_option_id, o.sale_price
        FROM channel_listing_options o
        JOIN channel_listings l ON l.id = o.listing_id AND l.organization_id = o.organization_id
        WHERE o.organization_id = ${organizationId}::uuid
          AND o.is_active = true AND l.is_active = true
          AND o.sales_product_option_id IS NOT NULL
      `),
    ]);
    return {
      products: products.map(({ channelOverrides, ...product }) => ({ ...product, overrides: channelOverrides })),
      listingOptions: listingOptions.map((row) => ({
        channelAccountId: row.channel_account_id,
        salesProductOptionId: row.sales_product_option_id,
        salePrice: row.sale_price,
      })),
    };
  }

  async setChannelOverrideSalePrices(
    organizationId: string,
    writes: readonly { salesProductId: string; channelAccountId: string; salePrice: number }[],
  ): Promise<number> {
    for (let start = 0; start < writes.length; start += MALL_VALUES_CHUNK) {
      const chunk = writes.slice(start, start + MALL_VALUES_CHUNK);
      await this.prisma.$transaction(async (tx) => {
        for (const write of chunk) {
          await upsertOverride(tx, organizationId, write.salesProductId, write.channelAccountId, { salePrice: write.salePrice });
        }
      }, TRANSACTION_OPTIONS);
    }
    return writes.length;
  }

  async readProductIdsByCodes(organizationId: string, codes: readonly string[]): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (let start = 0; start < codes.length; start += 500) {
      const rows = await this.prisma.salesProduct.findMany({
        where: { organizationId, code: { in: codes.slice(start, start + 500) } },
        select: { id: true, code: true },
      });
      for (const row of rows) ids.set(row.code, row.id);
    }
    return ids;
  }

  async mergeSabangnetMallValues(
    organizationId: string,
    writes: readonly { salesProductId: string; channelAccountId: string; values: Record<string, string> }[],
  ): Promise<number> {
    let written = 0;
    for (let start = 0; start < writes.length; start += MALL_VALUES_CHUNK) {
      const chunk = writes.slice(start, start + MALL_VALUES_CHUNK);
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.salesProductChannelOverride.findMany({
          where: {
            organizationId,
            OR: chunk.map((write) => ({ salesProductId: write.salesProductId, channelAccountId: write.channelAccountId })),
          },
          select: { id: true, salesProductId: true, channelAccountId: true, adapterValues: true },
        });
        const byPair = new Map(existing.map((row) => [`${row.salesProductId}|${row.channelAccountId}`, row]));
        for (const write of chunk) {
          const row = byPair.get(`${write.salesProductId}|${write.channelAccountId}`);
          if (!row) {
            await tx.salesProductChannelOverride.create({
              data: {
                organizationId,
                salesProductId: write.salesProductId,
                channelAccountId: write.channelAccountId,
                adapterValues: write.values,
              },
            });
            written += 1;
            continue;
          }
          const kept = Object.fromEntries(Object.entries(isStringRecord(row.adapterValues) ? row.adapterValues : {})
            .filter(([key]) => !key.startsWith(SABANGNET_VALUE_PREFIX)));
          const merged = { ...kept, ...write.values };
          if (sameStringRecord(isStringRecord(row.adapterValues) ? row.adapterValues : {}, merged)) continue;
          await tx.salesProductChannelOverride.updateMany({
            where: { id: row.id, organizationId },
            data: { adapterValues: merged, version: { increment: 1 } },
          });
          written += 1;
        }
      });
    }
    return written;
  }

  async listMallCategories(
    organizationId: string,
    mallKey: string,
  ): Promise<{ path: string; title: string | null; count: number }[]> {
    const rows = await this.prisma.$queryRaw<{ path: string; title: string | null; count: number }[]>(Prisma.sql`
      SELECT o.adapter_values->>'sabangnetCategoryPath' AS path,
        max(o.adapter_values->>'sabangnetCategoryTitle') AS title,
        count(*)::int AS count
      FROM sales_product_channel_overrides o
      JOIN channel_accounts a ON a.id = o.channel_account_id AND a.organization_id = o.organization_id
      WHERE o.organization_id = ${organizationId}::uuid
        AND a.channel = ${mallKey}
        AND coalesce(o.adapter_values->>'sabangnetCategoryPath', '') <> ''
      GROUP BY 1
      ORDER BY 3 DESC, 1
      LIMIT 300
    `);
    return rows;
  }

  async findCodesByOwnCodes(organizationId: string, ownCodes: readonly string[]): Promise<Map<string, string>> {
    const codes = new Map<string, string>();
    for (let start = 0; start < ownCodes.length; start += 500) {
      const rows = await this.prisma.salesProduct.findMany({
        where: { organizationId, ownCode: { in: ownCodes.slice(start, start + 500) } },
        select: { code: true, ownCode: true },
      });
      for (const row of rows) if (row.ownCode) codes.set(row.ownCode, row.code);
    }
    return codes;
  }

  async listImageUrls(organizationId: string): Promise<{ id: string; code: string; version: number; imageUrls: string[] }[]> {
    return this.prisma.salesProduct.findMany({
      where: { organizationId },
      select: { id: true, code: true, version: true, imageUrls: true },
      orderBy: { code: 'asc' },
    });
  }

  async replaceImageUrls(input: {
    organizationId: string;
    salesProductId: string;
    expectedVersion: number;
    imageUrls: string[];
  }): Promise<boolean> {
    const result = await this.prisma.salesProduct.updateMany({
      where: { id: input.salesProductId, organizationId: input.organizationId, version: input.expectedVersion },
      data: { imageUrls: input.imageUrls, version: { increment: 1 } },
    });
    return result.count === 1;
  }

  async readMallSheetProducts(
    organizationId: string,
    salesProductIds: readonly string[],
  ): Promise<MallSheetSourceProduct[]> {
    if (salesProductIds.length === 0) return [];
    const rows = await this.prisma.salesProduct.findMany({
      where: { organizationId, id: { in: [...salesProductIds] } },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        ownCode: true,
        name: true,
        brand: true,
        manufacturer: true,
        modelName: true,
        modelNo: true,
        originCountry: true,
        keywords: true,
        taxType: true,
        salePrice: true,
        tagPrice: true,
        imageUrls: true,
        detailHtml: true,
        noticeCategory: true,
        certifications: true,
        optionAxes: true,
        sourceRaw: true,
        options: {
          orderBy: [{ sortOrder: 'asc' }, { optionCode: 'asc' }],
          select: { optionCode: true, values: true, extraPrice: true, barcode: true, supplyStatus: true },
        },
        channelOverrides: {
          orderBy: { createdAt: 'asc' },
          select: {
            salePrice: true,
            priceRateBp: true,
            name: true,
            detailHtml: true,
            promoText: true,
            adapterValues: true,
            channelAccount: { select: { channel: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      ownCode: row.ownCode,
      name: row.name,
      brand: row.brand,
      manufacturer: row.manufacturer,
      modelName: row.modelName,
      modelNo: row.modelNo,
      originCountry: row.originCountry,
      keywords: row.keywords,
      taxType: row.taxType as SalesProductTaxType,
      salePrice: row.salePrice,
      tagPrice: row.tagPrice,
      imageUrls: row.imageUrls,
      detailHtml: row.detailHtml,
      noticeCategory: row.noticeCategory,
      certificationNumbers: parseCertifications(row.certifications).map((item) => item.number),
      optionAxes: row.optionAxes,
      options: row.options.map((option) => ({
        code: option.optionCode,
        values: option.values,
        extraPrice: option.extraPrice,
        barcode: option.barcode,
        supplyStatus: option.supplyStatus,
      })),
      overrides: row.channelOverrides.map((override) => ({
        mallKey: override.channelAccount.channel,
        salePrice: override.salePrice,
        priceRateBp: override.priceRateBp,
        name: override.name,
        detailHtml: override.detailHtml,
        promoText: override.promoText,
        adapterValues: isStringRecord(override.adapterValues) ? override.adapterValues : {},
      })),
      sabangnetImageUrls: sabangnetImageUrls(row.sourceRaw),
    }));
  }

  async findMallSheetMissing(
    organizationId: string,
    mallKeys: readonly string[],
  ): Promise<{ salesProductIds: string[]; maybeListed: number }> {
    const accounts = await this.prisma.channelAccount.findMany({
      where: { organizationId, channel: { in: [...mallKeys] } },
      select: { id: true },
    });
    const accountIds = accounts.map((account) => account.id);
    const products = await this.prisma.salesProduct.findMany({
      where: { organizationId, status: 'active' },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        channelListings: {
          where: { isActive: true, channelAccountId: { in: accountIds } },
          select: { id: true },
          take: 1,
        },
        channelOverrides: {
          where: { channelAccountId: { in: accountIds }, sourceRaw: { not: Prisma.DbNull } },
          select: { id: true },
          take: 1,
        },
      },
    });
    const unlisted = products.filter((product) => product.channelListings.length === 0);
    return {
      salesProductIds: unlisted.filter((product) => product.channelOverrides.length === 0).map((product) => product.id),
      maybeListed: unlisted.filter((product) => product.channelOverrides.length > 0).length,
    };
  }

  async listMallCategoryPaths(
    organizationId: string,
  ): Promise<{ salesProductId: string; mallKey: string; path: string; name: string }[]> {
    return this.prisma.$queryRaw<{ salesProductId: string; mallKey: string; path: string; name: string }[]>(Prisma.sql`
      SELECT o.sales_product_id::text AS "salesProductId",
        a.channel AS "mallKey",
        coalesce(nullif(o.adapter_values->>'categoryPath', ''), o.adapter_values->>'sabangnetCategoryPath') AS path,
        p.name AS name
      FROM sales_product_channel_overrides o
      JOIN channel_accounts a ON a.id = o.channel_account_id AND a.organization_id = o.organization_id
      JOIN sales_products p ON p.id = o.sales_product_id AND p.organization_id = o.organization_id
      WHERE o.organization_id = ${organizationId}::uuid
        AND coalesce(nullif(o.adapter_values->>'categoryPath', ''), o.adapter_values->>'sabangnetCategoryPath', '') <> ''
    `);
  }

  async setMallCategoryPaths(
    organizationId: string,
    writes: readonly { salesProductId: string; channelAccountId: string; path: string }[],
  ): Promise<number> {
    let written = 0;
    for (let start = 0; start < writes.length; start += MALL_VALUES_CHUNK) {
      const chunk = writes.slice(start, start + MALL_VALUES_CHUNK);
      await this.prisma.$transaction(async (tx) => {
        const products = new Set((await tx.salesProduct.findMany({
          where: { organizationId, id: { in: chunk.map((write) => write.salesProductId) } },
          select: { id: true },
        })).map((row) => row.id));
        const existing = await tx.salesProductChannelOverride.findMany({
          where: {
            organizationId,
            OR: chunk.map((write) => ({ salesProductId: write.salesProductId, channelAccountId: write.channelAccountId })),
          },
          select: { id: true, salesProductId: true, channelAccountId: true, adapterValues: true },
        });
        const byPair = new Map(existing.map((row) => [`${row.salesProductId}|${row.channelAccountId}`, row]));
        for (const write of chunk) {
          if (!products.has(write.salesProductId)) continue;
          const row = byPair.get(`${write.salesProductId}|${write.channelAccountId}`);
          if (!row) {
            await tx.salesProductChannelOverride.create({
              data: {
                organizationId,
                salesProductId: write.salesProductId,
                channelAccountId: write.channelAccountId,
                adapterValues: { categoryPath: write.path },
              },
            });
            written += 1;
            continue;
          }
          const current = isStringRecord(row.adapterValues) ? row.adapterValues : {};
          if (current.categoryPath === write.path) continue;
          await tx.salesProductChannelOverride.updateMany({
            where: { id: row.id, organizationId },
            data: { adapterValues: { ...current, categoryPath: write.path }, version: { increment: 1 } },
          });
          written += 1;
        }
      });
    }
    return written;
  }

  async findBySourceCandidates(
    organizationId: string,
    candidateIds: readonly string[],
  ): Promise<Map<string, SalesProductFromCandidateRecord>> {
    if (candidateIds.length === 0) return new Map();
    const rows = await this.prisma.salesProduct.findMany({
      where: { organizationId, sourceCandidateId: { in: [...candidateIds] } },
      select: { id: true, code: true, version: true, status: true, imageUrls: true, detailHtml: true, sourceCandidateId: true },
    });
    return new Map(rows.map((row) => [row.sourceCandidateId!, {
      id: row.id,
      code: row.code,
      version: row.version,
      status: row.status as SalesProductStatus,
      imageUrls: row.imageUrls,
      detailHtml: row.detailHtml,
    }]));
  }

  async readPublicImages(organizationId: string, sourceUrls: readonly string[]): Promise<Map<string, string>> {
    const copies = new Map<string, string>();
    const unique = [...new Set(sourceUrls)];
    for (let start = 0; start < unique.length; start += 500) {
      const rows = await this.prisma.salesProductPublicImage.findMany({
        where: { organizationId, sourceUrl: { in: unique.slice(start, start + 500) } },
        select: { sourceUrl: true, publicUrl: true },
      });
      for (const row of rows) copies.set(row.sourceUrl, row.publicUrl);
    }
    return copies;
  }

  async savePublicImages(
    organizationId: string,
    images: readonly { sourceUrl: string; publicUrl: string; host: string }[],
  ): Promise<number> {
    let saved = 0;
    for (const image of images) {
      await this.prisma.salesProductPublicImage.upsert({
        where: { organizationId_sourceUrl: { organizationId, sourceUrl: image.sourceUrl } },
        create: { organizationId, sourceUrl: image.sourceUrl, publicUrl: image.publicUrl, host: image.host },
        update: { publicUrl: image.publicUrl, host: image.host },
      });
      saved += 1;
    }
    return saved;
  }

  async importSabangnet(
    organizationId: string,
    writes: readonly SabangnetImportProductWrite[],
  ): Promise<SalesProductImportResult> {
    const result: SalesProductImportResult = { created: 0, updated: 0, unchanged: 0, overridesSaved: 0 };
    for (let start = 0; start < writes.length; start += IMPORT_CHUNK) {
      const chunk = writes.slice(start, start + IMPORT_CHUNK);
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const write of chunk) {
            const existing = await tx.salesProduct.findFirst({
              where: { organizationId, code: write.create.code },
              select: { id: true },
            });
            let productId: string;
            if (existing && write.mode === 'overrides_only') {
              productId = existing.id;
              result.unchanged += 1;
            } else if (existing) {
              await tx.salesProduct.update({
                where: { id: existing.id },
                data: {
                  ...basicsData(write.create),
                  sabangnetGoodsNo: write.create.sabangnetGoodsNo,
                  optionAxes: write.create.optionAxes,
                  sourceRaw: write.create.sourceRaw ?? Prisma.JsonNull,
                  version: { increment: 1 },
                },
              });
              await applyPlan(tx, organizationId, existing.id, write.plan);
              productId = existing.id;
              result.updated += 1;
            } else {
              const product = await tx.salesProduct.create({
                data: { organizationId, ...createData(write.create) },
                select: { id: true },
              });
              await writeOptions(tx, organizationId, product.id, write.plan.writes);
              productId = product.id;
              result.created += 1;
            }
            for (const override of write.overrides) {
              await upsertOverride(tx, organizationId, productId, override.channelAccountId, override.data);
              result.overridesSaved += 1;
            }
          }
        }, TRANSACTION_OPTIONS);
      } catch (error) {
        throw translateUniqueViolation(error);
      }
    }
    return result;
  }
}

function basicsData(record: Partial<SalesProductBasicsRecord>): Prisma.SalesProductUpdateManyMutationInput {
  const data: Prisma.SalesProductUpdateManyMutationInput = {};
  const assign = <K extends keyof SalesProductBasicsRecord>(key: K) => {
    if (record[key] !== undefined) (data as Record<string, unknown>)[key] = record[key];
  };
  ([
    'name', 'ownCode', 'shortName', 'englishName', 'printName', 'modelName', 'modelNo', 'brand', 'manufacturer',
    'originCountry', 'originRegion', 'keywords', 'standardCategory', 'status', 'taxType', 'deliveryFeeType',
    'deliveryFee', 'costPrice', 'salePrice', 'tagPrice', 'stockManaged', 'imageUrls', 'detailHtml',
    'extraDetailHtml', 'noticeCategory', 'noticeValues', 'importDeclarationNo', 'adminMemo',
  ] as const).forEach(assign);
  if (record.certifications !== undefined) {
    data.certifications = record.certifications.length > 0
      ? (record.certifications as Prisma.InputJsonValue)
      : Prisma.JsonNull;
  }
  return data;
}

function createData(record: SalesProductCreateRecord): Omit<Prisma.SalesProductUncheckedCreateInput, 'organizationId'> {
  return {
    ...(basicsData(record) as Omit<Prisma.SalesProductUncheckedCreateInput, 'organizationId' | 'code' | 'name' | 'salePrice'>),
    code: record.code,
    name: record.name,
    salePrice: record.salePrice,
    sabangnetGoodsNo: record.sabangnetGoodsNo,
    optionAxes: record.optionAxes,
    sourceRaw: record.sourceRaw ?? Prisma.JsonNull,
    sourceCandidateId: record.sourceCandidateId ?? null,
  };
}

async function writeOptions(
  tx: Tx,
  organizationId: string,
  salesProductId: string,
  writes: readonly PlannedOptionWrite[],
): Promise<void> {
  for (const write of writes) {
    const option = await tx.salesProductOption.create({
      data: {
        organizationId,
        salesProductId,
        optionCode: write.optionCode,
        values: write.values,
        optionKey: write.optionKey,
        alias: write.alias,
        barcode: write.barcode,
        extraPrice: write.extraPrice,
        supplyStatus: write.supplyStatus,
        safetyStock: write.safetyStock,
        sortOrder: write.sortOrder,
      },
      select: { id: true },
    });
    if (write.components.length > 0) {
      await tx.salesProductOptionComponent.createMany({
        data: write.components.map((component) => ({
          organizationId,
          salesProductOptionId: option.id,
          sellpiaInventorySkuId: component.sellpiaInventorySkuId,
          quantity: component.quantity,
        })),
      });
    }
  }
}

/**
 * 계획대로 단품을 바꾼다. 옵션 값(optionKey)을 서로 맞바꾸는 경우에도 유일 키가 부딪히지 않게
 * 고칠 줄과 남길 줄의 키를 먼저 임시 값으로 비운다.
 */
async function applyPlan(
  tx: Tx,
  organizationId: string,
  salesProductId: string,
  plan: SalesProductOptionReplacementPlan,
): Promise<void> {
  const updateIds = plan.writes.flatMap((write) => (write.id ? [write.id] : []));
  const touchedIds = [...updateIds, ...plan.retireIds];
  for (const id of touchedIds) {
    await tx.salesProductOption.updateMany({
      where: { id, organizationId, salesProductId },
      data: { optionKey: `~${id}` },
    });
  }
  if (plan.deleteIds.length > 0) {
    await tx.salesProductOption.deleteMany({
      where: { id: { in: plan.deleteIds }, organizationId, salesProductId },
    });
  }
  const creates: PlannedOptionWrite[] = [];
  for (const write of plan.writes) {
    if (!write.id) {
      creates.push(write);
      continue;
    }
    await tx.salesProductOption.updateMany({
      where: { id: write.id, organizationId, salesProductId },
      data: {
        optionCode: write.optionCode,
        values: write.values,
        optionKey: write.optionKey,
        alias: write.alias,
        barcode: write.barcode,
        extraPrice: write.extraPrice,
        supplyStatus: write.supplyStatus,
        safetyStock: write.safetyStock,
        sortOrder: write.sortOrder,
      },
    });
    await tx.salesProductOptionComponent.deleteMany({
      where: { organizationId, salesProductOptionId: write.id },
    });
    if (write.components.length > 0) {
      await tx.salesProductOptionComponent.createMany({
        data: write.components.map((component) => ({
          organizationId,
          salesProductOptionId: write.id!,
          sellpiaInventorySkuId: component.sellpiaInventorySkuId,
          quantity: component.quantity,
        })),
      });
    }
  }
  await writeOptions(tx, organizationId, salesProductId, creates);
  if (plan.retireIds.length > 0) {
    const takenKeys = new Set(plan.writes.map((write) => write.optionKey));
    const retired = await tx.salesProductOption.findMany({
      where: { id: { in: plan.retireIds }, organizationId, salesProductId },
      select: { id: true, values: true },
    });
    for (const option of retired) {
      const key = option.values.join(':');
      await tx.salesProductOption.updateMany({
        where: { id: option.id, organizationId, salesProductId },
        data: {
          supplyStatus: 'unused',
          optionKey: takenKeys.has(key) ? `${key}~미사용~${option.id.slice(0, 8)}` : key,
          sortOrder: plan.writes.length + retired.indexOf(option),
        },
      });
    }
  }
}

async function assertProductAndAccount(
  tx: Tx,
  organizationId: string,
  salesProductId: string,
  channelAccountId: string,
): Promise<void> {
  const [product, account] = await Promise.all([
    tx.salesProduct.count({ where: { id: salesProductId, organizationId } }),
    tx.channelAccount.count({ where: { id: channelAccountId, organizationId } }),
  ]);
  if (!product) throw new NotFoundException('판매상품을 찾지 못했습니다.');
  if (!account) throw new NotFoundException('몰 계정을 찾지 못했습니다.');
}

async function upsertOverride(
  tx: Tx,
  organizationId: string,
  salesProductId: string,
  channelAccountId: string,
  data: Partial<SalesProductChannelOverrideRecord>,
): Promise<void> {
  // 보낸 칸만 쓴다 — 사람이 몰 판매가만 고쳐도 사방넷에서 옮긴 상세 · 원가 · 고시 · 분류가 지워지지 않게.
  const values = {
    ...(data.salePrice !== undefined ? { salePrice: data.salePrice } : {}),
    ...(data.priceRateBp !== undefined ? { priceRateBp: data.priceRateBp } : {}),
    ...(data.costPrice !== undefined ? { costPrice: data.costPrice } : {}),
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.detailHtml !== undefined ? { detailHtml: data.detailHtml } : {}),
    ...(data.promoText !== undefined ? { promoText: data.promoText } : {}),
    ...(data.noticeCategory !== undefined ? { noticeCategory: data.noticeCategory } : {}),
    ...(data.stockPercent !== undefined ? { stockPercent: data.stockPercent } : {}),
    ...(data.adapterValues !== undefined ? { adapterValues: data.adapterValues ?? Prisma.JsonNull } : {}),
    ...(data.sourceRaw !== undefined ? { sourceRaw: data.sourceRaw ?? Prisma.JsonNull } : {}),
  };
  await tx.salesProductChannelOverride.upsert({
    where: { salesProductId_channelAccountId: { salesProductId, channelAccountId } },
    create: { organizationId, salesProductId, channelAccountId, ...values },
    update: { ...values, version: { increment: 1 } },
  });
}

function translateUniqueViolation(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta?.target ?? '');
    if (target.includes('option_code')) return new ConflictException('단품코드가 다른 판매상품과 겹칩니다.');
    if (target.includes('own_code')) return new ConflictException('자체상품코드가 다른 판매상품과 겹칩니다.');
    if (target.includes('code')) return new ConflictException('판매상품코드가 이미 있습니다.');
    return new ConflictException('같은 값이 이미 있습니다.');
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
    return new ConflictException('몰 옵션에 연결된 단품은 지울 수 없습니다.');
  }
  return error;
}

function parseCertifications(value: Prisma.JsonValue | null): SalesProductCertification[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = SalesProductCertificationSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function toSalesProduct(
  row: SalesProductDetailRow,
  identityById: Map<string, { code: string; name: string; optionName: string | null }>,
  stockById: Map<string, number>,
): SalesProduct {
  return {
    id: row.id,
    code: row.code,
    ownCode: row.ownCode,
    sabangnetGoodsNo: row.sabangnetGoodsNo,
    sourceCandidateId: row.sourceCandidateId,
    name: row.name,
    shortName: row.shortName,
    englishName: row.englishName,
    printName: row.printName,
    modelName: row.modelName,
    modelNo: row.modelNo,
    brand: row.brand,
    manufacturer: row.manufacturer,
    originCountry: row.originCountry,
    originRegion: row.originRegion,
    keywords: row.keywords,
    standardCategory: row.standardCategory,
    status: row.status as SalesProductStatus,
    taxType: row.taxType as SalesProductTaxType,
    deliveryFeeType: (row.deliveryFeeType as SalesProductDeliveryFeeType | null) ?? null,
    deliveryFee: row.deliveryFee,
    costPrice: row.costPrice,
    salePrice: row.salePrice,
    tagPrice: row.tagPrice,
    optionAxes: row.optionAxes,
    stockManaged: row.stockManaged,
    optionsLocked: row.optionsLocked,
    imageUrls: row.imageUrls,
    detailHtml: row.detailHtml,
    extraDetailHtml: row.extraDetailHtml,
    noticeCategory: row.noticeCategory,
    noticeValues: row.noticeValues,
    certifications: parseCertifications(row.certifications),
    importDeclarationNo: row.importDeclarationNo,
    adminMemo: row.adminMemo,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    options: row.options.map((option) => ({
      id: option.id,
      optionCode: option.optionCode,
      values: option.values,
      optionKey: option.optionKey,
      alias: option.alias,
      barcode: option.barcode,
      extraPrice: option.extraPrice,
      supplyStatus: option.supplyStatus as SalesProductOptionSupplyStatus,
      safetyStock: option.safetyStock,
      sortOrder: option.sortOrder,
      components: option.components.map((component) => {
        const identity = identityById.get(component.sellpiaInventorySkuId);
        return {
          sellpiaInventorySkuId: component.sellpiaInventorySkuId,
          sellpiaCode: identity?.code ?? '',
          name: identity?.name ?? '',
          optionName: identity?.optionName ?? null,
          quantity: component.quantity,
          currentStock: stockById.get(component.sellpiaInventorySkuId) ?? null,
        };
      }),
      linkedChannelOptionCount: option._count.channelListingOptions,
    })),
    channelOverrides: row.channelOverrides.map((override) => ({
      id: override.id,
      channelAccountId: override.channelAccountId,
      mallKey: override.channelAccount.channel,
      mallName: override.channelAccount.name,
      salePrice: override.salePrice,
      priceRateBp: override.priceRateBp,
      costPrice: override.costPrice,
      name: override.name,
      detailHtml: override.detailHtml,
      promoText: override.promoText,
      noticeCategory: override.noticeCategory,
      stockPercent: override.stockPercent,
      adapterValues: isStringRecord(override.adapterValues) ? override.adapterValues : null,
      version: override.version,
      updatedAt: override.updatedAt,
    })),
    channelListings: row.channelListings.map((listing) => ({
      id: listing.id,
      channelAccountId: listing.channelAccountId,
      mallKey: listing.channelAccount.channel,
      mallName: listing.channelAccount.name,
      externalId: listing.externalId,
      displayName: listing.displayName,
      status: listing.status,
      isActive: listing.isActive,
      options: listing.options,
    })),
  } satisfies SalesProduct;
}

function sameStringRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left);
  return leftKeys.length === Object.keys(right).length && leftKeys.every((key) => left[key] === right[key]);
}

function isStringRecord(value: Prisma.JsonValue | null): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'string');
}

function groupIds<T>(items: readonly T[], key: (item: T) => string, value: (item: T) => string): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const item of items) grouped.set(key(item), [...(grouped.get(key(item)) ?? []), value(item)]);
  return grouped;
}

/** 사방넷에서 옮긴 원문 줄의 사진 주소 — `대표이미지`, 그다음 `부가이미지1` · `부가이미지2` … 순서. */
function sabangnetImageUrls(sourceRaw: Prisma.JsonValue | null): string[] {
  if (!sourceRaw || typeof sourceRaw !== 'object' || Array.isArray(sourceRaw)) return [];
  const raw = sourceRaw as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const extras = Object.entries(raw)
    .map(([key, value]) => ({ order: /^부가이미지(\d+)$/.exec(key)?.[1], url: text(value) }))
    .filter((entry): entry is { order: string; url: string } => Boolean(entry.order && entry.url))
    .sort((left, right) => Number(left.order) - Number(right.order))
    .map((entry) => entry.url);
  return [text(raw['대표이미지']), ...extras].filter((url, index, all) => url && all.indexOf(url) === index);
}
