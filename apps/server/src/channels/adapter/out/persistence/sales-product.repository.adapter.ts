import { readSalesProductOptionExecutionCounts } from '../../../read/registration-execution.reader';
import { allocateKidItemCode } from '../../../../common/kid-item-code';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';
import {
  pickFingerprintBasics,
  salesProductImportFingerprint,
  type PlannedOptionWrite,
  type SalesProductOptionReplacementPlan,
} from '../../../domain/sales-product/sales-product';
import type {
  LinkCandidateListing,
  LinkCandidateProduct,
  SalesProductLinkPlan,
} from '../../../domain/sales-product/sales-product-links';
import type {
  MallPriceAdoptionWrite,
  MallPriceCandidateListingOption,
  MallPriceCandidateProduct,
} from '../../../domain/sales-product/sales-product-mall-prices';
import type { CoupangCatalogFacts } from '../../../domain/registration/bulk-sheet/coupang-catalog-edit';
import type { MallSheetSourceProduct } from '../../../domain/registration/bulk-sheet/mall-sheet-product';
import {
  REGISTRATION_TARGET_REPOSITORY_PORT,
  type RegistrationTargetRepositoryPort,
} from '../../../application/port/out/persistence/registration-target.repository.port';
import type {
  SabangnetImportProductWrite,
  SalesProductBasicsRecord,
  SalesProductChannelOverrideRecord,
  SalesProductCreateRecord,
  SalesProductDraftRetireRow,
  SalesProductImportResult,
  SalesProductOptionState,
  SalesProductRepositoryPort,
} from '../../../application/port/out/persistence/sales-product.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;
const IMPORT_CHUNK = 20;
const MALL_VALUES_CHUNK = 200;
const MAX_MONEY = 1_000_000_000;
/** 사방넷에서 옮긴 상품 × 몰 값 키의 머리(`SALES_PRODUCT_SABANGNET_VALUE_KEYS`). */
const SABANGNET_VALUE_PREFIX = 'sabangnet';
/** 쿠팡 몰 계정(ADR-0012 의 몰 키). 윙 옵션 ID 는 이 계정의 옵션에서만 찾는다. */
const COUPANG_CHANNEL = 'coupang';

/** 쿠팡상품정보 수정요청이 읽는 판매상품 칸. */
const CATALOG_PRODUCT_SELECT = {
  code: true,
  brand: true,
  manufacturer: true,
  modelNo: true,
  keywords: true,
} as const;

function trimmedOrNull(value: string | null): string | null {
  const text = value?.trim() ?? '';
  return text ? text : null;
}

type Tx = Prisma.TransactionClient;

