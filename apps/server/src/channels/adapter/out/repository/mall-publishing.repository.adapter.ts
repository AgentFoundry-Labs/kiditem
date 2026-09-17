import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  readInventoryAvailability,
  readInventorySkuIdentities,
} from '../../../../inventory/read/inventory-availability';
import { readOrderCountsByChannelAccount } from '../../../../orders/read/order-facts.reader';
import { PrismaService } from '../../../../prisma/prisma.service';
import { readMallListingProfile } from '../../../domain/mall/mall-listing-profile';
import type { PreflightKc } from '../../../domain/mall/mall-publish-preflight';
import { MALL_ACCOUNT_ROW_ORDER } from '../../../read/mall-account-rows';
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
/** 여러 몰이 함께 쓰는 등록 칸 중 안전인증번호(`mallRegisterShared.certNumber`). */
const SHARED_CERT_NUMBER_KEY = 'certNumber';


/** 리스팅에 붙은 콘텐츠에서 대표 이미지 하나. 없으면 null. */
function firstListingImageUrl(
  listings: readonly {
    contentWorkspaces: readonly {
      contentGenerationGroups: readonly {
        originatingAssets: readonly { url: string }[];
      }[];
    }[];
  }[],
): string | null {
  for (const listing of listings) {
    for (const workspace of listing.contentWorkspaces) {
      for (const group of workspace.contentGenerationGroups) {
        const asset = group.originatingAssets[0];
        if (asset?.url) return asset.url;
      }
    }
  }
  return null;
}

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

/**
 * 수집상품 초안(`rawData.manualBasics`)의 KC 입력값.
 *
 * 운영자가 상품 기본 탭에서 실제로 입력하는 곳이 이것뿐이다(KID-107 Q5). 몰 공통 칸의
 * 안전인증번호도 같은 번호라 번호가 비면 그쪽을 본다.
 */
function readManualKc(rawData: Prisma.JsonValue): PreflightKc {
  const raw = asRecord(rawData) ?? {};
  const manual = asRecord(raw.manualBasics) ?? {};
  const shared = asRecord(manual.mallRegisterShared) ?? {};
  return {
    status: readString(manual.kcCertificationStatus) ?? readString(raw.kcCertificationStatus),
    number: readString(manual.kcCertificationNumber)
      ?? readString(raw.kcCertificationNumber)
      ?? readString(shared[SHARED_CERT_NUMBER_KEY]),
  };
}

