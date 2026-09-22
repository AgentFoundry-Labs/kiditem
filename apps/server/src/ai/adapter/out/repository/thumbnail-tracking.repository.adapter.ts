import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ThumbnailTrackingStatus } from '@kiditem/shared/ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateThumbnailTrackingInput,
  ThumbnailTrackingRepositoryPort,
  UpsertThumbnailTrackingDailySnapshotInput,
  UpdateThumbnailTrackingInput,
} from '../../../application/port/out/repository/thumbnail-tracking.repository.port';

/**
 * SQL for one status. Each predicate selects exactly the rows
 * deriveThumbnailTrackingStatus derives, and a PostgreSQL spec pins the two
 * together.
 */
function thumbnailTrackingStatusWhere(status: ThumbnailTrackingStatus): Prisma.ThumbnailTrackingWhereInput {
  switch (status) {
    case 'inconclusive':
      return { markedInconclusiveAt: { not: null } };
    case 'measured':
      return { markedInconclusiveAt: null, ctrBefore: { not: null }, ctrAfter: { not: null } };
    case 'tracking':
      return { markedInconclusiveAt: null, OR: [{ ctrBefore: null }, { ctrAfter: null }] };
  }
}

function trackingWhere(
  query: { status?: ThumbnailTrackingStatus },
  organizationId: string,
): Prisma.ThumbnailTrackingWhereInput {
  return query.status
    ? { AND: [{ organizationId }, thumbnailTrackingStatusWhere(query.status)] }
    : { organizationId };
}

