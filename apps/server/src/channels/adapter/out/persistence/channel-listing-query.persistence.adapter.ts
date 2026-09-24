import { resolveMallListingState } from '../../../domain/listing/mall-listing-state';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { readRegistrationFailureCounts } from '../repository/registration-execution-ledger.reader';
import type { ChannelListingFactQueries } from '../../../application/port/in/listing/channel-listing-query.port';
import { readListingTrafficWindowFacts, readLatestListingStateFacts, readLatestListingSaleStatusFacts } from './channel-listing-daily-facts';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelListingListResult,
  ChannelListingSummary,
  ChannelListingProviderDetail,
} from '../../../application/port/in/listing/channel-listing-query.port';
import type {
  ChannelListingPersistenceQuery,
  ChannelListingQueryPersistencePort,
} from '../../../application/port/out/persistence/channel-listing-query.persistence.port';

const listingSelect = {
  id: true,
  externalId: true,
  channelName: true,
  displayName: true,
  category: true,
  brand: true,
  manufacturer: true,
  imageUrl: true,
  salesProductId: true,
  salesProduct: { select: { sourceRecordId: true } },
  status: true,
  exposureStatus: true,
  channelAccountId: true,
  createdAt: true,
  updatedAt: true,
  channelAccount: {
    select: { id: true, channel: true, name: true },
  },
  options: {
    where: { isActive: true },
    select: {
      salePrice: true,
      inventoryComponents: {
        select: { masterProductId: true },
      },
    },
  },
} satisfies Prisma.ChannelListingSelect;

const workspaceSelect = {
  ...listingSelect,
  rawJson: true,
  options: {
    where: { isActive: true },
    select: {
      externalOptionId: true,
      itemName: true,
      salePrice: true,
      sellerSku: true,
      barcode: true,
      modelNumber: true,
      status: true,
      attributesJson: true,
      rawJson: true,
      inventoryComponents: {
        select: { masterProductId: true },
      },
    },
  },
} satisfies Prisma.ChannelListingSelect;

type ListingRow = Prisma.ChannelListingGetPayload<{ select: typeof listingSelect }>;
type WorkspaceListingRow = Prisma.ChannelListingGetPayload<{ select: typeof workspaceSelect }>;

function parseQueryDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
@Injectable()
export class ChannelListingQueryPersistenceAdapter implements ChannelListingQueryPersistencePort {
  constructor(private readonly prisma: PrismaService) {}

  async readOptionCandidates(transaction: Parameters<ChannelListingFactQueries['readOptionCandidates']>[0], input: Parameters<ChannelListingFactQueries['readOptionCandidates']>[1]) {
    if (input.externalOptionIds.length === 0) return [];
    const rows = await ownerTransactionClient(transaction).channelListingOption.findMany({
      where: { organizationId: input.organizationId, externalOptionId: { in: [...input.externalOptionIds] },
        ...(input.activeOnly ? { isActive: true } : {}),
        listing: { organizationId: input.organizationId, ...(input.activeOnly ? { isActive: true } : {}),
          channelAccount: { organizationId: input.organizationId, channel: input.channel } } },
      select: { externalOptionId: true, id: true, listingId: true, itemName: true,
        listing: { select: { channelAccountId: true } } },
      orderBy: { id: 'asc' },
    });
    return rows.map(row => ({ externalOptionId: row.externalOptionId, optionId: row.id,
      listingId: row.listingId, accountId: row.listing.channelAccountId, itemName: row.itemName }));
  }

  readRegistrationFailureCounts(transaction: Parameters<ChannelListingFactQueries['readRegistrationFailureCounts']>[0], input: Parameters<ChannelListingFactQueries['readRegistrationFailureCounts']>[1]) {
    return readRegistrationFailureCounts(ownerTransactionClient(transaction), input);
  }

