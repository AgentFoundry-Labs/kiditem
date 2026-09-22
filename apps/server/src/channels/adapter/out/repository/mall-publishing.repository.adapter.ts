import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { CHANNEL_LISTING_CONTENT_PORT, type ChannelListingContentPort } from '../../../application/port/out/content/listing-content.port';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PRODUCT_AVAILABILITY_PORT,
  type ProductAvailabilityPort,
} from '../../../../products/application/port/in/product-availability.port';
import {
  PRODUCT_SOURCE_READ_PORT,
  type ProductSourceReadModel,
  type ProductSourceReadPort,
} from '../../../../products/application/port/in/product-source-read.port';
import { readOrderCountsByChannelAccount } from '../../../../orders/read/order-facts.reader';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MALL_ACCOUNT_ROW_ORDER } from '../../../read/mall-account-rows';
import { readMallListingProfile } from '../../../domain/account/mall-listing-profile';
import { PUBLISHED_LISTING_STATUSES } from '../../../domain/listing/mall-listing-state';
import { withListingProductSummary } from '../../../domain/listing/listing-product-summary';
import type {
  MallAccountRow,
  MallListingAccountRow,
  MallMatrixProductRow,
  MallMatrixQuery,
  MallOrderCountRow,
  MallPublishingRepositoryPort,
  PreflightProductQuery,
  PreflightProductRow,
} from '../../../application/port/out/repository/mall-publishing.repository.port';

/**
 * 몰별 등록·품절의 저장소.
 *
 * 몰 계정은 몰 하나당 `ChannelAccount` 한 행이고 `channel` 이 몰 키다(ADR-0012). 로그인
 * (`config.orderCollection`)과 등록 기본값(`config.listingProfile`)이 같은 행에 있다. 행을
 * 만들고 고치는 곳은 Orders 쇼핑몰 계정 서비스 하나라, 여기서는 읽기만 한다 — 자격증명이 두
 * 곳에 생기는 순간 "어느 쪽이 진실인가"를 매번 판정해야 한다.
 */
const ORDER_COLLECTION_CONFIG_KEY = 'orderCollection';
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** 값은 읽지 않는다. 주문수집 로그인 아이디와 비밀번호가 저장돼 있는지만 본다. */
function hasStoredLogin(config: Prisma.JsonValue | null): boolean {
  const scoped = asRecord(asRecord(config)?.[ORDER_COLLECTION_CONFIG_KEY]);
  return Boolean(readString(scoped?.loginId)) && scoped?.password != null;
}

/** 한 번에 묶어 읽을 리스팅 수. 중첩 관계까지 붙는 조회라 넉넉히 낮게 잡는다. */
const MATRIX_LISTING_CHUNK = 500;

/** 긴 id 목록을 묶음으로 끊어 읽고 결과를 이어 붙인다. */
async function chunked<T>(
  ids: readonly string[],
  size: number,
  read: (ids: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; start < ids.length; start += size) {
    out.push(...await read([...ids.slice(start, start + size)]));
  }
  return out;
}