function isDuplicateError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class ThumbnailTrackingRepositoryAdapter implements ThumbnailTrackingRepositoryPort {
  constructor(private readonly prisma: PrismaService, @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly listings: ChannelListingQueryPort) {}

  findTrackings(query: Parameters<ThumbnailTrackingRepositoryPort['findTrackings']>[0], organizationId: string) {
    return this.prisma.$transaction(async tx => {
      const rows = await tx.thumbnailTracking.findMany({ where: trackingWhere(query, organizationId), orderBy: { appliedAt: 'desc' }, skip: query.skip, take: query.take });
      return this.withListings(tx, rows, organizationId);
    });
  }

  private async withListings<T extends { listingId: string }>(tx: Prisma.TransactionClient, rows: T[], organizationId: string) {
    const facts = await this.listings.readDisplayFacts(ownerTransaction(tx), { organizationId, listingIds: [...new Set(rows.map(row => row.listingId))] });
    const byId = new Map(facts.map(row => [row.id, row]));
    return rows.map(row => {
      const listing = byId.get(row.listingId);
      if (!listing) throw new Error(`Missing organization-owned listing for thumbnail tracking ${row.listingId}.`);
      return { ...row, listing: { id: listing.id, displayName: listing.displayName, channelName: listing.channelName, externalId: listing.externalId } };
    });
  }

  countTrackings(query: Parameters<ThumbnailTrackingRepositoryPort['countTrackings']>[0], organizationId: string) {
    return this.prisma.thumbnailTracking.count({
      where: trackingWhere(query, organizationId),
    });
  }

  findChannelListingForWorkspace(contentWorkspaceId: string, organizationId: string) {
    return this.prisma.$transaction(async tx => {
      const workspace = await tx.contentWorkspace.findFirst({
        where: { id: contentWorkspaceId, organizationId, status: 'active', isDeleted: false, channelListingId: { not: null } },
        select: { channelListingId: true },
      });
      if (!workspace?.channelListingId) return null;
      const rows = await this.listings.readDisplayFacts(ownerTransaction(tx), { organizationId, listingIds: [workspace.channelListingId] });
      return rows[0] ? { id: rows[0].id } : null;
    });
  }

  async createTracking(input: CreateThumbnailTrackingInput) {
    const where = { organizationId: input.organizationId, listingId: input.listingId, generationId: input.generationId };
    try {
      return await this.prisma.$transaction(async tx => {
        const existing = await tx.thumbnailTracking.findFirst({ where });
        if (existing) return { created: false as const, row: (await this.withListings(tx, [existing], input.organizationId))[0] };
        await this.listings.assertOwnedIds(ownerTransaction(tx), { organizationId: input.organizationId, listingIds: [input.listingId] });
        const row = await tx.thumbnailTracking.create({ data: { ...where, originalGrade: input.originalGrade, originalScore: input.originalScore } });
        return { created: true as const, row: (await this.withListings(tx, [row], input.organizationId))[0] };
      });
    } catch (error) {
      if (!isDuplicateError(error)) throw error;
      return this.prisma.$transaction(async tx => {
        const row = await tx.thumbnailTracking.findFirst({ where });
        return { created: false as const, row: row ? (await this.withListings(tx, [row], input.organizationId))[0] : null };
      });
    }
  }

  async updateMetrics(input: UpdateThumbnailTrackingInput) {
    const where = { id: input.id, organizationId: input.organizationId };
    const { inconclusive, ...metrics } = input.metrics;
    const data: Prisma.ThumbnailTrackingUpdateManyMutationInput = {};
    if (metrics.ctrBefore !== undefined) data.ctrBefore = metrics.ctrBefore;
    if (metrics.ctrAfter !== undefined) data.ctrAfter = metrics.ctrAfter;
    if (metrics.reviewsBefore !== undefined) data.reviewsBefore = metrics.reviewsBefore;
    if (metrics.reviewsAfter !== undefined) data.reviewsAfter = metrics.reviewsAfter;
    if (metrics.salesBefore !== undefined) data.salesBefore = metrics.salesBefore;
    if (metrics.salesAfter !== undefined) data.salesAfter = metrics.salesAfter;
    if (inconclusive === false) data.markedInconclusiveAt = null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.thumbnailTracking.updateMany({ where, data });
      if (updated.count === 0) return null;
      if (inconclusive === true) {
        // A repeated mark keeps the time the operator first judged the tracking inconclusive.
        await tx.thumbnailTracking.updateMany({
          where: { ...where, markedInconclusiveAt: null },
          data: { markedInconclusiveAt: new Date() },
        });
      }
      const row = await tx.thumbnailTracking.findFirst({ where });
      return row ? (await this.withListings(tx, [row], input.organizationId))[0] : null;
    });
  }

  findTrackingForSnapshot(trackingId: string, organizationId: string) {
    return this.prisma.$transaction(async tx => {
      const row = await tx.thumbnailTracking.findFirst({ where: { id: trackingId, organizationId }, select: { id: true, salesBefore: true, listingId: true } });
      if (!row) return null;
      const listings = await this.listings.readDisplayFacts(ownerTransaction(tx), { organizationId, listingIds: [row.listingId] });
      const listing = listings[0];
      return { id: row.id, salesBefore: row.salesBefore, listing: listing ? { channelName: listing.channelName, displayName: listing.displayName, externalId: listing.externalId } : null };
    });
  }

  async upsertDailySnapshot(input: UpsertThumbnailTrackingDailySnapshotInput) {
    const upserted = await this.prisma.thumbnailTrackingDailySnapshot.upsert({
      where: {
        trackingId_capturedDate: {
          trackingId: input.trackingId,
          capturedDate: input.capturedDate,
        },
      },
      create: {
        organizationId: input.organizationId,
        trackingId: input.trackingId,
        capturedDate: input.capturedDate,
        unitsSold30d: input.unitsSold30d,
        unitsSold7d: input.unitsSold7d,
        revenueKrw: input.revenueKrw,
        reviewCount: input.reviewCount,
        ratingAvg: input.ratingAvg,
        rawCellTexts: input.rawCellTexts as Prisma.InputJsonValue,
        errorMessage: input.errorMessage,
      },
      update: {
        unitsSold30d: input.unitsSold30d,
        unitsSold7d: input.unitsSold7d,
        revenueKrw: input.revenueKrw,
        reviewCount: input.reviewCount,
        ratingAvg: input.ratingAvg,
        rawCellTexts: input.rawCellTexts as Prisma.InputJsonValue,
        errorMessage: input.errorMessage,
        capturedAt: new Date(),
      },
    });

    if (input.setSalesBefore && input.unitsSold30d !== null) {
      await this.prisma.thumbnailTracking.updateMany({
        where: { id: input.trackingId, organizationId: input.organizationId },
        data: { salesBefore: input.unitsSold30d },
      });
    }

    return upserted;
  }

  listSnapshots(trackingId: string, organizationId: string) {
    return this.prisma.thumbnailTrackingDailySnapshot.findMany({
      where: { trackingId, organizationId },
      orderBy: { capturedDate: 'asc' },
    });
  }

  findActiveTrackings(organizationId: string) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.prisma.thumbnailTracking.findMany({
      where: { organizationId, appliedAt: { gte: cutoff } },
      select: { id: true },
    });
  }
}