  async readCatalogFacts(transaction: Parameters<ChannelListingFactQueries['readCatalogFacts']>[0], input: Parameters<ChannelListingFactQueries['readCatalogFacts']>[1]) {
    if (input.accountIds?.length === 0 || input.channels?.length === 0 || input.listingIds?.length === 0) return [];
    const rows = await ownerTransactionClient(transaction).channelListing.findMany({
      where: { organizationId: input.organizationId,
        ...(input.accountIds ? { channelAccountId: { in: [...input.accountIds] } } : {}),
        ...(input.listingIds ? { id: { in: [...input.listingIds] } } : {}),
        ...(input.activeOnly ? { isActive: true } : {}),
        channelAccount: { organizationId: input.organizationId,
          ...(input.channels ? { channel: { in: [...input.channels] } } : {}),
          ...(input.activeAccountsOnly ? { status: 'active' } : {}) } },
      select: { id: true, channelAccountId: true, externalId: true, channelName: true, displayName: true,
        category: true, imageUrl: true, status: true, exposureStatus: true, isActive: true, rawJson: true,
        salesProductId: true, salesProduct: { select: { sourceRecordId: true } }, createdAt: true, updatedAt: true,
        channelAccount: { select: { channel: true } },
        options: { where: { organizationId: input.organizationId, ...(input.activeOnly ? { isActive: true } : {}) },
          select: { id: true, externalOptionId: true, itemName: true, sellerSku: true, status: true,
            salePrice: true, isActive: true, createdAt: true, updatedAt: true,
            inventoryComponents: { where: { organizationId: input.organizationId },
              select: { masterProductId: true, quantity: true }, orderBy: { masterProductId: 'asc' } } } } },
      orderBy: { id: 'asc' },
    });
    return rows.map(({ channelAccountId, channelAccount, options, salesProduct, ...row }) => ({ ...row, accountId: channelAccountId,
      sourceRecordId: salesProduct?.sourceRecordId ?? null,
      channel: channelAccount.channel, options: options.map(({ inventoryComponents, ...option }) => ({ ...option, components: inventoryComponents })) }));
  }

  async readExternalIdentities(transaction: Parameters<ChannelListingFactQueries['readExternalIdentities']>[0], input: Parameters<ChannelListingFactQueries['readExternalIdentities']>[1]) {
    const tx = ownerTransactionClient(transaction);
    const all = input.listingExternalIds === undefined && input.optionExternalIds === undefined;
    const listingRows = all || input.listingExternalIds?.length
      ? await tx.channelListing.findMany({
        where: { organizationId: input.organizationId, channelAccountId: input.accountId,
          ...(input.activeOnly ? { isActive: true } : {}),
          ...(input.listingExternalIds ? { externalId: { in: [...input.listingExternalIds] } } : {}) },
        select: { id: true, externalId: true }, orderBy: { id: 'asc' },
      }) : [];
    const options = all || input.optionExternalIds?.length
      ? await tx.channelListingOption.findMany({
        where: { organizationId: input.organizationId,
          ...(input.activeOnly ? { isActive: true } : {}),
          ...(input.optionExternalIds ? { externalOptionId: { in: [...input.optionExternalIds] } } : {}),
          listing: { organizationId: input.organizationId, channelAccountId: input.accountId,
            ...(input.activeOnly ? { isActive: true } : {}) } },
        select: { id: true, listingId: true, externalOptionId: true, listing: { select: { externalId: true } } },
        orderBy: { id: 'asc' },
      }) : [];
    const seen = new Set<string>();
    for (const option of options) {
      if (seen.has(option.externalOptionId)) throw new ConflictException('Channel option identity is ambiguous within the account.');
      seen.add(option.externalOptionId);
    }
    return [
      ...listingRows.map(row => ({ listingId: row.id, externalId: row.externalId, optionId: null, externalOptionId: null })),
      ...options.map(row => ({ listingId: row.listingId, externalId: row.listing.externalId, optionId: row.id, externalOptionId: row.externalOptionId })),
    ];
  }