@Injectable()
export class MallPublishingRepositoryAdapter implements MallPublishingRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_SOURCE_READ_PORT)
    private readonly productSourceRead: ProductSourceReadPort,
    @Inject(PRODUCT_AVAILABILITY_PORT)
    private readonly productAvailability: ProductAvailabilityPort,
    @Inject(CHANNEL_LISTING_CONTENT_PORT) private readonly content: ChannelListingContentPort,
  ) {}

  async listMallAccounts(organizationId: string): Promise<MallAccountRow[]> {
    const rows = await this.prisma.channelAccount.findMany({
      where: { organizationId },
      orderBy: MALL_ACCOUNT_ROW_ORDER,
      select: { id: true, name: true, channel: true, status: true, config: true },
    });

    const byMall = new Map<string, MallAccountRow>();
    for (const row of rows) {
      if (byMall.has(row.channel)) continue;
      byMall.set(row.channel, {
        mallKey: row.channel,
        channelAccountId: row.id,
        name: row.name,
        // 마켓 연결로 활성화된 행(쿠팡 WING 등)은 연결 자체가 자격증명 보유다. 실제 송신
        // 가능 여부는 preflight 와 어댑터가 판정한다.
        hasCredentials: hasStoredLogin(row.config) || row.status === 'active',
        listingProfile: readMallListingProfile(row.config),
      });
    }
    return [...byMall.values()];
  }

  async listPreflightProducts(
    organizationId: string,
    query: PreflightProductQuery,
  ): Promise<{ rows: PreflightProductRow[]; total: number }> {
    const identities = await this.listVisibleProductIdentities(organizationId);
    const requestedIds = query.masterProductIds?.length
      ? new Set(query.masterProductIds)
      : null;
    const search = query.search?.trim().toLocaleLowerCase();
    const selected = identities.filter((identity) =>
      (!requestedIds || requestedIds.has(identity.masterProductId))
      && (!search
        || identity.code.toLocaleLowerCase().includes(search)
        || identity.name.toLocaleLowerCase().includes(search)),
    );
    const selectedIds = selected.map((identity) => identity.masterProductId);
    const listingRows = selectedIds.length === 0
      ? []
      : (await this.prisma.channelListing.findMany({
        where: {
          organizationId,
          isActive: true,
          options: {
            some: {
              organizationId,
              inventoryComponents: {
                some: { organizationId, masterProductId: { in: selectedIds } },
              },
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          updatedAt: true,
          // KC 는 판매상품의 인증 문서에서만 읽는다(KID-310) — 후보 3단 조인을 걷어냈다.
          salesProduct: { select: { certifications: true, kcStatus: true } },
          options: {
            where: { organizationId },
            select: {
              isActive: true,
              itemName: true,
              salePrice: true,
              inventoryComponents: {
                where: { organizationId },
                select: { masterProductId: true },
              },
            },
          },
        },
      }))
        .map((listing) => withListingProductSummary(listing))
        .filter((listing) => listing.masterProductId !== null
          && selectedIds.includes(listing.masterProductId));
    const latestListingUpdatedAt = latestDatesByMasterProduct(listingRows);
    selected.sort((left, right) =>
      (latestListingUpdatedAt.get(right.masterProductId)?.getTime() ?? 0)
        - (latestListingUpdatedAt.get(left.masterProductId)?.getTime() ?? 0)
      || left.code.localeCompare(right.code)
      || left.masterProductId.localeCompare(right.masterProductId));
    const total = selected.length;
    const records = selected.slice(query.offset, query.offset + query.limit);
    const listingByMasterProductId = groupListingRowsByMasterProductId(listingRows);
    const stockByMaster = await this.readMatrixStock(
      organizationId,
      records.map((record) => record.masterProductId),
    );
    const rows = records.map<PreflightProductRow>((record) => {
      const productListings = listingByMasterProductId.get(record.masterProductId) ?? [];
      const options = productListings.flatMap((listing) =>
        listing.options.filter((option) => option.isActive));
      const optionNames = [
        ...new Set(options.map((option) => option.itemName?.trim()).filter(
          (name): name is string => Boolean(name),
        )),
      ];
      const prices = options
        .map((option) => option.salePrice)
        .filter((price): price is number => typeof price === 'number' && price > 0);
      const certificationNumbers = [...new Set(productListings
        .flatMap((listing) => certificationNumbersOf(listing.salesProduct?.certifications)))];
      // 여러 몰 상품이 한 판매상품을 가리키므로 'KC 해당 없음'은 그렇게 말한 상품이 하나라도
      // 있으면 성립한다. 인증 번호를 모으는 방식과 같다.
      const kcStatus = productListings.some((listing) => listing.salesProduct?.kcStatus === 'none')
        ? 'none' as const
        : certificationNumbers.length > 0 ? 'exists' as const : 'unknown' as const;
      return {
        masterProductId: record.masterProductId,
        code: record.code,
        name: record.name,
        imageCount: record.imageUrls.length,
        // 대표가는 최저가로 본다. 등록 시 실제 가격은 옵션별로 다시 정한다.
        salePrice: prices.length > 0 ? Math.min(...prices) : null,
        optionNames,
        certificationNumbers,
        kcStatus,
        // 재고 연결이 없는 것과 재고가 0 인 것은 다른 사실이다.
        stock: stockByMaster.get(record.masterProductId) ?? null,
      };
    });

    return { rows, total };
  }

  /**
   * 리스팅을 실제로 가진 계정.
   *
   * 매트릭스 열은 여기서 시작한다. 레지스트리의 29개 채널이 아니라 **우리가 리스팅을
   * 가져온 계정**이 열이다. 매니페스트에 있다는 것과 그 몰의 상품을 우리가 안다는
   * 것은 다르고, 후자만 칸을 채울 수 있다.
   */
  async listAccountsWithListings(organizationId: string): Promise<MallListingAccountRow[]> {
    const grouped = await this.prisma.channelListing.groupBy({
      by: ['channelAccountId'],
      where: { organizationId, isActive: true },
      _count: { _all: true },
    });
    if (grouped.length === 0) return [];

    const onSaleStatus = { in: [...PUBLISHED_LISTING_STATUSES] };
    const [accounts, onSaleListings, productCounts, optionCounts] = await Promise.all([
      this.prisma.channelAccount.findMany({
        where: { organizationId, id: { in: grouped.map((row) => row.channelAccountId) } },
        select: { id: true, channel: true, name: true },
      }),
      this.prisma.channelListing.groupBy({
        by: ['channelAccountId'],
        where: { organizationId, isActive: true, status: onSaleStatus },
        _count: { _all: true },
      }),
      Promise.all(grouped.map(async (row) => {
        const listings = await this.prisma.channelListing.findMany({
          where: {
            organizationId,
            channelAccountId: row.channelAccountId,
            isActive: true,
          },
          select: {
            status: true,
            options: {
              select: {
                isActive: true,
                inventoryComponents: {
                  where: { organizationId },
                  select: { masterProductId: true },
                },
              },
            },
          },
        });
        const summaries = listings.map((listing) => withListingProductSummary(listing));
        const productIds = summaries
          .map((listing) => listing.masterProductId)
          .filter((id): id is string => id !== null);
        const onSaleProductIds = summaries
          .filter((listing) => PUBLISHED_LISTING_STATUSES.includes(listing.status ?? ''))
          .map((listing) => listing.masterProductId)
          .filter((id): id is string => id !== null);
        const uniqueCount = (ids: readonly string[]) => new Set(ids).size;
        const onSaleLinkedListingCount = listings.filter((listing) => {
          if (!PUBLISHED_LISTING_STATUSES.includes(listing.status ?? '')) return false;
          const activeOptions = listing.options.filter((option) => option.isActive);
          return activeOptions.length > 0
            && activeOptions.every((option) => option.inventoryComponents.length > 0);
        }).length;
        return {
          channelAccountId: row.channelAccountId,
          productCount: uniqueCount(productIds),
          onSaleProductCount: uniqueCount(onSaleProductIds),
          onSaleLinkedListingCount,
        };
      })),
      Promise.all(grouped.map(async (row) => {
        const scope = {
          organizationId,
          isActive: true,
          listing: {
            organizationId,
            channelAccountId: row.channelAccountId,
            isActive: true,
          },
        } satisfies Prisma.ChannelListingOptionWhereInput;
        const onSale = {
          ...scope,
          listing: { ...scope.listing, status: onSaleStatus },
        } satisfies Prisma.ChannelListingOptionWhereInput;
        const matched = { inventoryComponents: { some: {} } };
        const [optionCount, matchedOptionCount, onSaleOptionCount, onSaleMatchedOptionCount] =
          await Promise.all([
            this.prisma.channelListingOption.count({ where: scope }),
            this.prisma.channelListingOption.count({ where: { ...scope, ...matched } }),
            this.prisma.channelListingOption.count({ where: onSale }),
            this.prisma.channelListingOption.count({ where: { ...onSale, ...matched } }),
          ]);
        return {
          channelAccountId: row.channelAccountId,
          optionCount,
          matchedOptionCount,
          onSaleOptionCount,
          onSaleMatchedOptionCount,
        };
      })),
    ]);

    const countByAccount = new Map(grouped.map((row) => [row.channelAccountId, row._count._all]));
    const onSaleListingByAccount = new Map(
      onSaleListings.map((row) => [row.channelAccountId, row._count._all]),
    );
    const productByAccount = new Map(productCounts.map((row) => [row.channelAccountId, row]));
    const optionsByAccount = new Map(optionCounts.map((row) => [row.channelAccountId, row]));

    return accounts.map((account) => ({
      channelAccountId: account.id,
      channel: account.channel,
      name: account.name,
      listingCount: countByAccount.get(account.id) ?? 0,
      onSaleListingCount: onSaleListingByAccount.get(account.id) ?? 0,
      productCount: productByAccount.get(account.id)?.productCount ?? 0,
      onSaleProductCount: productByAccount.get(account.id)?.onSaleProductCount ?? 0,
      onSaleLinkedListingCount: productByAccount.get(account.id)?.onSaleLinkedListingCount ?? 0,
      optionCount: optionsByAccount.get(account.id)?.optionCount ?? 0,
      matchedOptionCount: optionsByAccount.get(account.id)?.matchedOptionCount ?? 0,
      onSaleOptionCount: optionsByAccount.get(account.id)?.onSaleOptionCount ?? 0,
      onSaleMatchedOptionCount: optionsByAccount.get(account.id)?.onSaleMatchedOptionCount ?? 0,
    }));
  }
  /**
   * 매트릭스 한 페이지.
   *
   * 행은 상품 마스터다. 수집상품이 아니라 마스터인 이유는 리스팅이 마스터에
   * 걸려 있기 때문이다(라이브 실측 2026-09-09: 리스팅 1,689건 중 마스터 연결
   * 871건, 수집상품 연결 2건). 수집상품을 행으로 쓰면 표가 거의 비어 있게 된다.
   */
  async listMatrixProducts(
    organizationId: string,
    query: MallMatrixQuery,
  ): Promise<{ rows: MallMatrixProductRow[]; total: number }> {
    // 열에 없는 계정의 리스팅은 필터 판정에도 넣지 않는다. 화면에 보이지 않는
    // 몰 때문에 '등록됨'으로 잡히면 표가 설명되지 않는다.
    const listingScope: Prisma.ChannelListingWhereInput = {
      // 조직 울타리. 빠뜨리면 남의 조직 리스팅까지 읽어 와 메모리에서 거른다.
      organizationId,
      isActive: true,
      ...(query.channelAccountIds?.length
        ? { channelAccountId: { in: query.channelAccountIds } }
        : {}),
    };

    const identities = await this.listVisibleProductIdentities(organizationId);
    const search = query.search?.trim().toLocaleLowerCase();
    // 한 번에 다 읽으면 Postgres 바인드 파라미터 한계(32,767)를 넘는다 — 리스팅 1만 건에
    // 중첩 관계까지 붙으면 그 수를 훌쩍 넘겨 화면이 통째로 500 이 된다(라이브 2026-09-22).
    // 묶음으로 끊어 읽고 합친다. 표가 쓰는 값은 그대로다.
    const listingIds = (await this.prisma.channelListing.findMany({
      where: { ...listingScope },
      select: { id: true },
    })).map((row) => row.id);
    const listingRows = (await chunked(listingIds, MATRIX_LISTING_CHUNK, (ids) =>
      this.prisma.channelListing.findMany({
        where: { ...listingScope, id: { in: ids } },
        select: {
        id: true,
        channelAccountId: true,
        channelAccount: { select: { channel: true } },
        status: true,
        externalId: true,
        rawJson: true,
        category: true,
        updatedAt: true,
        options: {
          where: { organizationId },
          select: {
            inventoryComponents: {
              where: { organizationId },
              select: { masterProductId: true },
            },
          },
        },
        },
      })))
      .map((listing) => withListingProductSummary(listing))
      .filter((listing) => listing.masterProductId !== null);
    const contentRows = await chunked(listingRows.map(row => row.id), MATRIX_LISTING_CHUNK, ids => {
      const selected = new Set(ids);
      return this.content.findForListings({ organizationId, listings: listingRows.filter(row => selected.has(row.id)).map(row => ({ id: row.id, channel: row.channelAccount.channel })) });
    });
    const imageByListing = new Map(contentRows.map(row => [row.listingId, row.workspaceImageUrl]));
    const listingByMasterProductId = groupListingRowsByMasterProductId(listingRows);
    const listedIds = new Set(listingByMasterProductId.keys());
    const filtered = identities.filter((identity) => {
      if (search
        && !identity.code.toLocaleLowerCase().includes(search)
        && !identity.name.toLocaleLowerCase().includes(search)) {
        return false;
      }
      if (query.listed === true) return listedIds.has(identity.masterProductId);
      if (query.listed === false) return !listedIds.has(identity.masterProductId);
      return true;
    });
    const latestListingUpdatedAt = latestDatesByMasterProduct(listingRows);
    filtered.sort((left, right) =>
      (latestListingUpdatedAt.get(right.masterProductId)?.getTime() ?? 0)
        - (latestListingUpdatedAt.get(left.masterProductId)?.getTime() ?? 0)
      || left.code.localeCompare(right.code)
      || left.masterProductId.localeCompare(right.masterProductId));
    const total = filtered.length;
    const records = filtered.slice(query.offset, query.offset + query.limit);
    const stockByMaster = await this.readMatrixStock(
      organizationId,
      records.map((record) => record.masterProductId),
    );
    const rows = records.map<MallMatrixProductRow>((record) => ({
      masterProductId: record.masterProductId,
      code: record.code,
      sellpiaCode: record.code,
      name: record.name,
      imageUrl: (listingByMasterProductId.get(record.masterProductId) ?? []).map(listing => imageByListing.get(listing.id)).find(Boolean) ?? null,
      // 재고 연결이 없는 것과 재고가 0 인 것은 다른 사실이다.
      stock: stockByMaster.get(record.masterProductId) ?? null,
      updatedAt: latestListingUpdatedAt.get(record.masterProductId) ?? new Date(0),
      listings: (listingByMasterProductId.get(record.masterProductId) ?? []).map((listing) => ({
        channelAccountId: listing.channelAccountId,
        status: listing.status,
        externalId: listing.externalId,
        category: listing.category,
        updatedAt: listing.updatedAt,
        storefrontProductId: storefrontProductIdOf(listing.rawJson),
      })),
    }));

    return { rows, total };
  }

  /** Products owns source identity visibility. A product remains visible when
   * its published stock is zero because this read is identity-based. */
  private async listVisibleProductIdentities(
    organizationId: string,
  ): Promise<ProductSourceReadModel[]> {
    return this.productSourceRead.listActiveForMatching(organizationId);
  }

  /**
   * 한 페이지 마스터의 재고. Products 가 공개한 availability 읽기를 사용한다 — 연결된
   * SKU 가 없으면 null 이고, SKU 정체성이 있으면 발행된 재고 0 도 그대로 보인다. 재고는
   * 마스터당 최대 1 row 다(sellpia_inventory_skus_org_master_key).
   */
  private async readMatrixStock(
    organizationId: string,
    masterProductIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (masterProductIds.length === 0) return new Map();
    const availability = await this.productAvailability.findByMasterProductIds({
      organizationId,
      masterProductIds: [...masterProductIds],
    });
    return new Map(availability.items.map((item) => [
      item.masterProductId,
      item.currentStock,
    ]));
  }

  countOrdersByAccount(organizationId: string): Promise<MallOrderCountRow[]> {
    return readOrderCountsByChannelAccount(this.prisma, organizationId);
  }

  async countActiveMasterProducts(organizationId: string): Promise<number> {
    return (await this.listVisibleProductIdentities(organizationId)).length;
  }

  async countVisibleMasterProducts(organizationId: string): Promise<number> {
    return (await this.listVisibleProductIdentities(organizationId)).length;
  }
}

function latestDatesByMasterProduct(
  rows: readonly { masterProductId: string | null; updatedAt: Date }[],
): Map<string, Date> {
  const latest = new Map<string, Date>();
  for (const row of rows) {
    if (!row.masterProductId) continue;
    const previous = latest.get(row.masterProductId);
    if (!previous || row.updatedAt > previous) latest.set(row.masterProductId, row.updatedAt);
  }
  return latest;
}

function groupListingRowsByMasterProductId<T extends { masterProductId: string | null }>(
  rows: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.masterProductId) continue;
    const existing = grouped.get(row.masterProductId) ?? [];
    existing.push(row);
    grouped.set(row.masterProductId, existing);
  }
  return grouped;
}

function storefrontProductIdOf(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).productId;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return typeof value === 'string' && /^\d{1,15}$/.test(value) ? value : null;
}


/** 판매상품 인증 문서(JSON) 에서 번호만 꺼낸다. 모양이 다르면 없는 것으로 본다. */
function certificationNumbersOf(certifications: unknown): string[] {
  if (!Array.isArray(certifications)) return [];
  return certifications
    .map((entry) => (entry && typeof entry === 'object' ? (entry as { number?: unknown }).number : null))
    .filter((number): number is string => typeof number === 'string' && number.trim().length > 0);
}
