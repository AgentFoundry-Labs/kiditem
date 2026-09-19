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
  SabangnetImportProductWrite,
  SalesProductBasicsRecord,
  SalesProductChannelOverrideRecord,
  SalesProductCreateRecord,
  SalesProductImportResult,
  SalesProductOptionState,
  SalesProductRepositoryPort,
} from '../../../application/port/out/repository/sales-product.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;
const IMPORT_CHUNK = 20;

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
    data: SalesProductChannelOverrideRecord;
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

  async readImportFingerprints(organizationId: string, codes: readonly string[]): Promise<Map<string, string>> {
    const fingerprints = new Map<string, string>();
    for (let start = 0; start < codes.length; start += 500) {
      const rows = await this.prisma.salesProduct.findMany({
        where: { organizationId, code: { in: codes.slice(start, start + 500) } },
        include: { options: { include: { components: true } } },
      });
      for (const row of rows) {
        fingerprints.set(row.code, salesProductImportFingerprint({
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
        }));
      }
    }
    return fingerprints;
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
  data: SalesProductChannelOverrideRecord,
): Promise<void> {
  const values = {
    salePrice: data.salePrice,
    priceRateBp: data.priceRateBp,
    costPrice: data.costPrice,
    name: data.name,
    detailHtml: data.detailHtml,
    promoText: data.promoText,
    noticeCategory: data.noticeCategory,
    stockPercent: data.stockPercent,
    adapterValues: data.adapterValues ?? Prisma.JsonNull,
    sourceRaw: data.sourceRaw ?? Prisma.JsonNull,
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
    })),
  } satisfies SalesProduct;
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
