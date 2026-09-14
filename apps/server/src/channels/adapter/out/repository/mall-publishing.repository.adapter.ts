import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  readInventoryAvailability,
  readInventorySkuIdentities,
} from '../../../../inventory/read/inventory-availability';
import { readOrderCountsByChannelAccount } from '../../../../orders/read/order-facts.reader';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CoupangNoticeSourceRow,
  ExistingNoticeRow,
  MallAccountAnchorRow,
  MallListingAccountRow,
  MallMatrixProductRow,
  MallMatrixQuery,
  MallOrderCountRow,
  MallProfileRow,
  NoticeUpsertInput,
  MallProfileWriteInput,
  MallPublishingRepositoryPort,
  PreflightProductQuery,
  PreflightProductRow,
  PromotedMallAccountRow,
} from '../../../application/port/out/repository/mall-publishing.repository.port';

/**
 * 몰별 등록·품절의 저장소.
 *
 * 몰 계정은 이미 몰 하나당 `ChannelAccount` 한 row 다
 * (`channel='order_collection'`, `externalAccountId=<mallKey>`). 그래서 등록용
 * 계정을 따로 승격해 만들지 않는다 — 자격증명이 두 곳에 생기는 순간
 * "어느 쪽이 진실인가"를 매번 판정해야 하고, 그게 사방넷 부가정보가 만든 문제와
 * 같은 종류다. 여기서는 기존 row 를 그대로 앵커로 쓴다.
 */
const ORDER_COLLECTION_CHANNEL = 'order_collection';
const ORDER_COLLECTION_CONFIG_KEY = 'orderCollection';
const COUPANG_CHANNEL = 'coupang';
const BACKFILL_SOURCE = 'coupang_backfill';
/** Wing 상품목록 엑셀의 검색옵션 슬롯 수. */
const COUPANG_SEARCH_OPTION_SLOTS = 100;


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