const DETAIL_INCLUDE = {
  options: {
    orderBy: [{ sortOrder: 'asc' as const }, { optionCode: 'asc' as const }],
    include: {
      components: { orderBy: { createdAt: 'asc' as const } },
      _count: { select: { channelListingOptions: { where: { isActive: true } } } },
    },
  },
  registrationTargets: {
    where: { archivedAt: null },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      channelAccountId: true,
      version: true,
      displayName: true,
      registrationInput: true,
      updatedAt: true,
      channelAccount: { select: { channel: true, name: true } },
      selectedOptions: {
        orderBy: { sortOrder: 'asc' as const },
        select: {
          salesProductOptionId: true,
          salePrice: true,
          normalPrice: true,
          supplyPrice: true,
        },
      },
    },
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly productTransactionalRead: ProductTransactionalReadPort,
    @Inject(REGISTRATION_TARGET_REPOSITORY_PORT)
    private readonly registrationTargets: RegistrationTargetRepositoryPort,
  ) {}

  async allocateCode(_organizationId: string): Promise<string> {
    return this.prisma.$transaction((tx) => allocateKidItemCode(tx));
  }

  async list(organizationId: string, query: SalesProductListQuery): Promise<SalesProductListResponse> {
    const base: Prisma.SalesProductWhereInput = {
      organizationId,
      status: query.status ?? { not: 'archived' },
      // 원천 탭(1688 · 쿠팡 · 사방넷)은 초안에 복사된 값으로 거른다 — Sourcing 조인이 없다.
      ...(query.sourcePlatform ? { sourcePlatform: query.sourcePlatform } : {}),
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
    /**
     * 미등록 = 어느 몰에도 올라간 적 없는 판매상품. 수집상품에서 만든 것과 직접 만든 것을 가리지 않는다.
     *
     * 몰에서 내린(비활성) 상품은 돌아오지 않는다 — 비활성화는 등록된 상태에서 내린 것이지 등록하지
     * 않은 것이 아니다(사장님 2026-09-23).
     */
    const unregistered: Prisma.SalesProductWhereInput = {
      channelListings: { none: {} },
    };
    /** 아직 판매가를 정하지 않은 초안. */
    const draftOnly: Prisma.SalesProductWhereInput = { status: 'draft' };
    const focusWhere = query.focus === 'with_options'
      ? withOptions
      : query.focus === 'unlinked'
        ? withUnlinked
        : query.focus === 'unregistered' ? unregistered : {};
    const where: Prisma.SalesProductWhereInput = { AND: [base, searchWhere, focusWhere] };
    const [total, summaryTotal, summaryWithOptions, summaryUnlinked, summaryUnregistered, summaryDraft, rows] = await Promise.all([
      this.prisma.salesProduct.count({ where }),
      this.prisma.salesProduct.count({ where: base }),
      this.prisma.salesProduct.count({ where: { AND: [base, withOptions] } }),
      this.prisma.salesProduct.count({ where: { AND: [base, withUnlinked] } }),
      this.prisma.salesProduct.count({ where: { AND: [base, unregistered] } }),
      this.prisma.salesProduct.count({ where: { AND: [base, draftOnly] } }),
      this.prisma.salesProduct.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          code: true,
          ownCode: true,
          sourceCandidateId: true,
          sourcePlatform: true,
          sourceUrl: true,
          name: true,
          status: true,
          imageUrls: true,
          optionAxes: true,
          updatedAt: true,
          options: {
            select: { salePrice: true, supplyStatus: true, _count: { select: { components: true } } },
          },
          _count: {
            select: {
              channelListings: { where: { isActive: true } },
              registrationTargets: { where: { archivedAt: null } },
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
        sourceCandidateId: row.sourceCandidateId,
        sourcePlatform: row.sourcePlatform,
        sourceUrl: row.sourceUrl,
        name: row.name,
        status: row.status as SalesProductStatus,
        salePrice: minimumOptionPrice(row.options),
        imageUrl: row.imageUrls[0] ?? null,
        optionAxes: row.optionAxes,
        optionCount: row.options.length,
        sellingOptionCount: row.options.filter((option) => option.supplyStatus === 'selling').length,
        unlinkedOptionCount: row.options.filter((option) =>
          option.supplyStatus !== 'unused' && option._count.components === 0).length,
        channelListingCount: row._count.channelListings,
        channelOverrideCount: row._count.registrationTargets,
        updatedAt: row.updatedAt,
      })),
      total,
      page: query.page,
      limit: query.limit,
      summary: {
        total: summaryTotal,
        withOptions: summaryWithOptions,
        withUnlinkedOptions: summaryUnlinked,
        unregistered: summaryUnregistered,
        draft: summaryDraft,
      },
    };
  }

  async get(organizationId: string, salesProductId: string): Promise<SalesProduct | null> {
    const result = await this.prisma.$transaction(async (tx) => {
      const context = { client: tx };
      const lock = await this.productTransactionalRead.lock(context, organizationId);
      const row = await tx.salesProduct.findFirst({
        where: { id: salesProductId, organizationId },
        include: DETAIL_INCLUDE,
      });
      if (!row) return null;

      const masterProductIds = [...new Set(row.options.flatMap((option) =>
        option.components.map((component) => component.masterProductId)))];
      if (masterProductIds.length === 0) {
        return { row, identities: [], availability: null };
      }

      const identities = await this.productTransactionalRead.readSourceIdentities(context, {
        organizationId,
        selector: { kind: 'ids', values: masterProductIds },
      });
      const availability = await this.productTransactionalRead.readAvailability(context, lock, {
        organizationId,
        masterProductIds,
      });
      return { row, identities, availability };
    }, TRANSACTION_OPTIONS);
    if (!result) return null;
    const identityById = new Map(result.identities.map((identity) => [identity.masterProductId, identity]));
    const stockById = new Map((result.availability?.items ?? []).map((item) =>
      [item.masterProductId, item.currentStock]));
    return toSalesProduct(result.row, identityById, stockById);
  }

  async listCodesWithPrefix(organizationId: string, prefix: string): Promise<string[]> {
    const rows = await this.prisma.salesProduct.findMany({
      where: { organizationId, code: { startsWith: prefix } },
      select: { code: true },
    });
    return rows.map((row) => row.code);
  }

  async readMasterProductCodes(
    organizationId: string,
    masterProductIds: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(masterProductIds)];
    if (unique.length === 0) return new Map();
    return this.prisma.$transaction(async (tx) => {
      const identities = await this.productTransactionalRead.readSourceIdentities(
        { client: tx },
        { organizationId, selector: { kind: 'ids', values: unique } },
      );
      return new Map(identities.map((identity) => [identity.masterProductId, identity.code]));
    }, TRANSACTION_OPTIONS);
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
        id: true,
        sabangnetGoodsNo: true,
        ownCode: true,
        code: true,
        name: true,
        status: true,
        version: true,
        options: {
          select: {
            id: true,
            optionCode: true,
            sabangnetOptionCode: true,
            optionKey: true,
            salePrice: true,
            supplyStatus: true,
            components: {
              orderBy: { createdAt: 'asc' },
              select: { masterProductId: true, quantity: true },
            },
            _count: { select: { channelListingOptions: true, registrationSelections: true } },
          },
        },
      },
    });
    if (!row) return null;
    const executions = await readSalesProductOptionExecutionCounts(this.prisma, { organizationId, salesProductId });
    return {
      productId: row.id,
      productCode: row.code,
      productName: row.name,
      status: row.status as SalesProductStatus,
      version: row.version,
      options: row.options.map((option) => ({
        id: option.id,
        optionCode: option.optionCode,
        sabangnetOptionCode: option.sabangnetOptionCode,
        optionKey: option.optionKey,
        salePrice: option.salePrice,
        supplyStatus: option.supplyStatus as SalesProductOptionSupplyStatus,
        components: option.components.map((component) => ({
          masterProductId: component.masterProductId,
          quantity: component.quantity,
        })),
        linkedChannelOptionCount: option._count.channelListingOptions,
        executionCount: executions.get(option.id) ?? 0,
        registrationSelectionCount: option._count.registrationSelections,
      })),
    };
  }

  async readImportOptionStates(
    organizationId: string,
    codes: readonly string[],
  ): Promise<Map<string, SalesProductOptionState>> {
    const states = new Map<string, SalesProductOptionState>();
    for (let start = 0; start < codes.length; start += 500) {
      const rows = await this.prisma.salesProduct.findMany({
        where: { organizationId, OR: [{ sabangnetGoodsNo: { in: codes.slice(start, start + 500) } }, { ownCode: { in: codes.slice(start, start + 500) } }] },
        select: {
          id: true,
        sabangnetGoodsNo: true,
        ownCode: true,
        code: true,
        name: true,
        status: true,
          version: true,
          options: {
            select: {
              id: true,
              optionCode: true,
              sabangnetOptionCode: true,
              optionKey: true,
              salePrice: true,
              supplyStatus: true,
              components: {
                orderBy: { createdAt: 'asc' },
                select: { masterProductId: true, quantity: true },
              },
              _count: { select: { channelListingOptions: true, registrationSelections: true } },
            },
          },
        },
      });
      for (const row of rows) {
        const executions = await readSalesProductOptionExecutionCounts(this.prisma, { organizationId, salesProductId: row.id });
        const state: SalesProductOptionState = {
          productId: row.id,
      productCode: row.code,
      productName: row.name,
      status: row.status as SalesProductStatus,
          version: row.version,
          options: row.options.map((option) => ({
            id: option.id,
            optionCode: option.optionCode,
            sabangnetOptionCode: option.sabangnetOptionCode,
            optionKey: option.optionKey,
            salePrice: option.salePrice,
            supplyStatus: option.supplyStatus as SalesProductOptionSupplyStatus,
            components: option.components.map((component) => ({
              masterProductId: component.masterProductId,
              quantity: component.quantity,
            })),
            linkedChannelOptionCount: option._count.channelListingOptions,
        executionCount: executions.get(option.id) ?? 0,
        registrationSelectionCount: option._count.registrationSelections,
          })),
        };
        for (const key of [row.sabangnetGoodsNo, row.ownCode].filter((key): key is string => !!key && codes.includes(key))) {
          if (states.has(key) && states.get(key)!.productId !== row.id) throw new ConflictException('Ambiguous source product identity.');
          states.set(key, state);
        }
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
    status: SalesProductStatus;
  }): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const bumped = await tx.salesProduct.updateMany({
          where: { id: input.salesProductId, organizationId: input.organizationId, version: input.expectedVersion },
          data: { optionAxes: input.optionAxes, status: input.status, version: { increment: 1 } },
        });
        if (bumped.count !== 1) return false;
        await applyPlan(tx, input.organizationId, input.salesProductId, input.plan);
        return true;
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }

  async findInvalidMasterProductIds(
    organizationId: string,
    masterProductIds: readonly string[],
  ): Promise<string[]> {
    const unique = [...new Set(masterProductIds)];
    if (unique.length === 0) return [];
    return this.prisma.$transaction(async (tx) => {
      const context = { client: tx };
      await this.productTransactionalRead.lock(context, organizationId);
      const identities = await this.productTransactionalRead.readSourceIdentities(context, {
        organizationId,
        selector: { kind: 'ids', values: unique },
      });
      const currentMasterProductIds = new Set(
        identities.map((identity) => identity.masterProductId),
      );
      return unique.filter((id) => !currentMasterProductIds.has(id));
    }, TRANSACTION_OPTIONS);
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
              components: { select: { masterProductId: true, quantity: true } },
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
    const owners = new Map<string, string>();
    for (let start = 0; start < codes.length; start += 500) {
      const rows = await this.prisma.salesProduct.findMany({
        where: { organizationId, OR: [{ sabangnetGoodsNo: { in: codes.slice(start, start + 500) } }, { ownCode: { in: codes.slice(start, start + 500) } }] },
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
            sabangnetOptionCode: option.sabangnetOptionCode,
            optionKey: option.optionKey,
            salePrice: option.salePrice,
      normalPrice: option.normalPrice,
            supplyStatus: option.supplyStatus,
            components: option.components.map((component) => ({
              masterProductId: component.masterProductId,
              quantity: component.quantity,
            })),
          })),
        });
        for (const key of [row.sabangnetGoodsNo, row.ownCode].filter((key): key is string => !!key && codes.includes(key))) {
          if (owners.has(key) && owners.get(key) !== row.id) throw new ConflictException('Ambiguous source product identity.');
          owners.set(key, row.id);
          fingerprints.set(key, { fingerprint, imageUrls: row.imageUrls });
        }
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
          options: { select: { id: true, salePrice: true, normalPrice: true } },
          registrationTargets: {
            where: { archivedAt: null },
            select: {
              id: true,
              channelAccountId: true,
              version: true,
              selectedOptions: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  salesProductOptionId: true,
                  salePrice: true,
                  normalPrice: true,
                  supplyPrice: true,
                },
              },
            },
          },
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
      products: products.map(({ registrationTargets, ...product }) => ({
        ...product,
        options: product.options,
        targets: registrationTargets,
      })),
      listingOptions: listingOptions.map((row) => ({
        channelAccountId: row.channel_account_id,
        salesProductOptionId: row.sales_product_option_id,
        salePrice: row.sale_price,
      })),
    };
  }

  async setChannelOverrideSalePrices(
    organizationId: string,
    writes: readonly MallPriceAdoptionWrite[],
  ): Promise<number> {
    if (!Array.isArray(writes)) throw new ConflictException('가격 반영 목록이 올바르지 않습니다.');
    const adoptionWrites = writes as readonly MallPriceAdoptionWrite[];
    const targetIds = new Set<string>();
    for (const write of adoptionWrites) {
      if (typeof write !== 'object' || write === null || Array.isArray(write)) {
        throw new ConflictException('가격 반영 줄이 올바르지 않습니다.');
      }
      if (typeof write.targetId !== 'string' || write.targetId.trim().length === 0) {
        throw new ConflictException('가격을 반영할 등록 대상이 없습니다.');
      }
      if (targetIds.has(write.targetId)) {
        throw new ConflictException('같은 등록 대상에 가격 반영 줄이 여러 개입니다.');
      }
      targetIds.add(write.targetId);
      if (!Number.isSafeInteger(write.expectedVersion) || write.expectedVersion < 0) {
        throw new ConflictException('등록 대상 버전이 올바르지 않습니다.');
      }
      if (!Number.isSafeInteger(write.salePrice) || write.salePrice < 0 || write.salePrice > MAX_MONEY) {
        throw new ConflictException('대표 판매가가 올바르지 않습니다.');
      }
      if (!Array.isArray(write.optionPrices) || write.optionPrices.length === 0) {
        throw new ConflictException('옵션별 최종 판매가가 없습니다.');
      }
      const optionIds = new Set<string>();
      for (const optionPrice of write.optionPrices) {
        if (typeof optionPrice !== 'object' || optionPrice === null || Array.isArray(optionPrice)) {
          throw new ConflictException('옵션별 최종 판매가가 올바르지 않습니다.');
        }
        if (typeof optionPrice.salesProductOptionId !== 'string' || optionPrice.salesProductOptionId.trim().length === 0) {
          throw new ConflictException('옵션별 최종 판매가의 단품이 올바르지 않습니다.');
        }
        if (optionIds.has(optionPrice.salesProductOptionId)) {
          throw new ConflictException('같은 단품의 최종 판매가가 여러 개입니다.');
        }
        optionIds.add(optionPrice.salesProductOptionId);
        if (!Number.isSafeInteger(optionPrice.salePrice) || optionPrice.salePrice < 0 || optionPrice.salePrice > MAX_MONEY) {
          throw new ConflictException('옵션별 최종 판매가가 올바르지 않습니다.');
        }
      }
    }

    for (let start = 0; start < adoptionWrites.length; start += MALL_VALUES_CHUNK) {
      const chunk = adoptionWrites.slice(start, start + MALL_VALUES_CHUNK);
      for (const write of chunk) {
        const target = await this.registrationTargets.get(organizationId, write.targetId);
        if (!target) throw new ConflictException('등록 대상이 다른 곳에서 삭제되었습니다.');
        if (target.salesProductId !== write.salesProductId || target.channelAccountId !== write.channelAccountId) {
          throw new ConflictException('등록 대상이 다른 상품 또는 몰 계정에 속합니다.');
        }
        if (target.version !== write.expectedVersion) {
          throw new ConflictException('등록 대상이 다른 곳에서 변경되었습니다.');
        }
        const selectedOptionIds = new Set(target.selectedOptions.map((option) => option.salesProductOptionId));
        const byOption = new Map(write.optionPrices.map((option) => [option.salesProductOptionId, option.salePrice]));
        for (const optionId of byOption.keys()) {
          if (!selectedOptionIds.has(optionId)) {
            throw new ConflictException('등록 대상에 선택되지 않은 단품의 가격은 반영할 수 없습니다.');
          }
        }
        await this.registrationTargets.update(organizationId, target.id, {
          expectedVersion: write.expectedVersion,
          displayName: target.displayName,
          registrationInput: target.registrationInput,
          selectedOptions: target.selectedOptions.map((option) => ({
            salesProductOptionId: option.salesProductOptionId,
            salePrice: byOption.has(option.salesProductOptionId)
              ? byOption.get(option.salesProductOptionId)!
              : option.salePrice,
            normalPrice: option.normalPrice,
            supplyPrice: option.supplyPrice,
          })),
        });
      }
    }
    return adoptionWrites.length;
  }

  async readProductIdsByCodes(organizationId: string, codes: readonly string[]): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (let start = 0; start < codes.length; start += 500) {
      const rows = await this.prisma.salesProduct.findMany({
        where: { organizationId, sabangnetGoodsNo: { in: codes.slice(start, start + 500) } },
        select: { id: true, sabangnetGoodsNo: true },
      });
      for (const row of rows) ids.set(row.sabangnetGoodsNo!, row.id);
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
      for (const write of chunk) {
        const targets = (await this.registrationTargets.list(organizationId, write.salesProductId))
          .filter((target) => target.channelAccountId === write.channelAccountId);
        if (targets.length > 1) {
          throw new ConflictException('같은 몰 계정에 등록 대상이 여러 개라 사방넷 몰 값을 정할 수 없습니다.');
        }
        if (targets.length === 0) continue;
        const target = targets[0]!;
        const current = targetMallValues(target.registrationInput);
        const kept = Object.fromEntries(Object.entries(current)
          .filter(([key]) => !key.startsWith(SABANGNET_VALUE_PREFIX)));
        const merged = { ...kept, ...write.values };
        if (sameStringRecord(current, merged)) continue;
        await this.registrationTargets.update(organizationId, target.id, {
          expectedVersion: target.version,
          displayName: target.displayName,
          registrationInput: mergeTargetMallValues(target.registrationInput, merged),
          selectedOptions: target.selectedOptions,
        });
        written += 1;
      }
    }
    return written;
  }

  async listMallCategories(
    organizationId: string,
    mallKey: string,
  ): Promise<{ path: string; title: string | null; count: number }[]> {
    const rows = await this.prisma.registrationTarget.findMany({
      where: { organizationId, archivedAt: null, channelAccount: { channel: mallKey } },
      select: { registrationInput: true },
    });
    const grouped = new Map<string, { title: string | null; count: number }>();
    for (const row of rows) {
      const values = targetMallValues(row.registrationInput);
      const path = values.sabangnetCategoryPath?.trim();
      if (!path) continue;
      const previous = grouped.get(path);
      grouped.set(path, {
        title: values.sabangnetCategoryTitle ?? previous?.title ?? null,
        count: (previous?.count ?? 0) + 1,
      });
    }
    return [...grouped.entries()]
      .map(([path, value]) => ({ path, ...value }))
      .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
      .slice(0, 300);
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

  async listImageUrls(
    organizationId: string,
  ): Promise<{
    id: string;
    code: string;
    version: number;
    imageUrls: string[];
    detailHtml: string | null;
    extraDetailHtml: string[];
  }[]> {
    return this.prisma.salesProduct.findMany({
      where: { organizationId },
      select: {
        id: true,
        code: true,
        version: true,
        imageUrls: true,
        detailHtml: true,
        extraDetailHtml: true,
      },
      orderBy: { code: 'asc' },
    });
  }

  async replaceImageUrls(input: {
    organizationId: string;
    salesProductId: string;
    expectedVersion: number;
    imageUrls: string[];
    detailHtml?: string | null;
    extraDetailHtml?: string[];
  }): Promise<boolean> {
    const result = await this.prisma.salesProduct.updateMany({
      where: { id: input.salesProductId, organizationId: input.organizationId, version: input.expectedVersion },
      data: {
        imageUrls: input.imageUrls,
        ...(input.detailHtml !== undefined ? { detailHtml: input.detailHtml } : {}),
        ...(input.extraDetailHtml !== undefined ? { extraDetailHtml: input.extraDetailHtml } : {}),
        version: { increment: 1 },
      },
    });
    return result.count === 1;
  }

  /**
   * 쿠팡상품정보 수정요청: 윙 옵션 ID(`externalOptionId`) → 우리가 아는 값.
   *
   * 쿠팡 계정의 몰 옵션만 본다. 다른 몰이 같은 숫자를 옵션 코드로 쓰면 엉뚱한 상품 값을 윙에
   * 제안하게 된다.
   *
   * 값은 두 곳에서 온다. 옵션이 단품과 이어져 있으면 그 단품이고, 아니면 몰 상품이 이어진
   * 판매상품이다(로컬 2026-09-22: 쿠팡 옵션 2,277 중 단품과 이어진 것 52 · 상품과 이어진 것 131).
   * **바코드만은 단품에서만** 온다 — 상품 하나에 옵션이 여럿이면 바코드가 옵션마다 다르고,
   * 상품 바코드를 모든 옵션에 붙이면 틀린 값을 몰에 제안하게 된다.
   */
  async readCoupangCatalogFacts(
    organizationId: string,
    optionIds: readonly string[],
  ): Promise<CoupangCatalogFacts[]> {
    if (optionIds.length === 0) return [];
    const rows = await this.prisma.channelListingOption.findMany({
      where: {
        organizationId,
        externalOptionId: { in: [...optionIds] },
        listing: { channelAccount: { channel: COUPANG_CHANNEL } },
        OR: [
          { salesProductOptionId: { not: null } },
          { listing: { salesProductId: { not: null } } },
        ],
      },
      select: {
        externalOptionId: true,
        listing: { select: { salesProduct: { select: CATALOG_PRODUCT_SELECT } } },
        salesProductOption: {
          select: {
            barcode: true,
            salesProduct: { select: CATALOG_PRODUCT_SELECT },
          },
        },
      },
    });
    return rows.flatMap((row) => {
      const option = row.salesProductOption;
      const product = option?.salesProduct ?? row.listing.salesProduct;
      if (!product) return [];
      return [{
        optionId: row.externalOptionId,
        brand: trimmedOrNull(product.brand),
        manufacturer: trimmedOrNull(product.manufacturer),
        modelNo: trimmedOrNull(product.modelNo),
        barcode: option ? trimmedOrNull(option.barcode) : null,
        keywords: product.keywords,
        salesProductCode: product.code,
      }];
    });
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
        status: true,
        brand: true,
        manufacturer: true,
        modelName: true,
        modelNo: true,
        originCountry: true,
        keywords: true,
        taxType: true,
        imageUrls: true,
        detailHtml: true,
        noticeCategory: true,
        certifications: true,
        optionAxes: true,
        sourceRaw: true,
        options: {
          orderBy: [{ sortOrder: 'asc' }, { optionCode: 'asc' }],
          select: { id: true, optionCode: true, values: true, salePrice: true, normalPrice: true, barcode: true, supplyStatus: true },
        },
        registrationTargets: {
          where: { archivedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            channelAccountId: true,
            displayName: true,
            registrationInput: true,
            selectedOptions: {
              orderBy: { sortOrder: 'asc' },
              select: { salesProductOptionId: true, salePrice: true, normalPrice: true, supplyPrice: true },
            },
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
      status: row.status as SalesProductStatus,
      brand: row.brand,
      manufacturer: row.manufacturer,
      modelName: row.modelName,
      modelNo: row.modelNo,
      originCountry: row.originCountry,
      keywords: row.keywords,
      taxType: row.taxType as SalesProductTaxType,
      salePrice: minimumOptionPrice(row.options),
      tagPrice: commonPrice(row.options.map((option) => option.normalPrice)),
      imageUrls: row.imageUrls,
      detailHtml: row.detailHtml,
      noticeCategory: row.noticeCategory,
      certificationNumbers: parseCertifications(row.certifications).map((item) => item.number),
      optionAxes: row.optionAxes,
      options: row.options.map((option) => ({
        id: option.id,
        code: option.optionCode,
        values: option.values,
        salePrice: option.salePrice,
        normalPrice: option.normalPrice,
        barcode: option.barcode,
        supplyStatus: option.supplyStatus,
      })),
      overrides: projectMallSheetOverrides(row.registrationTargets),
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
        registrationTargets: {
          where: { channelAccountId: { in: accountIds }, archivedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    const unlisted = products.filter((product) => product.channelListings.length === 0);
    return {
      salesProductIds: unlisted.filter((product) => product.registrationTargets.length === 0).map((product) => product.id),
      maybeListed: unlisted.filter((product) => product.registrationTargets.length > 0).length,
    };
  }

  async listMallCategoryPaths(
    organizationId: string,
  ): Promise<{ salesProductId: string; mallKey: string; path: string; name: string }[]> {
    const rows = await this.prisma.registrationTarget.findMany({
      where: { organizationId, archivedAt: null },
      select: {
        salesProductId: true,
        registrationInput: true,
        channelAccount: { select: { channel: true } },
        salesProduct: { select: { name: true } },
      },
    });
    return rows.flatMap((row) => {
      const values = targetMallValues(row.registrationInput);
      const path = values.categoryPath?.trim() || values.sabangnetCategoryPath?.trim() || '';
      return path
        ? [{ salesProductId: row.salesProductId, mallKey: row.channelAccount.channel, path, name: row.salesProduct.name }]
        : [];
    });
  }

  async setMallCategoryPaths(
    organizationId: string,
    writes: readonly { salesProductId: string; channelAccountId: string; targetId?: string; path: string }[],
  ): Promise<number> {
    let written = 0;
    for (let start = 0; start < writes.length; start += MALL_VALUES_CHUNK) {
      const chunk = writes.slice(start, start + MALL_VALUES_CHUNK);
      for (const write of chunk) {
        // 고른 설정이 있으면 그 설정만 — `resolve` 가 조직 · 상품 · 몰 계정 소속을 확인하고, 아니면 거절한다.
        const targetId = await this.registrationTargets.resolve(organizationId, {
          salesProductId: write.salesProductId,
          channelAccountId: write.channelAccountId,
          ...(write.targetId ? { targetId: write.targetId } : {}),
        });
        const target = await this.registrationTargets.get(organizationId, targetId);
        if (!target) throw new NotFoundException('등록 설정을 찾을 수 없습니다.');
        const values = { ...targetMallValues(target.registrationInput), categoryPath: write.path };
        await this.registrationTargets.update(organizationId, target.id, {
          expectedVersion: target.version,
          displayName: target.displayName,
          registrationInput: mergeTargetMallValues(target.registrationInput, values),
          selectedOptions: target.selectedOptions,
        });
        written += 1;
      }
    }
    return written;
  }

  async findIdBySourceCandidate(organizationId: string, candidateId: string): Promise<string | null> {
    const row = await this.prisma.salesProduct.findFirst({
      where: { organizationId, sourceCandidateId: candidateId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * 후보를 거절 · 삭제했을 때 그 초안을 `unused` 로 내린다.
   *
   * 몰에 올라가 있거나(활성 몰 상품) 살아 있는 등록 실행이 있으면 내리지 않는다 — 몰에 있는
   * 상품의 기준을 잃으면 수정 보내기 · 품절을 어디에 걸지 모른다. 그래도 후보 거절은 막지 않는다.
   */
  async retireDraftForSource(
    organizationId: string,
    candidateId: string,
  ): Promise<SalesProductDraftRetireRow> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.salesProduct.findFirst({
        where: { organizationId, sourceCandidateId: candidateId },
        select: { id: true, status: true },
      });
      if (!product) {
        return { salesProductId: null, retired: false, activeListingCount: 0, activeExecutionCount: 0 };
      }
      const [activeListingCount, activeExecutionCount] = await Promise.all([
        tx.channelListing.count({ where: { organizationId, salesProductId: product.id, isActive: true } }),
        tx.productRegistrationExecution.count({
          where: {
            organizationId,
            status: { in: ['prepared', 'executing', 'reconciling'] },
            preparation: { salesProductId: product.id },
          },
        }),
      ]);
      if (activeListingCount > 0 || activeExecutionCount > 0) {
        return { salesProductId: product.id, retired: false, activeListingCount, activeExecutionCount };
      }
      if (product.status !== 'unused') {
        await tx.salesProduct.updateMany({
          where: { id: product.id, organizationId },
          data: { status: 'unused', version: { increment: 1 } },
        });
      }
      return { salesProductId: product.id, retired: true, activeListingCount: 0, activeExecutionCount: 0 };
    }, TRANSACTION_OPTIONS);
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
              where: { organizationId, ...(write.create.sabangnetGoodsNo ? { sabangnetGoodsNo: write.create.sabangnetGoodsNo } : { ownCode: write.create.ownCode }) },
              select: { id: true, version: true },
            });
            let productId: string;
            if (existing && (write.mode === 'preserve' || !write.existingProductId)) {
              // Preserve the existing product/options, but still materialize a
              // source target when this account has no target yet. Existing
              // target rows are handled below without overwriting their edits.
              productId = existing.id;
              result.unchanged += 1;
            } else if (existing) {
              if (existing.id !== write.existingProductId || existing.version !== write.expectedVersion) {
                throw new ConflictException('Imported product was edited after the preview.');
              }
              await tx.salesProduct.update({
                where: { id: existing.id, organizationId, version: write.expectedVersion },
                data: {
                  ...basicsData(write.create),
                  sabangnetGoodsNo: write.create.sabangnetGoodsNo,
                  optionAxes: write.create.optionAxes,
                  sourceRaw: (write.create.sourceRaw as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
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
              const targetCount = await tx.registrationTarget.count({
                where: {
                  organizationId,
                  salesProductId: productId,
                  channelAccountId: override.channelAccountId,
                  archivedAt: null,
                },
              });
              // Reimport never replaces an operator-edited target. A target is
              // materialized only when this account has no existing target.
              // Multiple targets are valid. Recollection does not choose or
              // replace any of them, so no ambiguity needs resolving here.
              if (targetCount !== 0) continue;
              await materializeImportedTarget(
                tx,
                organizationId,
                productId,
                override.channelAccountId,
                override.data,
              );
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
    'deliveryFee', 'stockManaged', 'imageUrls', 'detailHtml',
    'extraDetailHtml', 'noticeCategory', 'noticeValues', 'importDeclarationNo', 'adminMemo',
    'description', 'targetAudience', 'ageGroup', 'productSize', 'colorVariantNames', 'boxSetQuantity',
  ] as const).forEach(assign);
  if (record.registrationDefaults !== undefined) {
    data.registrationDefaults = record.registrationDefaults === null
      ? Prisma.JsonNull
      : (record.registrationDefaults as Prisma.InputJsonValue);
  }
  if (record.certifications !== undefined) {
    data.certifications = record.certifications.length > 0
      ? (record.certifications as Prisma.InputJsonValue)
      : Prisma.JsonNull;
  }
  return data;
}

function createData(record: SalesProductCreateRecord): Omit<Prisma.SalesProductUncheckedCreateInput, 'organizationId'> {
  return {
    ...(basicsData(record) as Omit<Prisma.SalesProductUncheckedCreateInput, 'organizationId' | 'code' | 'name'>),
    code: record.code,
    name: record.name,
    sabangnetGoodsNo: record.sabangnetGoodsNo,
    optionAxes: record.optionAxes,
    sourceRaw: (record.sourceRaw as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
    sourceCandidateId: record.sourceCandidateId ?? null,
    sourcePlatform: record.sourcePlatform ?? null,
    sourceUrl: record.sourceUrl ?? null,
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
        sabangnetOptionCode: write.sabangnetOptionCode ?? null,
        values: write.values,
        optionKey: write.optionKey,
        alias: write.alias,
        barcode: write.barcode,
        salePrice: write.salePrice,
        normalPrice: write.normalPrice,
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
          masterProductId: component.masterProductId,
          quantity: component.quantity,
        })),
      });
    }
  }
}

/** 사방넷 override DTO를 새 등록 대상의 옵션별 최종가로 한 번만 물질화한다. */
async function materializeImportedTarget(
  tx: Tx,
  organizationId: string,
  salesProductId: string,
  channelAccountId: string,
  data: Partial<SalesProductChannelOverrideRecord>,
): Promise<void> {
  const account = await tx.channelAccount.count({ where: { id: channelAccountId, organizationId, status: 'active' } });
  if (account !== 1) throw new NotFoundException('몰 계정을 찾지 못했습니다.');
  const options = await tx.salesProductOption.findMany({
    where: { organizationId, salesProductId, supplyStatus: { not: 'unused' } },
    orderBy: [{ sortOrder: 'asc' }, { optionCode: 'asc' }],
    select: { id: true, sabangnetOptionCode: true },
  });
  const salePricesByOptionId = resolveImportedOptionPrices(options, data);
  await tx.registrationTarget.create({
    data: {
      organizationId,
      salesProductId,
      channelAccountId,
      displayName: data.name ?? null,
      registrationInput: importedRegistrationInput(data) as Prisma.InputJsonValue,
      selectedOptions: options.length === 0
        ? undefined
        : {
          createMany: {
            data: options.map((option, sortOrder) => ({
              salesProductOptionId: option.id,
              sortOrder,
              // Import writes already contain the resolved source price for
              // each exact bootstrap option. Never flatten a scalar price
              // across options or silently inherit a canonical price.
              salePrice: salePricesByOptionId.get(option.id) ?? null,
              normalPrice: null,
              supplyPrice: null,
            })),
          },
        },
    },
  });
}

function resolveImportedOptionPrices(
  options: readonly { id: string; sabangnetOptionCode: string | null }[],
  data: Partial<SalesProductChannelOverrideRecord>,
): Map<string, number> {
  const pricesByOptionId = new Map<string, number>();
  const optionPrices = data.optionPrices;
  const hasScalarPrice = data.salePrice !== undefined && data.salePrice !== null;
  const hasRate = data.priceRateBp !== undefined && data.priceRateBp !== null;
  if (optionPrices === undefined) {
    if (hasScalarPrice || hasRate) {
      throw new ConflictException('가격 비율만으로는 단품별 최종 판매가를 물질화할 수 없습니다. 최종 판매가를 다시 보내 주세요.');
    }
    return pricesByOptionId;
  }
  if (!Array.isArray(optionPrices)) {
    throw new ConflictException('단품별 최종 판매가 형식이 올바르지 않습니다.');
  }

  const optionBySourceCode = new Map<string, { id: string }>();
  for (const option of options) {
    if (!option.sabangnetOptionCode) continue;
    if (optionBySourceCode.has(option.sabangnetOptionCode)) {
      throw new ConflictException(`사방넷 단품코드가 판매상품 안에서 겹칩니다: ${option.sabangnetOptionCode}`);
    }
    optionBySourceCode.set(option.sabangnetOptionCode, { id: option.id });
  }
  const seenSourceCodes = new Set<string>();
  for (const entry of optionPrices) {
    if (!entry || typeof entry.sabangnetOptionCode !== 'string' || entry.sabangnetOptionCode.trim() !== entry.sabangnetOptionCode) {
      throw new ConflictException('단품별 최종 판매가에 사방넷 단품코드가 없습니다.');
    }
    const sourceCode = entry.sabangnetOptionCode;
    if (!sourceCode || seenSourceCodes.has(sourceCode)) {
      throw new ConflictException(`단품별 최종 판매가에 사방넷 단품코드가 겹칩니다: ${sourceCode || '(빈 값)'}`);
    }
    seenSourceCodes.add(sourceCode);
    const option = optionBySourceCode.get(sourceCode);
    if (!option) {
      throw new ConflictException(`가져온 단품코드를 현재 판매상품에서 찾을 수 없습니다: ${sourceCode}`);
    }
    if (typeof entry.salePrice !== 'number'
      || !Number.isSafeInteger(entry.salePrice)
      || entry.salePrice < 0
      || entry.salePrice > MAX_MONEY) {
      throw new ConflictException(`단품 최종 판매가가 올바르지 않습니다: ${sourceCode}`);
    }
    pricesByOptionId.set(option.id, entry.salePrice);
  }
  for (const option of options) {
    if (!option.sabangnetOptionCode || !seenSourceCodes.has(option.sabangnetOptionCode)) {
      throw new ConflictException(`가져온 단품별 최종 판매가에 현재 단품이 빠졌습니다: ${option.sabangnetOptionCode ?? option.id}`);
    }
  }
  return pricesByOptionId;
}

function importedRegistrationInput(data: Partial<SalesProductChannelOverrideRecord>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if (data.detailHtml !== undefined) input.detailHtml = data.detailHtml;
  if (data.promoText !== undefined) input.promoText = data.promoText;
  if (data.noticeCategory !== undefined) input.noticeCategory = data.noticeCategory;
  if (data.stockPercent !== undefined) input.stockPercent = data.stockPercent;
  if (isStringRecord(data.adapterValues)) input.mallRegisterValues = data.adapterValues;
  return input;
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
  // The product version update already holds its row lock. Execution preparation
  // takes that same lock, so this check also covers an execution created after planning.
  const executions = await readSalesProductOptionExecutionCounts(tx, { organizationId, salesProductId });
  const current = await tx.salesProductOption.findMany({
    where: { organizationId, salesProductId },
    include: { components: true, _count: { select: { registrationSelections: true, channelListingOptions: true } } },
  });
  for (const option of current) {
    const used = (executions.get(option.id) ?? 0) > 0 || option._count.channelListingOptions > 0;
    if (plan.deleteIds.includes(option.id) && (used || option._count.registrationSelections > 0)) {
      throw new ConflictException('옵션에 새 연결 또는 실행 이력이 생겼습니다. 다시 불러오세요.');
    }
    const write = plan.writes.find(item => item.id === option.id);
    if (write && used && option.components.length > 0 && compositionKey(option.components) !== compositionKey(write.components)) {
      throw new ConflictException('사용한 옵션의 구성 변경에는 새 옵션이 필요합니다. 다시 불러오세요.');
    }
  }
  const updateIds = plan.writes.flatMap((write) => (write.id ? [write.id] : []));
  const retired = plan.retireIds.length > 0
    ? await tx.salesProductOption.findMany({
      where: { id: { in: plan.retireIds }, organizationId, salesProductId },
      select: { id: true, values: true },
    })
    : [];
  for (const id of updateIds) {
    await tx.salesProductOption.updateMany({
      where: { id, organizationId, salesProductId },
      data: { optionKey: `~${id}` },
    });
  }
  for (const option of retired) {
    await tx.salesProductOption.updateMany({
      where: { id: option.id, organizationId, salesProductId },
      data: { optionKey: `~${option.id}`, supplyStatus: 'unused' },
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
        sabangnetOptionCode: write.sabangnetOptionCode ?? null,
        values: write.values,
        optionKey: write.optionKey,
        alias: write.alias,
        barcode: write.barcode,
        salePrice: write.salePrice,
        normalPrice: write.normalPrice,
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
          masterProductId: component.masterProductId,
          quantity: component.quantity,
        })),
      });
    }
  }
  await writeOptions(tx, organizationId, salesProductId, creates);
  if (retired.length > 0) {
    const takenKeys = new Set(plan.writes.map((write) => write.optionKey));
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

function compositionKey(components: readonly { masterProductId: string; quantity: number }[]): string {
  return JSON.stringify(components.map(item => [item.masterProductId, item.quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
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
    sourcePlatform: row.sourcePlatform,
    sourceUrl: row.sourceUrl,
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
    description: row.description,
    targetAudience: row.targetAudience,
    ageGroup: row.ageGroup,
    productSize: row.productSize,
    colorVariantNames: row.colorVariantNames,
    boxSetQuantity: row.boxSetQuantity,
    registrationDefaults: (row.registrationDefaults as Record<string, unknown> | null) ?? null,
    status: row.status as SalesProductStatus,
    taxType: row.taxType as SalesProductTaxType,
    deliveryFeeType: (row.deliveryFeeType as SalesProductDeliveryFeeType | null) ?? null,
    deliveryFee: row.deliveryFee,
    optionAxes: row.optionAxes,
    stockManaged: row.stockManaged,
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
      salePrice: option.salePrice,
      normalPrice: option.normalPrice,
      supplyStatus: option.supplyStatus as SalesProductOptionSupplyStatus,
      safetyStock: option.safetyStock,
      sortOrder: option.sortOrder,
      components: option.components.map((component) => {
        const identity = identityById.get(component.masterProductId);
        return {
          masterProductId: component.masterProductId,
          sellpiaCode: identity?.code ?? '',
          name: identity?.name ?? '',
          optionName: identity?.optionName ?? null,
          quantity: component.quantity,
          currentStock: stockById.get(component.masterProductId) ?? null,
        };
      }),
      linkedChannelOptionCount: option._count.channelListingOptions,
    })),
    // Legacy readers receive only an unambiguous derived projection. There is
    // no channel-overrides persistence layer anymore.
    channelOverrides: projectCompatibilityOverrides(row.registrationTargets),
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

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  return isJsonRecord(value) ? value : {};
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isJsonRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function targetMallValues(value: unknown): Record<string, string> {
  const input = asJsonRecord(value);
  const nested = isStringRecord(input.mallRegisterValues) ? input.mallRegisterValues : null;
  if (nested) return nested;
  return isStringRecord(input.adapterValues) ? input.adapterValues : {};
}

function mergeTargetMallValues(current: unknown, values: Record<string, string>): Record<string, unknown> {
  return { ...asJsonRecord(current), mallRegisterValues: values };
}

function commonPrice(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0 || known.length !== values.length) return null;
  return new Set(known).size === 1 ? known[0]! : null;
}

function projectCompatibilityOverrides(
  targets: readonly {
    id: string;
    channelAccountId: string;
    version: number;
    displayName: string | null;
    registrationInput: unknown;
    updatedAt: Date;
    channelAccount: { channel: string; name: string };
    selectedOptions: readonly { salePrice: number | null }[];
  }[],
): SalesProduct['channelOverrides'] {
  const countByAccount = new Map<string, number>();
  for (const target of targets) countByAccount.set(target.channelAccountId, (countByAccount.get(target.channelAccountId) ?? 0) + 1);
  return targets.filter((target) => countByAccount.get(target.channelAccountId) === 1).map((target) => {
    const input = asJsonRecord(target.registrationInput);
    const values = targetMallValues(target.registrationInput);
    return {
      id: target.id,
      channelAccountId: target.channelAccountId,
      mallKey: target.channelAccount.channel,
      mallName: target.channelAccount.name,
      salePrice: commonPrice(target.selectedOptions.map((option) => option.salePrice)),
      name: target.displayName,
      detailHtml: typeof input.detailHtml === 'string' ? input.detailHtml : null,
      promoText: typeof input.promoText === 'string' ? input.promoText : null,
      noticeCategory: typeof input.noticeCategory === 'string' ? input.noticeCategory : null,
      stockPercent: typeof input.stockPercent === 'number' ? input.stockPercent : null,
      adapterValues: Object.keys(values).length > 0 ? values : null,
      version: target.version,
      updatedAt: target.updatedAt,
    };
  });
}

function projectMallSheetOverrides(
  targets: readonly {
    id: string;
    channelAccountId: string;
    displayName: string | null;
    registrationInput: unknown;
    selectedOptions: readonly {
      salesProductOptionId: string;
      salePrice: number | null;
      normalPrice: number | null;
      supplyPrice: number | null;
    }[];
    channelAccount: { channel: string };
  }[],
): MallSheetSourceProduct['overrides'] {
  return targets.map((target) => ({
    mallKey: target.channelAccount.channel,
    targetId: target.id,
    selectedOptionIds: target.selectedOptions.map((option) => option.salesProductOptionId),
    salePrice: commonPrice(target.selectedOptions.map((option) => option.salePrice)),
    priceRateBp: null,
    name: target.displayName,
    detailHtml: textValue(target.registrationInput, 'detailHtml'),
    promoText: textValue(target.registrationInput, 'promoText'),
    optionPrices: target.selectedOptions.map((option) => ({
      salesProductOptionId: option.salesProductOptionId,
      salePrice: option.salePrice,
      normalPrice: option.normalPrice,
      supplyPrice: option.supplyPrice,
    })),
    adapterValues: targetMallValues(target.registrationInput),
  }));
}

function textValue(value: unknown, key: string): string | null {
  const item = asJsonRecord(value)[key];
  return typeof item === 'string' ? item : null;
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

/** Listing/sheet transport projection; canonical prices remain on each option. */
/** 팔 옵션 중 가장 싼 값. 초안이라 아직 정하지 않았으면 null 이다 — 0 은 공짜라는 뜻이라 쓰지 않는다. */
function minimumOptionPrice(options: readonly { salePrice: number | null }[]): number | null {
  const prices = options.map((option) => option.salePrice).filter((price): price is number => price !== null);
  return prices.length > 0 ? Math.min(...prices) : null;
}