  async readOptionIdentities(transaction: Parameters<ChannelListingFactQueries['readOptionIdentities']>[0], input: Parameters<ChannelListingFactQueries['readOptionIdentities']>[1]) {
    if (input.optionIds.length === 0) return [];
    const tx = ownerTransactionClient(transaction);
    const rows = await tx.channelListingOption.findMany({
      where: { organizationId: input.organizationId, id: { in: [...input.optionIds] },
        ...(input.activeOnly ? { isActive: true } : {}),
        listing: { organizationId: input.organizationId,
          ...(input.activeOnly ? { isActive: true } : {}),
          ...(input.channel ? { channelAccount: { organizationId: input.organizationId, channel: input.channel,
            ...(input.activeOnly ? { status: 'active' } : {}) } } : {}) } },
      select: { id: true, listingId: true, externalOptionId: true, itemName: true,
        listing: { select: { externalId: true, channelAccountId: true, channelName: true, displayName: true } } },
    });
    return rows.map(row => ({ optionId: row.id, listingId: row.listingId, accountId: row.listing.channelAccountId,
      externalOptionId: row.externalOptionId, listingExternalId: row.listing.externalId,
      channelName: row.listing.channelName, displayName: row.listing.displayName, itemName: row.itemName }));
  }

  async readDisplayFacts(transaction: Parameters<ChannelListingFactQueries['readDisplayFacts']>[0], input: Parameters<ChannelListingFactQueries['readDisplayFacts']>[1]) {
    if (input.listingIds.length === 0) return [];
    const rows = await ownerTransactionClient(transaction).channelListing.findMany({
      where: { organizationId: input.organizationId, id: { in: [...input.listingIds] },
        ...(input.activeOnly ? { isActive: true } : {}) },
      select: { id: true, externalId: true, channelAccountId: true, displayName: true, channelName: true,
        category: true, imageUrl: true,
        options: { where: { organizationId: input.organizationId, isActive: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1, select: { sellerSku: true } } },
    });
    return rows.map(({ channelAccountId, options, ...row }) => ({ ...row, accountId: channelAccountId,
      firstActiveSellerSku: options[0]?.sellerSku ?? null }));
  }

  readTrafficWindow(transaction: Parameters<ChannelListingFactQueries['readTrafficWindow']>[0], input: Parameters<ChannelListingFactQueries['readTrafficWindow']>[1]) {
    return readListingTrafficWindowFacts(ownerTransactionClient(transaction), input);
  }
  readLatestState(transaction: Parameters<ChannelListingFactQueries['readLatestState']>[0], input: Parameters<ChannelListingFactQueries['readLatestState']>[1]) {
    return readLatestListingStateFacts(ownerTransactionClient(transaction), input);
  }
  readLatestSaleStatus(transaction: Parameters<ChannelListingFactQueries['readLatestSaleStatus']>[0], input: Parameters<ChannelListingFactQueries['readLatestSaleStatus']>[1]) {
    return readLatestListingSaleStatusFacts(ownerTransactionClient(transaction), input);
  }
  async lockActiveOwner(transaction: Parameters<ChannelListingFactQueries['lockActiveOwner']>[0], input: Parameters<ChannelListingFactQueries['lockActiveOwner']>[1]) {
    const rows = await ownerTransactionClient(transaction).$queryRaw<Array<{ id: string; sourceRecordId: string | null; accountId: string }>>(Prisma.sql`
      SELECT listing.id,
             product.source_record_id AS "sourceRecordId",
             listing.channel_account_id AS "accountId"
      FROM channel_listings AS listing
      LEFT JOIN sales_products AS product
        ON product.id = listing.sales_product_id AND product.organization_id = listing.organization_id
      WHERE listing.id = ${input.listingId}::uuid
        AND listing.organization_id = ${input.organizationId}::uuid
        AND listing.is_active = true
      FOR UPDATE OF listing
    `);
    if (rows.length !== 1) throw new NotFoundException('Channel listing owner not found.');
    return rows[0]!;
  }
  async assertOwnedIds(transaction: Parameters<ChannelListingFactQueries['assertOwnedIds']>[0], input: Parameters<ChannelListingFactQueries['assertOwnedIds']>[1]) {
    const ids = [...new Set(input.listingIds)];
    if (ids.length === 0) return;
    const count = await ownerTransactionClient(transaction).channelListing.count({
      where: { organizationId: input.organizationId, id: { in: ids } },
    });
    if (count !== ids.length) throw new NotFoundException('Channel listing owner not found.');
  }


  async list(
    organizationId: string,
    query: ChannelListingPersistenceQuery,
  ): Promise<ChannelListingListResult> {
    const { page, limit } = query;
    const search = query.search?.trim();
    const includeInactive = query.includeDeleted;
    const createdSince = parseQueryDate(query.createdSince);
    const where: Prisma.ChannelListingWhereInput = {
      organizationId,
      isActive: !includeInactive,
      ...(query.channel
        ? { channelAccount: { is: { organizationId, channel: query.channel } } }
        : {}),
      ...(query.channelAccountId ? { channelAccountId: query.channelAccountId } : {}),
      ...(createdSince ? { createdAt: { gte: createdSince } } : {}),
      ...(search
        ? {
            OR: [
              { externalId: contains(search) },
              { channelName: contains(search) },
              { displayName: contains(search) },
              { options: { some: { itemName: contains(search) } } },
              { options: { some: { sellerSku: contains(search) } } },
            ],
          }
        : {}),
    };
    /**
     * 등록 최신순은 `createdAt` 기준이다.
     *
     * 예전에는 `updatedAt` 으로 정렬했는데, 카탈로그 재수집(`channel-catalog-identity-upsert`)이
     * 배치 전체의 `updated_at` 을 NOW() 로 갱신한다. 그래서 새로 등록한 상품이 없어도
     * 목록 순서가 통째로 뒤섞였고, "최종 등록일 최신순" 이라는 라벨과도 맞지 않았다.
     * 등록 시점은 `createdAt` 만이 안정적으로 보존한다.
     */
    const orderBy: Prisma.ChannelListingOrderByWithRelationInput[] =
      query.sort === 'oldest'
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : query.sort === 'name_asc'
          ? [{ displayName: 'asc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];

    const [total, rows, groupedCounts, accounts] = await this.prisma.$transaction([
      this.prisma.channelListing.count({ where }),
      this.prisma.channelListing.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: listingSelect,
      }),
      this.prisma.channelListing.groupBy({
        by: ['channelAccountId'],
        where: { organizationId, isActive: !includeInactive },
        orderBy: { channelAccountId: 'asc' },
        _count: { id: true },
      }),
      this.prisma.channelAccount.findMany({
        where: { organizationId },
        select: { id: true, channel: true, name: true },
      }),
    ]);
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    return {
      items: rows.map((row) => toSummary(row)),
      total,
      page,
      limit,
      marketCounts: groupedCounts.map((group) => {
        const account = accountById.get(group.channelAccountId);
        return {
          channel: account?.channel ?? 'unknown',
          channelAccountId: group.channelAccountId,
          channelAccountName: account?.name ?? null,
          count: typeof group._count === 'object' && group._count
            ? group._count.id ?? 0
            : 0,
        };
      }),
    };
  }

  async getWorkspace(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingSummary | null> {
    const row = await this.prisma.channelListing.findFirst({
      where: { id: listingId, organizationId, isActive: true },
      select: workspaceSelect,
    });
    if (!row) return null;
    return toSummary(row, true);
  }
}

function toSummary(
  row: ListingRow | WorkspaceListingRow,
  includeProviderDetail = false,
): ChannelListingSummary {
  const listingName = row.displayName ?? row.channelName ?? row.externalId;
  return {
    id: row.id,
    listingName,
    thumbnailUrl: null,
    imageUrl: row.imageUrl,
    detailPageRevisionId: null,
    // 등록 상태는 서비스가 등록 상태 reader 로 채운다(KID-320).
    registration: null,
    listingState: resolveMallListingState({ hasListing: true, listingStatus: row.status }).state,
    channel: row.channelAccount.channel,
    channelAccountId: row.channelAccountId,
    channelAccountName: row.channelAccount.name,
    externalId: row.externalId,
    channelName: row.channelName,
    category: row.category,
    brand: row.brand,
    manufacturer: row.manufacturer,
    channelPrice: firstPrice(row.options),
    salesProductId: row.salesProductId,
    sourceRecordId: row.salesProduct?.sourceRecordId ?? null,
    contentWorkspaceId: null,
    status: row.status,
    exposureStatus: row.exposureStatus,
    optionCount: row.options.length,
    mappingStatus: aggregateMappingStatus(row.options),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(includeProviderDetail ? { providerDetail: buildProviderDetail(row as WorkspaceListingRow) } : {}),
  };
}

function buildProviderDetail(row: WorkspaceListingRow): ChannelListingProviderDetail {
  const listingRaw = jsonRecord(row.rawJson);
  const detailDocuments = detailDocumentsFromRaw(listingRaw);
  const optionDocumentRefs = row.options.map((option) => ({
    externalOptionId: option.externalOptionId,
    documentIds: detailDocumentIdsFromRaw(option.rawJson),
  }));
  const hasDetailEvidence = hasOwn(listingRaw, 'detailDocuments')
    || row.options.some((option) => hasOwn(jsonRecord(option.rawJson), 'detailDocumentIds'));
  const sourceDetail = hasDetailEvidence
    ? { documents: detailDocuments, options: optionDocumentRefs }
    : null;
  return {
    category: row.category,
    brand: row.brand,
    manufacturer: row.manufacturer,
    sourceDetail,
    options: row.options.map((option) => {
      const raw = jsonRecord(option.rawJson);
      return {
        externalOptionId: option.externalOptionId,
        itemName: option.itemName,
        vendorItemId: nullableString(raw?.vendorItemId),
        sellerProductItemId: nullableString(raw?.sellerProductItemId),
        salePrice: option.salePrice,
        sellerSku: option.sellerSku,
        barcode: option.barcode,
        modelNumber: option.modelNumber,
        status: option.status,
        attributes: option.attributesJson ?? null,
      };
    }),
    media: [],
  };
}

function detailDocumentsFromRaw(raw: Record<string, unknown> | null): Array<Record<string, unknown>> {
  return Array.isArray(raw?.detailDocuments)
    ? raw.detailDocuments.flatMap((value) => {
        const document = jsonRecord(value);
        return document && typeof document.id === 'string' && typeof document.kind === 'string'
          && hasOwn(document, 'value')
          ? [document]
          : [];
      })
    : [];
}

function detailDocumentIdsFromRaw(rawValue: unknown): string[] {
  const raw = jsonRecord(rawValue);
  return Array.isArray(raw?.detailDocumentIds)
    ? raw.detailDocumentIds.filter((value): value is string =>
        typeof value === 'string' && value.trim().length > 0)
    : [];
}

function hasOwn(value: Record<string, unknown> | null, key: string): boolean {
  return value !== null && Object.prototype.hasOwnProperty.call(value, key);
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function nullableString(value: unknown): string | null {
  return stringValue(value);
}

function contains(value: string) {
  return { contains: value, mode: Prisma.QueryMode.insensitive } as const;
}

function firstPrice(options: Array<{ salePrice: number | null }>): number | null {
  return options.find((option) => option.salePrice !== null)?.salePrice ?? null;
}

function aggregateMappingStatus(
  options: Array<{
    inventoryComponents: Array<{ masterProductId: string }>;
  }>,
): 'matched' | 'unmatched' | 'needs_review' {
  if (options.length === 0 || options.every((option) => option.inventoryComponents.length === 0)) {
    return 'unmatched';
  }
  if (options.some((option) => option.inventoryComponents.length === 0)) {
    return 'needs_review';
  }
  return 'matched';
}