function readConfig(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const config = value as Record<string, unknown>;
  const scoped = config[ORDER_COLLECTION_CONFIG_KEY];
  if (!scoped || typeof scoped !== 'object' || Array.isArray(scoped)) return {};
  return scoped as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

type ProfileRecord = Prisma.MallListingProfileGetPayload<{
  include: { channelAccount: { select: { externalAccountId: true } } };
}>;

function toProfileRow(record: ProfileRecord): MallProfileRow {
  return {
    id: record.id,
    channelAccountId: record.channelAccountId,
    mallKey: record.channelAccount.externalAccountId ?? '',
    name: record.name,
    isDefault: record.isDefault,
    isActive: record.isActive,
    asPhone: record.asPhone,
    categoryCode: record.categoryCode,
    namePrefix: record.namePrefix,
    nameSuffix: record.nameSuffix,
    shippingJson: record.shippingJson,
    returnJson: record.returnJson,
    addressJson: record.addressJson,
    updatedAt: record.updatedAt,
  };
}

const PROFILE_INCLUDE = {
  channelAccount: { select: { externalAccountId: true } },
} as const;

@Injectable()
export class MallPublishingRepositoryAdapter implements MallPublishingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 몰 계정 앵커를 한 번에 읽는다.
   *
   * 주문수집 몰은 `order_collection` row 의 `externalAccountId` 가 몰 키이고,
   * 쿠팡·로켓은 `channel` 자체가 몰 키다. 두 모양을 여기서 하나로 만든다.
   */
  async listMallAccountAnchors(organizationId: string): Promise<MallAccountAnchorRow[]> {
    const rows = await this.prisma.channelAccount.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        channel: true,
        status: true,
        externalAccountId: true,
        config: true,
      },
    });

    return rows.flatMap<MallAccountAnchorRow>((row) => {
      if (row.channel === ORDER_COLLECTION_CHANNEL) {
        const mallKey = row.externalAccountId;
        if (!mallKey) return [];
        const config = readConfig(row.config);
        return [{
          mallKey,
          channelAccountId: row.id,
          name: row.name,
          // 값은 읽지 않는다. 아이디와 비밀번호가 저장돼 있는지만 본다.
          hasCredentials: Boolean(readString(config.loginId)) && config.password != null,
          source: 'order_collection' as const,
        }];
      }
      return [{
        mallKey: row.channel,
        channelAccountId: row.id,
        name: row.name,
        // 자기 채널 계정은 연결됐다는 사실 자체가 자격증명 보유를 뜻한다.
        // 실제 송신 가능 여부는 preflight 와 어댑터가 판정한다.
        hasCredentials: row.status === 'active',
        source: 'channel' as const,
      }];
    });
  }

  /**
   * 프로필을 붙일 `ChannelAccount` 를 보장한다.
   *
   * 이미 있는 앵커를 최우선으로 재사용한다. 자격증명은 넣지 않는다 — 그건
   * 주문수집 설정 화면이 소유한다.
   */
  async ensureMallAccountAnchor(input: {
    organizationId: string;
    mallKey: string;
    mallName: string;
  }): Promise<PromotedMallAccountRow> {
    const existing = await this.prisma.channelAccount.findFirst({
      where: {
        organizationId: input.organizationId,
        OR: [
          { channel: input.mallKey },
          { channel: ORDER_COLLECTION_CHANNEL, externalAccountId: input.mallKey },
        ],
      },
      // 자기 채널 계정이 있으면 그쪽을 쓴다.
      orderBy: { channel: 'asc' },
      select: { id: true, name: true, externalAccountId: true },
    });
    if (existing) {
      return {
        id: existing.id,
        mallKey: input.mallKey,
        name: existing.name,
        externalAccountId: existing.externalAccountId,
      };
    }
    const created = await this.prisma.channelAccount.create({
      data: {
        organizationId: input.organizationId,
        channel: ORDER_COLLECTION_CHANNEL,
        name: input.mallName,
        externalAccountId: input.mallKey,
        status: 'configured',
        isPrimary: false,
      },
      select: { id: true, name: true, externalAccountId: true },
    });
    return {
      id: created.id,
      mallKey: input.mallKey,
      name: created.name,
      externalAccountId: created.externalAccountId,
    };
  }

  async listProfiles(
    organizationId: string,
    channelAccountId?: string,
  ): Promise<MallProfileRow[]> {
    const records = await this.prisma.mallListingProfile.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(channelAccountId ? { channelAccountId } : {}),
      },
      include: PROFILE_INCLUDE,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return records.map(toProfileRow);
  }

  async findProfile(organizationId: string, profileId: string): Promise<MallProfileRow | null> {
    const record = await this.prisma.mallListingProfile.findFirst({
      where: { id: profileId, organizationId, deletedAt: null },
      include: PROFILE_INCLUDE,
    });
    return record ? toProfileRow(record) : null;
  }

  async createProfile(input: {
    organizationId: string;
    channelAccountId: string;
    data: MallProfileWriteInput;
  }): Promise<MallProfileRow> {
    const { organizationId, channelAccountId, data } = input;
    return this.prisma.$transaction(async (tx) => {
      // 기본 프로필은 몰당 하나다. 부분 unique 가 있으니 먼저 내려두지 않으면
      // 두 번째 기본 프로필 저장이 제약 위반으로 떨어진다.
      if (data.isDefault) {
        await tx.mallListingProfile.updateMany({
          where: { organizationId, channelAccountId, isDefault: true, deletedAt: null },
          data: { isDefault: false },
        });
      }
      const created = await tx.mallListingProfile.create({
        data: {
          organizationId,
          channelAccountId,
          name: data.name,
          isDefault: data.isDefault ?? false,
          isActive: data.isActive ?? true,
          asPhone: data.asPhone ?? null,
          categoryCode: data.categoryCode ?? null,
          namePrefix: data.namePrefix ?? null,
          nameSuffix: data.nameSuffix ?? null,
          shippingJson: toJsonInput(data.shippingJson),
          returnJson: toJsonInput(data.returnJson),
          addressJson: toJsonInput(data.addressJson),
        },
        include: PROFILE_INCLUDE,
      });
      return toProfileRow(created);
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('같은 이름의 프로필이 이미 있습니다.');
      }
      throw error;
    });
  }

  async updateProfile(input: {
    organizationId: string;
    profileId: string;
    data: MallProfileWriteInput;
  }): Promise<MallProfileRow> {
    const { organizationId, profileId, data } = input;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.mallListingProfile.findFirst({
        where: { id: profileId, organizationId, deletedAt: null },
        select: { id: true, channelAccountId: true },
      });
      if (!existing) throw new NotFoundException('프로필을 찾을 수 없습니다.');
      if (data.isDefault) {
        await tx.mallListingProfile.updateMany({
          where: {
            organizationId,
            channelAccountId: existing.channelAccountId,
            isDefault: true,
            deletedAt: null,
            id: { not: profileId },
          },
          data: { isDefault: false },
        });
      }
      const updated = await tx.mallListingProfile.update({
        where: { id: profileId },
        data: {
          name: data.name,
          ...(data.isDefault === undefined ? {} : { isDefault: data.isDefault }),
          ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
          ...(data.asPhone === undefined ? {} : { asPhone: data.asPhone }),
          ...(data.categoryCode === undefined ? {} : { categoryCode: data.categoryCode }),
          ...(data.namePrefix === undefined ? {} : { namePrefix: data.namePrefix }),
          ...(data.nameSuffix === undefined ? {} : { nameSuffix: data.nameSuffix }),
          shippingJson: toJsonInput(data.shippingJson),
          returnJson: toJsonInput(data.returnJson),
          addressJson: toJsonInput(data.addressJson),
        },
        include: PROFILE_INCLUDE,
      });
      return toProfileRow(updated);
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('같은 이름의 프로필이 이미 있습니다.');
      }
      throw error;
    });
  }

  async softDeleteProfile(organizationId: string, profileId: string): Promise<void> {
    const result = await this.prisma.mallListingProfile.updateMany({
      where: { id: profileId, organizationId, deletedAt: null },
      data: { deletedAt: new Date(), isDefault: false },
    });
    if (result.count === 0) throw new NotFoundException('프로필을 찾을 수 없습니다.');
  }

  /**
   * 쿠팡 Wing 상품목록(`rawJson`)에서 고시 역추출 소스를 읽는다.
   *
   * 상품 마스터에 연결되지 않은 리스팅은 쓸 수 없다 — 고시는 MasterProduct 에
   * 붙기 때문이다.
   */
  async listCoupangNoticeSources(organizationId: string): Promise<CoupangNoticeSourceRow[]> {
    const rows = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        masterProductId: { not: null },
        channelAccount: { channel: COUPANG_CHANNEL },
      },
      select: {
        masterProductId: true,
        externalId: true,
        displayName: true,
        category: true,
        brand: true,
        manufacturer: true,
        rawJson: true,
        masterProduct: { select: { name: true } },
      },
    });

    return rows.flatMap((row) => {
      if (!row.masterProductId) return [];
      const raw = row.rawJson && typeof row.rawJson === 'object' && !Array.isArray(row.rawJson)
        ? (row.rawJson as Record<string, unknown>)
        : {};
      const searchOptions: { type: string; value: string }[] = [];
      for (let index = 1; index <= COUPANG_SEARCH_OPTION_SLOTS; index += 1) {
        const type = readString(raw[`검색옵션유형${index}`]);
        const value = readString(raw[`검색옵션값${index}`]);
        if (type && value) searchOptions.push({ type, value });
      }
      return [{
        masterProductId: row.masterProductId,
        externalId: row.externalId,
        productName: row.masterProduct?.name ?? row.displayName ?? readString(raw['등록상품명']) ?? '',
        category: row.category ?? readString(raw['카테고리']),
        manufacturer: row.manufacturer ?? readString(raw['제조사']),
        brand: row.brand ?? readString(raw['브랜드']),
        modelNumber: readString(raw['모델번호']),
        searchOptions,
      }];
    });
  }

  async listExistingDefaultNotices(organizationId: string): Promise<ExistingNoticeRow[]> {
    const rows = await this.prisma.productNoticeAttribute.findMany({
      where: { organizationId, channel: null },
      select: { masterProductId: true, source: true },
    });
    return rows.map((row) => ({ masterProductId: row.masterProductId, source: row.source }));
  }

  /**
   * 역추출 결과를 저장한다.
   *
   * 운영자가 직접 넣은 행은 호출부에서 걸러 오지만, 여기서도 `source` 조건을 걸어
   * 두 번 막는다. 고시는 사람이 고친 값이 항상 이긴다.
   */
  async upsertBackfilledNotices(
    organizationId: string,
    inputs: readonly NoticeUpsertInput[],
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const input of inputs) {
      const result = await this.prisma.productNoticeAttribute.updateMany({
        where: {
          organizationId,
          masterProductId: input.masterProductId,
          channel: null,
          source: BACKFILL_SOURCE,
        },
        data: {
          noticeCategory: input.noticeCategory,
          attributesJson: input.attributes as Prisma.InputJsonObject,
        },
      });
      if (result.count > 0) {
        updated += result.count;
        continue;
      }
      try {
        await this.prisma.productNoticeAttribute.create({
          data: {
            organizationId,
            masterProductId: input.masterProductId,
            noticeCategory: input.noticeCategory,
            attributesJson: input.attributes as Prisma.InputJsonObject,
            source: BACKFILL_SOURCE,
          },
        });
        created += 1;
      } catch (error) {
        // 같은 상품에 운영자 행이 이미 있으면 unique 로 튕긴다. 그건 건너뛰는 게 맞다.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    return { created, updated };
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
          noticeAttributes: {
            // 몰별 override 는 Phase 1 에서 쓴다. 지금은 기본값(channel=null)만 본다.
            where: { channel: null },
            select: { noticeCategory: true, attributesJson: true },
            take: 1,
          },
          certifications: {
            orderBy: [{ validTo: 'desc' }],
            select: { certType: true, validTo: true },
            take: 1,
          },
          channelListings: {
            where: { isActive: true },
            select: {
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
      const notice = record.noticeAttributes[0] ?? null;
      const certification = record.certifications[0] ?? null;
      return {
        masterProductId: record.id,
        code: record.code,
        name: record.name,
        imageCount: record.imageUrls.length,
        // 대표가는 최저가로 본다. 등록 시 실제 가격은 옵션별로 다시 정한다.
        salePrice: prices.length > 0 ? Math.min(...prices) : null,
        optionNames,
        noticeCategory: notice?.noticeCategory ?? null,
        noticeAttributes: (notice?.attributesJson ?? null) as Record<string, unknown> | null,
        certification: certification
          ? { certType: certification.certType, validTo: certification.validTo }
          : null,
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

    const [accounts, productCounts] = await Promise.all([
      this.prisma.channelAccount.findMany({
        where: { organizationId, id: { in: grouped.map((row) => row.channelAccountId) } },
        select: { id: true, channel: true, name: true, externalAccountId: true },
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
    ]);

    const countByAccount = new Map(grouped.map((row) => [row.channelAccountId, row._count._all]));
    const productByAccount = new Map(
      productCounts.map((row) => [row.channelAccountId, row.productCount]),
    );

    return accounts.map((account) => ({
      channelAccountId: account.id,
      channel: account.channel,
      name: account.name,
      externalAccountId: account.externalAccountId,
      listingCount: countByAccount.get(account.id) ?? 0,
      productCount: productByAccount.get(account.id) ?? 0,
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
