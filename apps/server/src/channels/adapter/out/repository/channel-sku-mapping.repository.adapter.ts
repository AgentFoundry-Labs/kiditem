import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelSkuMappingListQuery,
  ChannelSkuMappingRepositoryPort,
  ChannelSkuMappingRow,
  ChannelSkuMappingStatus,
  ReplaceChannelSkuComponentsRepositoryInput,
  UnmappedChannelSkuEvidenceRow,
} from '../../../application/port/out/repository/channel-sku-mapping.repository.port';

const QUEUE_SOURCE_TYPE = 'coupang_wing_catalog';
const REPLACEMENT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

const MAPPING_ROW_SELECT = {
  channelAccount: {
    select: { id: true, channel: true, name: true },
  },
  listing: {
    select: {
      id: true,
      externalId: true,
      channelName: true,
      displayName: true,
      status: true,
    },
  },
  id: true,
  externalOptionId: true,
  sellerSku: true,
  itemName: true,
  barcode: true,
  modelNumber: true,
  salePrice: true,
  status: true,
  mappingStatus: true,
  updatedAt: true,
  components: {
    select: {
      inventorySkuId: true,
      quantity: true,
      mappingSource: true,
    },
  },
} as const;

type SelectedMappingRow = Prisma.ChannelListingOptionGetPayload<{
  select: typeof MAPPING_ROW_SELECT;
}>;

