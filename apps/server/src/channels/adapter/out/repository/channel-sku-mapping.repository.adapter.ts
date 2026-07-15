import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelSkuAvailabilityRepositoryQuery,
  ChannelSkuAvailabilityRepositorySummary,
  ChannelSkuMappingListQuery,
  ChannelSkuMappingRepositoryPort,
  ChannelSkuMappingRow,
  ChannelSkuMappingStatus,
  ChannelSkuAutomaticMatchUpdate,
  ReplaceChannelSkuComponentsRepositoryInput,
  UnmappedChannelSkuEvidenceRow,
} from '../../../application/port/out/repository/channel-sku-mapping.repository.port';

const QUEUE_SOURCE_TYPE = 'coupang_wing_catalog';
const REPLACEMENT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

function mappingRowSelect(organizationId: string) {
  return {
    listing: {
      select: {
        id: true,
        externalId: true,
        channelName: true,
        displayName: true,
        status: true,
        channelAccount: {
          select: { id: true, channel: true, name: true },
        },
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
      where: { organizationId },
      select: {
        masterProductId: true,
        quantity: true,
        mappingSource: true,
      },
    },
  } as const;
}

type SelectedMappingRow = Prisma.ChannelListingOptionGetPayload<{
  select: ReturnType<typeof mappingRowSelect>;
}>;

type AvailabilityPageMetaRow = {
  rowIds: string[];
  total: number;
  summaryTotal: number;
  inStock: number;
  outOfStock: number;
  unmatched: number;
  needsReview: number;
};

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
    const select = mappingRowSelect(organizationId);
    const [rows, total, all, unmatched, needsReview, matched] = await Promise.all([
      this.prisma.channelListingOption.findMany({
        where: selectedWhere,
        select,
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

  async listAvailabilityPage(
    organizationId: string,
    query: ChannelSkuAvailabilityRepositoryQuery,
  ) {
    const search = query.search?.trim();
    const pageRows = await this.prisma.$queryRaw<AvailabilityPageMetaRow[]>(Prisma.sql`
      WITH scoped AS (
        SELECT
          sku.id,
          sku.updated_at,
          sku.mapping_status,
          COUNT(component.id)::int AS component_count,
          CASE
            WHEN COUNT(component.id) = 0 THEN NULL
            ELSE MIN(FLOOR(
              master.current_stock::numeric / component.quantity::numeric
            ))::int
          END AS sellable_stock
        FROM channel_listing_options AS sku
        INNER JOIN channel_listings AS listing
          ON listing.id = sku.listing_id
         AND listing.organization_id = sku.organization_id
        INNER JOIN channel_accounts AS account
          ON account.id = listing.channel_account_id
         AND account.organization_id = listing.organization_id
        INNER JOIN source_import_runs AS import_run
          ON import_run.id = sku.last_import_run_id
         AND import_run.organization_id = sku.organization_id
         AND import_run.channel_account_id = listing.channel_account_id
        LEFT JOIN channel_sku_components AS component
          ON component.channel_sku_id = sku.id
         AND component.organization_id = sku.organization_id
         AND component.organization_id = ${organizationId}::uuid
        LEFT JOIN master_products AS master
          ON master.id = component.master_product_id
         AND master.organization_id = component.organization_id
         AND master.organization_id = ${organizationId}::uuid
        WHERE sku.organization_id = ${organizationId}::uuid
          AND account.organization_id = ${organizationId}::uuid
          AND listing.organization_id = ${organizationId}::uuid
          AND import_run.organization_id = ${organizationId}::uuid
          AND listing.is_active = TRUE
          AND import_run.source_type = ${QUEUE_SOURCE_TYPE}
          AND import_run.status = 'completed'
          ${query.channelAccountId
            ? Prisma.sql`AND listing.channel_account_id = ${query.channelAccountId}::uuid`
            : Prisma.empty}
          ${search
            ? Prisma.sql`AND (
                listing.external_id ILIKE ${`%${search}%`}
                OR listing.channel_name ILIKE ${`%${search}%`}
                OR listing.display_name ILIKE ${`%${search}%`}
                OR sku.external_option_id ILIKE ${`%${search}%`}
                OR sku.seller_sku ILIKE ${`%${search}%`}
                OR sku.item_name ILIKE ${`%${search}%`}
                OR sku.barcode ILIKE ${`%${search}%`}
                OR sku.model_number ILIKE ${`%${search}%`}
              )`
            : Prisma.empty}
        GROUP BY sku.id, sku.updated_at, sku.mapping_status
      ),
      available AS (
        SELECT *
        FROM scoped
        ${query.hasBottleneck
          ? Prisma.sql`WHERE component_count > 0`
          : Prisma.empty}
      ),
      summary AS (
        SELECT
          COUNT(*)::int AS "summaryTotal",
          (COUNT(*) FILTER (WHERE sellable_stock > 0))::int AS "inStock",
          (COUNT(*) FILTER (WHERE sellable_stock = 0))::int AS "outOfStock",
          (COUNT(*) FILTER (
            WHERE component_count = 0 AND mapping_status <> 'needs_review'
          ))::int AS unmatched,
          (COUNT(*) FILTER (
            WHERE component_count = 0 AND mapping_status = 'needs_review'
          ))::int AS "needsReview"
        FROM available
      ),
      selected AS (
        SELECT *
        FROM available
        ${availabilityStatusSql(query.status)}
      )
      SELECT
        ARRAY(
          SELECT id
          FROM selected
          ORDER BY updated_at DESC, id ASC
          OFFSET ${(query.page - 1) * query.limit}
          LIMIT ${query.limit}
        ) AS "rowIds",
        (SELECT COUNT(*)::int FROM selected) AS total,
        summary."summaryTotal",
        summary."inStock",
        summary."outOfStock",
        summary.unmatched,
        summary."needsReview"
      FROM summary
    `);
    const meta = pageRows[0] ?? emptyAvailabilityPageMeta();
    const summary = {
      total: meta.summaryTotal,
      inStock: meta.inStock,
      outOfStock: meta.outOfStock,
      unmatched: meta.unmatched,
      needsReview: meta.needsReview,
    } satisfies ChannelSkuAvailabilityRepositorySummary;
    if (meta.rowIds.length === 0) {
      return { rows: [], total: meta.total, summary };
    }

    const rows = await this.prisma.channelListingOption.findMany({
      where: {
        ...queueWhere(organizationId, query.channelAccountId, search),
        id: { in: meta.rowIds },
      },
      select: mappingRowSelect(organizationId),
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    return {
      rows: meta.rowIds
        .map((id) => rowById.get(id))
        .filter((row): row is SelectedMappingRow => row !== undefined)
        .map(toMappingRow),
      total: meta.total,
      summary,
    };
  }

  async findByChannelSkuIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuMappingRow[]> {
    const distinctIds = [...new Set(ids)];
    if (distinctIds.length === 0) return [];
    const rows = await this.prisma.channelListingOption.findMany({
      where: {
        ...queueWhere(organizationId),
        id: { in: distinctIds },
      },
      select: mappingRowSelect(organizationId),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toMappingRow);
  }

  async findByListingIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuMappingRow[]> {
    const distinctIds = [...new Set(ids)];
    if (distinctIds.length === 0) return [];
    const rows = await this.prisma.channelListingOption.findMany({
      where: {
        ...queueWhere(organizationId),
        listingId: { in: distinctIds },
      },
      select: mappingRowSelect(organizationId),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toMappingRow);
  }

  async findOne(
    organizationId: string,
    channelSkuId: string,
  ): Promise<ChannelSkuMappingRow | null> {
    const row = await this.prisma.channelListingOption.findFirst({
      where: { ...queueWhere(organizationId), id: channelSkuId },
      select: mappingRowSelect(organizationId),
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
    const targetById = new Map<string, 'unmatched' | 'needs_review'>();
    for (const update of updates) {
      targetById.set(update.channelSkuId, update.mappingStatus);
    }
    const groups = (['unmatched', 'needs_review'] as const).map((mappingStatus) => ({
      mappingStatus,
      ids: [...targetById]
        .filter(([, target]) => target === mappingStatus)
        .map(([channelSkuId]) => channelSkuId),
    }));
    const operations = groups
      .filter(({ ids }) => ids.length > 0)
      .map(({ ids, mappingStatus }) => this.prisma.channelListingOption.updateMany({
        where: {
          ...queueWhere(organizationId),
          id: { in: ids },
          components: { none: { organizationId } },
          mappingStatus: { not: mappingStatus },
        },
        data: { mappingStatus },
      }));
    await this.prisma.$transaction(operations);
  }

  async applyAutomaticMatches(
    organizationId: string,
    updates: ChannelSkuAutomaticMatchUpdate[],
  ): Promise<{ applied: number; skippedConfirmed: number }> {
    const updateById = new Map(updates.map((update) => [update.channelSkuId, update]));
    const channelSkuIds = [...updateById.keys()];
    if (channelSkuIds.length === 0) return { applied: 0, skippedConfirmed: 0 };

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT sku.id
        FROM channel_listing_options AS sku
        INNER JOIN channel_listings AS listing
          ON listing.id = sku.listing_id
         AND listing.organization_id = sku.organization_id
        INNER JOIN channel_accounts AS account
          ON account.id = listing.channel_account_id
         AND account.organization_id = listing.organization_id
        INNER JOIN source_import_runs AS import_run
          ON import_run.id = sku.last_import_run_id
         AND import_run.organization_id = sku.organization_id
         AND import_run.channel_account_id = listing.channel_account_id
        WHERE sku.organization_id = ${organizationId}::uuid
          AND sku.id IN (${Prisma.join(
            channelSkuIds.map((id) => Prisma.sql`${id}::uuid`),
          )})
          AND listing.is_active = TRUE
          AND import_run.source_type = ${QUEUE_SOURCE_TYPE}
          AND import_run.status = 'completed'
        ORDER BY sku.id
        FOR UPDATE OF sku
      `);
      const lockedIds = locked.map(({ id }) => id);
      const confirmed = lockedIds.length === 0
        ? []
        : await tx.channelSkuComponent.findMany({
          where: { organizationId, channelSkuId: { in: lockedIds } },
          select: { channelSkuId: true },
          distinct: ['channelSkuId'],
        });
      const confirmedIds = new Set(confirmed.map(({ channelSkuId }) => channelSkuId));
      const eligible = lockedIds
        .filter((id) => !confirmedIds.has(id))
        .map((id) => updateById.get(id))
        .filter((update): update is ChannelSkuAutomaticMatchUpdate => update !== undefined);

      const matched = eligible.filter((update) => update.component !== undefined);
      if (matched.length > 0) {
        await tx.channelSkuComponent.createMany({
          data: matched.map((update) => ({
            organizationId,
            channelSkuId: update.channelSkuId,
            masterProductId: update.component!.masterProductId,
            quantity: update.component!.quantity,
            mappingSource: update.component!.mappingSource,
            createdBy: null,
          })),
        });
      }

      for (const mappingStatus of ['unmatched', 'needs_review', 'matched'] as const) {
        const ids = eligible
          .filter((update) => update.mappingStatus === mappingStatus)
          .map((update) => update.channelSkuId);
        if (ids.length === 0) continue;
        await tx.channelListingOption.updateMany({
          where: { organizationId, id: { in: ids } },
          data: { mappingStatus },
        });
      }

      return {
        applied: eligible.length,
        skippedConfirmed: confirmedIds.size,
      };
    }, REPLACEMENT_TRANSACTION_OPTIONS);
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
          INNER JOIN channel_accounts AS account
            ON account.id = listing.channel_account_id
           AND account.organization_id = listing.organization_id
          INNER JOIN source_import_runs AS import_run
            ON import_run.id = sku.last_import_run_id
           AND import_run.organization_id = sku.organization_id
           AND import_run.channel_account_id = listing.channel_account_id
          WHERE sku.id = ${input.channelSkuId}::uuid
            AND sku.organization_id = ${input.organizationId}::uuid
            AND listing.organization_id = ${input.organizationId}::uuid
            AND account.organization_id = ${input.organizationId}::uuid
            AND listing.is_active = TRUE
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
              masterProductId: component.masterProductId,
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
        throw new BadRequestException('MasterProduct component is missing or belongs to another organization');
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
        isActive: true,
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

function availabilityStatusSql(
  status: ChannelSkuAvailabilityRepositoryQuery['status'],
): Prisma.Sql {
  if (status === 'in_stock') return Prisma.sql`WHERE sellable_stock > 0`;
  if (status === 'out_of_stock') return Prisma.sql`WHERE sellable_stock = 0`;
  if (status === 'needs_review') {
    return Prisma.sql`WHERE component_count = 0 AND mapping_status = 'needs_review'`;
  }
  if (status === 'unmatched') {
    return Prisma.sql`WHERE component_count = 0 AND mapping_status <> 'needs_review'`;
  }
  return Prisma.empty;
}

function emptyAvailabilityPageMeta(): AvailabilityPageMetaRow {
  return {
    rowIds: [],
    total: 0,
    summaryTotal: 0,
    inStock: 0,
    outOfStock: 0,
    unmatched: 0,
    needsReview: 0,
  };
}

function contains(value: string) {
  return { contains: value, mode: 'insensitive' as const };
}

function toMappingRow(row: SelectedMappingRow): ChannelSkuMappingRow {
  return {
    channelAccount: row.listing.channelAccount,
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
    componentRefs: row.components.map((component) => {
      if (!component.masterProductId) {
        throw new Error(`ChannelSku component is missing MasterProduct identity for ${row.id}`);
      }
      return {
        masterProductId: component.masterProductId,
        quantity: component.quantity,
        mappingSource: component.mappingSource,
      };
    }),
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
  const registeredName = row.listing.channelName?.trim() || null;
  return {
    channelSkuId: row.id,
    sellerSku: row.sellerSku,
    modelNumber: row.modelNumber,
    barcode: row.barcode,
    registeredName,
    optionName: row.itemName,
    productNames: [registeredName, row.listing.displayName]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  };
}

function asMappingStatus(value: string): ChannelSkuMappingStatus {
  if (value === 'matched' || value === 'needs_review') return value;
  return 'unmatched';
}