@Injectable()
export class MallPublishingRepositoryAdapter implements MallPublishingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

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
    const where: Prisma.MasterProductWhereInput = {
      organizationId,
      isActive: true,
      ...(query.masterProductIds?.length ? { id: { in: query.masterProductIds } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: query.offset,
        take: query.limit,
        select: {
          id: true,
          code: true,
          name: true,
          imageUrls: true,
          provenanceCandidate: { select: { isDeleted: true, rawData: true } },
          channelListings: {
            where: { isActive: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              // 수집상품에서 등록한 리스팅은 그 수집상품을 기억한다. 정본 상품에 수집상품
              // 연결이 없으면 먼저 등록한 리스팅의 수집상품을 본다.
              sourceCandidate: { select: { isDeleted: true, rawData: true } },
              options: {
                where: { isActive: true },
                select: { itemName: true, salePrice: true },
              },
            },
          },
        },
      }),
      this.prisma.masterProduct.count({ where }),
    ]);

    const rows = records.map<PreflightProductRow>((record) => {
      const options = record.channelListings.flatMap((listing) => listing.options);
      const optionNames = [
        ...new Set(options.map((option) => option.itemName?.trim()).filter(
          (name): name is string => Boolean(name),
        )),
      ];
      const prices = options
        .map((option) => option.salePrice)
        .filter((price): price is number => typeof price === 'number' && price > 0);
      const candidate = [
        record.provenanceCandidate,
        ...record.channelListings.map((listing) => listing.sourceCandidate),
      ].find((entry) => entry && !entry.isDeleted) ?? null;
      return {
        masterProductId: record.id,
        code: record.code,
        name: record.name,
        imageCount: record.imageUrls.length,
        // 대표가는 최저가로 본다. 등록 시 실제 가격은 옵션별로 다시 정한다.
        salePrice: prices.length > 0 ? Math.min(...prices) : null,
        optionNames,
        kc: candidate ? readManualKc(candidate.rawData) : null,
      };
    });

    return { rows, total };
  }

  /**
   * 리스팅을 실제로 가진 계정.
   *
   * 매트릭스 열은 여기서 시작한다. 매니페스트의 29개 몰이 아니라 **우리가 리스팅을
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

    const [accounts, productCounts, optionCounts] = await Promise.all([
      this.prisma.channelAccount.findMany({
        where: { organizationId, id: { in: grouped.map((row) => row.channelAccountId) } },
        select: { id: true, channel: true, name: true },
      }),
      Promise.all(
        grouped.map(async (row) => ({
          channelAccountId: row.channelAccountId,
          productCount: (
            await this.prisma.channelListing.findMany({
              where: {
                organizationId,
                channelAccountId: row.channelAccountId,
                isActive: true,
                masterProductId: { not: null },
              },
              distinct: ['masterProductId'],
              select: { masterProductId: true },
            })
          ).length,
        })),
      ),
      // 매칭률 — 활성 옵션 가운데 셀피아 레시피가 붙은 것. 레시피가 매칭의 결과물이다.
      Promise.all(
        grouped.map(async (row) => {
          const scope = {
            organizationId,
            isActive: true,
            listing: {
              organizationId,
              channelAccountId: row.channelAccountId,
              isActive: true,
            },
          } satisfies Prisma.ChannelListingOptionWhereInput;
          const [optionCount, matchedOptionCount] = await Promise.all([
            this.prisma.channelListingOption.count({ where: scope }),
            this.prisma.channelListingOption.count({
              where: { ...scope, inventoryComponents: { some: {} } },
            }),
          ]);
          return { channelAccountId: row.channelAccountId, optionCount, matchedOptionCount };
        }),
      ),
    ]);

    const countByAccount = new Map(grouped.map((row) => [row.channelAccountId, row._count._all]));
    const productByAccount = new Map(
      productCounts.map((row) => [row.channelAccountId, row.productCount]),
    );
    const optionsByAccount = new Map(
      optionCounts.map((row) => [row.channelAccountId, row]),
    );

    return accounts.map((account) => ({
      channelAccountId: account.id,
      channel: account.channel,
      name: account.name,
      listingCount: countByAccount.get(account.id) ?? 0,
      productCount: productByAccount.get(account.id) ?? 0,
      optionCount: optionsByAccount.get(account.id)?.optionCount ?? 0,
      matchedOptionCount: optionsByAccount.get(account.id)?.matchedOptionCount ?? 0,
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
      isActive: true,
      ...(query.channelAccountIds?.length
        ? { channelAccountId: { in: query.channelAccountIds } }
        : {}),
    };

    const where: Prisma.MasterProductWhereInput = {
      organizationId,
      isActive: true,
      ...(query.listed === true ? { channelListings: { some: listingScope } } : {}),
      ...(query.listed === false ? { channelListings: { none: listingScope } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: query.offset,
        take: query.limit,
        select: {
          id: true,
          code: true,
          name: true,
          updatedAt: true,
          channelListings: {
            where: {
              isActive: true,
              ...(query.channelAccountIds?.length
                ? { channelAccountId: { in: query.channelAccountIds } }
                : {}),
            },
            select: {
              channelAccountId: true,
              status: true,
              externalId: true,
              category: true,
              updatedAt: true,
              // 상품 사진의 유일한 원천. 마스터의 `imageUrls` 는 비어 있고
              // (라이브 실측 2026-09-09: 활성 2,951건 전부 빈 배열), 리스팅에
              // 붙은 콘텐츠 워크스페이스만 대표 이미지를 들고 있다.
              contentWorkspaces: {
                where: { isDeleted: false },
                take: 1,
                select: {
                  contentGenerationGroups: {
                    take: 3,
                    select: {
                      originatingAssets: {
                        where: {
                          isDeleted: false,
                          assetType: 'image',
                          role: { in: ['primary', 'thumbnail'] },
                        },
                        take: 1,
                        select: { url: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.masterProduct.count({ where }),
    ]);

    const stockByMaster = await this.readMatrixStock(
      organizationId,
      records.map((record) => record.id),
    );
    const rows = records.map<MallMatrixProductRow>((record) => ({
      masterProductId: record.id,
      code: record.code,
      name: record.name,
      imageUrl: firstListingImageUrl(record.channelListings),
      // 재고 연결이 없는 것과 재고가 0 인 것은 다른 사실이다.
      stock: stockByMaster.get(record.id) ?? null,
      updatedAt: record.updatedAt,
      listings: record.channelListings.map((listing) => ({
        channelAccountId: listing.channelAccountId,
        status: listing.status,
        externalId: listing.externalId,
        category: listing.category,
        updatedAt: listing.updatedAt,
      })),
    }));

    return { rows, total };
  }

  /**
   * 한 페이지 마스터의 재고. 재고 원장은 Inventory 리더로만 읽는다 — 끝나지 않은
   * 수집의 줄은 재고로 보이지 않는다. 연결된 SKU 가 없거나 발행된 스냅샷에 없으면
   * null 이다. 재고는 마스터당 최대 1 row 다(sellpia_inventory_skus_org_master_key).
   */
  private async readMatrixStock(
    organizationId: string,
    masterProductIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (masterProductIds.length === 0) return new Map();
    const wanted = new Set(masterProductIds);
    return this.prisma.$transaction(async (tx) => {
      const skus = (await readInventorySkuIdentities(tx, { organizationId, selector: { kind: 'all' } }))
        .filter((sku) => sku.masterProductId !== null && wanted.has(sku.masterProductId));
      if (skus.length === 0) return new Map<string, number>();
      const availability = await readInventoryAvailability(tx, {
        organizationId,
        sellpiaInventorySkuIds: skus.map((sku) => sku.sellpiaInventorySkuId),
      });
      const stockBySku = new Map(
        availability.items.map((item) => [item.sellpiaInventorySkuId, item.currentStock]),
      );
      const stock = new Map<string, number>();
      for (const sku of skus) {
        const current = stockBySku.get(sku.sellpiaInventorySkuId);
        if (sku.masterProductId && current !== undefined) stock.set(sku.masterProductId, current);
      }
      return stock;
    });
  }

  countOrdersByAccount(organizationId: string): Promise<MallOrderCountRow[]> {
    return readOrderCountsByChannelAccount(this.prisma, organizationId);
  }

  countActiveMasterProducts(organizationId: string): Promise<number> {
    return this.prisma.masterProduct.count({ where: { organizationId, isActive: true } });
  }
}