@Injectable()
export class ChannelSkuMappingRepositoryAdapter
implements ChannelSkuMappingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: ChannelSkuMappingListQuery) {
    const baseWhere = queueWhere(
      organizationId,
      query.channelAccountId,
      query.search,
    );
    const selectedWhere = withStatus(baseWhere, query.mappingStatus);
    const [rows, total, all, unmatched, needsReview, matched] = await Promise.all([
      this.prisma.channelListingOption.findMany({
        where: selectedWhere,
        select: MAPPING_ROW_SELECT,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.channelListingOption.count({ where: selectedWhere }),
      this.prisma.channelListingOption.count({ where: baseWhere }),
      this.prisma.channelListingOption.count({ where: withStatus(baseWhere, 'unmatched') }),
      this.prisma.channelListingOption.count({ where: withStatus(baseWhere, 'needs_review') }),
      this.prisma.channelListingOption.count({ where: withStatus(baseWhere, 'matched') }),
    ]);
    return {
      rows: rows.map(toMappingRow),
      total,
      counts: { all, unmatched, needsReview, matched },
    };
  }

  async findOne(
    organizationId: string,
    channelSkuId: string,
  ): Promise<ChannelSkuMappingRow | null> {
    const row = await this.prisma.channelListingOption.findFirst({
      where: { ...queueWhere(organizationId), id: channelSkuId },
      select: MAPPING_ROW_SELECT,
    });
    return row ? toMappingRow(row) : null;
  }

  async findEvidence(
    organizationId: string,
    channelSkuId: string,
  ): Promise<UnmappedChannelSkuEvidenceRow | null> {
    const row = await this.prisma.channelListingOption.findFirst({
      where: { ...queueWhere(organizationId), id: channelSkuId },
      select: {
        id: true,
        sellerSku: true,
        modelNumber: true,
        barcode: true,
        itemName: true,
        listing: {
          select: { channelName: true, displayName: true },
        },
      },
    });
    return row ? toEvidenceRow(row) : null;
  }

  async listUnmappedEvidence(
    organizationId: string,
    channelAccountId?: string,
  ): Promise<UnmappedChannelSkuEvidenceRow[]> {
    const rows = await this.prisma.channelListingOption.findMany({
      where: {
        ...queueWhere(organizationId, channelAccountId),
        components: { none: { organizationId } },
      },
      select: {
        id: true,
        sellerSku: true,
        modelNumber: true,
        barcode: true,
        itemName: true,
        listing: {
          select: { channelName: true, displayName: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(toEvidenceRow);
  }

  async updateUnmappedStatuses(
    organizationId: string,
    updates: Array<{
      channelSkuId: string;
      mappingStatus: 'unmatched' | 'needs_review';
    }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    await this.prisma.$transaction(updates.map((update) =>
      this.prisma.channelListingOption.updateMany({
        where: {
          ...queueWhere(organizationId),
          id: update.channelSkuId,
          components: { none: { organizationId } },
        },
        data: { mappingStatus: update.mappingStatus },
      })));
  }

  async replaceComponents(
    input: ReplaceChannelSkuComponentsRepositoryInput,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT sku.id
          FROM channel_listing_options AS sku
          INNER JOIN channel_listings AS listing
            ON listing.id = sku.listing_id
           AND listing.organization_id = sku.organization_id
           AND listing.channel_account_id = sku.channel_account_id
          INNER JOIN channel_accounts AS account
            ON account.id = sku.channel_account_id
           AND account.organization_id = sku.organization_id
          INNER JOIN source_import_runs AS import_run
            ON import_run.id = sku.last_import_run_id
           AND import_run.organization_id = sku.organization_id
           AND import_run.channel_account_id = sku.channel_account_id
          WHERE sku.id = ${input.channelSkuId}::uuid
            AND sku.organization_id = ${input.organizationId}::uuid
            AND listing.organization_id = ${input.organizationId}::uuid
            AND account.organization_id = ${input.organizationId}::uuid
            AND listing.is_deleted = FALSE
            AND import_run.source_type = ${QUEUE_SOURCE_TYPE}
            AND import_run.status = 'completed'
          FOR UPDATE OF sku
        `;
        if (!locked[0]) {
          throw new NotFoundException('ChannelSku mapping was not found');
        }

        await tx.channelSkuComponent.deleteMany({
          where: {
            organizationId: input.organizationId,
            channelSkuId: input.channelSkuId,
          },
        });
        if (input.components.length > 0) {
          await tx.channelSkuComponent.createMany({
            data: input.components.map((component) => ({
              organizationId: input.organizationId,
              channelSkuId: input.channelSkuId,
              inventorySkuId: component.inventorySkuId,
              quantity: component.quantity,
              mappingSource: input.mappingSource,
              createdBy: input.userId,
            })),
          });
        }
        const updated = await tx.channelListingOption.updateMany({
          where: { id: input.channelSkuId, organizationId: input.organizationId },
          data: { mappingStatus: input.nextStatus },
        });
        if (updated.count !== 1) {
          throw new NotFoundException('ChannelSku mapping was not found');
        }
      }, REPLACEMENT_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new BadRequestException('InventorySku component is missing or belongs to another organization');
      }
      throw error;
    }
  }
}

function queueWhere(
  organizationId: string,
  channelAccountId?: string,
  rawSearch?: string,
): Prisma.ChannelListingOptionWhereInput {
  const search = rawSearch?.trim();
  return {
    organizationId,
    ...(channelAccountId ? { channelAccountId } : {}),
    channelAccount: { is: { organizationId } },
    lastImportRun: {
      is: {
        organizationId,
        sourceType: QUEUE_SOURCE_TYPE,
        status: 'completed',
        ...(channelAccountId ? { channelAccountId } : {}),
      },
    },
    listing: {
      is: {
        organizationId,
        isDeleted: false,
        ...(channelAccountId ? { channelAccountId } : {}),
        channelAccount: { is: { organizationId } },
      },
    },
    ...(search ? {
      OR: [
        { listing: { is: { externalId: contains(search) } } },
        { listing: { is: { channelName: contains(search) } } },
        { listing: { is: { displayName: contains(search) } } },
        { externalOptionId: contains(search) },
        { sellerSku: contains(search) },
        { itemName: contains(search) },
        { barcode: contains(search) },
        { modelNumber: contains(search) },
      ],
    } : {}),
  };
}

function withStatus(
  baseWhere: Prisma.ChannelListingOptionWhereInput,
  status: ChannelSkuMappingListQuery['mappingStatus'],
): Prisma.ChannelListingOptionWhereInput {
  if (!status || status === 'all') return baseWhere;
  if (status === 'matched') {
    return { AND: [baseWhere, { components: { some: {} } }] };
  }
  if (status === 'needs_review') {
    return {
      AND: [baseWhere, { components: { none: {} } }, { mappingStatus: 'needs_review' }],
    };
  }
  return {
    AND: [
      baseWhere,
      { components: { none: {} } },
      { mappingStatus: { not: 'needs_review' } },
    ],
  };
}

function contains(value: string) {
  return { contains: value, mode: 'insensitive' as const };
}

function toMappingRow(row: SelectedMappingRow): ChannelSkuMappingRow {
  if (!row.channelAccount) {
    throw new Error('ChannelSku queue row is missing its ChannelAccount');
  }
  return {
    channelAccount: row.channelAccount,
    product: {
      id: row.listing.id,
      externalProductId: row.listing.externalId,
      registeredName: row.listing.channelName,
      displayName: row.listing.displayName,
      status: row.listing.status,
    },
    sku: {
      id: row.id,
      externalSkuId: row.externalOptionId,
      sellerSku: row.sellerSku,
      optionName: row.itemName,
      barcode: row.barcode,
      modelNumber: row.modelNumber,
      salePrice: row.salePrice,
      status: row.status,
      mappingStatus: asMappingStatus(row.mappingStatus),
      updatedAt: row.updatedAt,
    },
    componentRefs: row.components,
  };
}

function toEvidenceRow(row: {
  id: string;
  sellerSku: string | null;
  modelNumber: string | null;
  barcode: string | null;
  itemName: string | null;
  listing: { channelName: string | null; displayName: string | null };
}): UnmappedChannelSkuEvidenceRow {
  return {
    channelSkuId: row.id,
    sellerSku: row.sellerSku,
    modelNumber: row.modelNumber,
    barcode: row.barcode,
    optionName: row.itemName,
    productNames: [row.listing.channelName, row.listing.displayName]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  };
}

function asMappingStatus(value: string): ChannelSkuMappingStatus {
  if (value === 'matched' || value === 'needs_review') return value;
  return 'unmatched';
}
