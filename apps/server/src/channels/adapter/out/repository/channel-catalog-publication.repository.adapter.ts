import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PutCoupangCatalogChunkRequestSchema,
  type CoupangCatalogProductV1,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CATALOG_MEDIA_PUBLICATION_PORT,
  type CatalogMediaPublicationPort,
} from '../../../application/port/out/cross-domain/catalog-media-publication.port';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from '../../../../common/product-mapping-generation';
import {
  assembleCompleteSnapshot,
  hashCatalogChunkPayload,
  hashCatalogChunkReceipts,
  hashCoupangCatalogSnapshot,
} from '../../../application/service/channel-catalog-collection.service';
import {
  assertCatalogRunning,
  assertCatalogPublicationPlan,
  catalogAlertKey,
  catalogWhere,
  lockCatalogAccount,
  lockCatalogAttempt,
} from './channel-catalog-attempt-fence';
import { upsertChannelCatalogIdentities } from './channel-catalog-identity-upsert';
import type {
  ChannelCatalogPublicationPort,
  ChannelCatalogPublicationResult,
} from '../../../application/port/out/repository/channel-catalog-publication.port';

const CHANNEL = 'coupang';
const COLLECTION_SOURCE = 'coupang_wing_catalog_browser';
const SOURCE_TYPE = 'coupang_wing_catalog';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

type PublishInput = Parameters<ChannelCatalogPublicationPort['publish']>[0];

@Injectable()
export class ChannelCatalogPublicationRepositoryAdapter implements ChannelCatalogPublicationPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOG_MEDIA_PUBLICATION_PORT)
    private readonly media: CatalogMediaPublicationPort,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  publish(input: PublishInput): Promise<ChannelCatalogPublicationResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockProductMapping(tx, input.organizationId);
      await lockCatalogAccount(tx, input);
      const sourceRun = await lockCatalogAttempt(tx, {
        ...input,
        runId: input.attemptId,
      });
      if (sourceRun.status === 'completed') {
        const metadata = jsonRecord(sourceRun.qualityReport);
        if (
          metadata?.snapshotHash !== input.snapshotHash ||
          metadata?.chunkSetHash !== input.chunkSetHash
        ) {
          throw new ConflictException('Completed collection has a different final receipt');
        }
        const publication = jsonRecord(metadata?.publication);
        if (!publication) throw new ConflictException('Catalog publication receipt is missing');
        return {
          sourceImportRunId: sourceRun.id,
          duplicate: false,
          changes: numberRecord(publication.changes),
        };
      }
      assertCatalogRunning(sourceRun);
      const staging = await tx.channelScrapeRun.findFirst({
        where: {
          id: input.collectionRunId,
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          sourceImportRunId: sourceRun.id,
          source: COLLECTION_SOURCE,
        },
      });
      if (!staging) throw new NotFoundException('Catalog staging container not found');

      const chunks = await tx.channelScrapeChunk.findMany({
        where: {
          organizationId: input.organizationId,
          scrapeRunId: input.collectionRunId,
        },
        select: {
          id: true,
          kind: true,
          sequence: true,
          checksum: true,
          itemCount: true,
          payload: true,
        },
      });
      if (hashCatalogChunkReceipts(chunks) !== input.chunkSetHash) {
        throw new ConflictException('Staged catalog receipts changed before publication');
      }
      for (const chunk of chunks) {
        const parsed = PutCoupangCatalogChunkRequestSchema.safeParse(chunk);
        if (!parsed.success || hashCatalogChunkPayload(parsed.data.payload) !== chunk.checksum) {
          throw new ConflictException('Stored catalog chunk does not match its receipt');
        }
      }
      const { products } = assembleCompleteSnapshot(chunks);
      if (hashCoupangCatalogSnapshot(products) !== input.snapshotHash) {
        throw new ConflictException('Staged catalog snapshot changed before publication');
      }
      await assertCatalogPublicationPlan(tx, input, sourceRun.plan);

      const optionCount = products.reduce((sum, item) => sum + item.product.options.length, 0);
      const upserted = await upsertCoupangCatalogRows(tx, this.media, {
        organizationId: input.organizationId,
        userId: input.userId,
        channelAccountId: input.channelAccountId,
        products,
        lastImportRunId: sourceRun.id,
        publicationReference: { type: 'source_import_run', id: sourceRun.id },
      });

      const deactivatedOptions = await tx.channelListingOption.updateMany({
        where: {
          organizationId: input.organizationId,
          listing: { channelAccountId: input.channelAccountId },
          externalOptionId: { notIn: upserted.externalOptionIds },
          isActive: true,
        },
        data: { isActive: false, lastImportRunId: sourceRun.id },
      });
      const deactivatedListings = await tx.channelListing.updateMany({
        where: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          externalId: { notIn: upserted.externalProductIds },
          isActive: true,
        },
        data: { isActive: false, lastImportRunId: sourceRun.id },
      });

      if (
        upserted.mappingIdentityChanged ||
        deactivatedOptions.count > 0 ||
        deactivatedListings.count > 0
      ) {
        await advanceProductMappingGeneration(tx, input.organizationId);
      }

      const publicationSequence = await nextPublicationSequence(tx, input.organizationId);
      const result = {
        sourceImportRunId: sourceRun.id,
        duplicate: false,
        changes: {
          ...upserted.changes,
          deactivatedProductCount: deactivatedListings.count,
          deactivatedSkuCount: deactivatedOptions.count,
        },
      };
      assertCatalogRunning(sourceRun);
      const completed = await tx.sourceImportRun.updateMany({
        where: {
          ...catalogWhere(input),
          id: sourceRun.id,
          status: 'running',
          attemptToken: input.attemptToken,
          expiresAt: { gt: new Date() },
        },
        data: {
          status: 'completed',
          importedAt: new Date(),
          rowCount: optionCount,
          publicationSequence,
          contentChecksum: input.snapshotHash,
          qualityReport: {
            snapshotHash: input.snapshotHash,
            chunkSetHash: input.chunkSetHash,
            publication: result,
          },
        },
      });
      if (completed.count !== 1)
        throw new ConflictException('Catalog attempt lost its publication fence');
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: catalogAlertKey(input.channelAccountId),
        attemptId: sourceRun.id,
      });
      return result;
    }, TRANSACTION_OPTIONS);
  }
}

async function upsertCoupangCatalogRows(
  tx: Prisma.TransactionClient,
  mediaPublisher: CatalogMediaPublicationPort,
  input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    products: Array<{ ordinal: number; product: CoupangCatalogProductV1 }>;
    lastImportRunId: string;
    publicationReference: {
      type: 'source_import_run';
      id: string;
    };
  },
) {
  const identities = await upsertChannelCatalogIdentities(tx, {
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    products: input.products.map(({ product }) => product),
    lastImportRunId: input.lastImportRunId,
    rawSource: 'coupang_catalog_browser',
  });
  const media = await mediaPublisher.publishProviderMedia({
    transaction: tx,
    organizationId: input.organizationId,
    userId: input.userId,
    publicationReference: input.publicationReference,
    listings: input.products.map(({ product }) => ({
      listingId: identities.listingIds.get(product.externalProductId)!,
      channel: CHANNEL,
      displayName: product.displayName ?? product.registeredName ?? product.externalProductId,
      media: [...product.media, ...product.options.flatMap((option) => option.media)],
    })),
  });
  return {
    mappingIdentityChanged: identities.mappingIdentityChanged,
    externalProductIds: identities.externalProductIds,
    externalOptionIds: identities.externalOptionIds,
    changes: {
      ...identities.changes,
      deactivatedProductCount: 0,
      deactivatedSkuCount: 0,
      ...media,
    },
  };
}

async function nextPublicationSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<bigint> {
  const sequenceLockKey = `channel-catalog-sequence:${organizationId}:${SOURCE_TYPE}`;
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${sequenceLockKey}, 0))::text AS "lock"
  `;
  const rows = await tx.$queryRaw<Array<{ publicationSequence: bigint }>>`
    SELECT COALESCE(MAX(publication_sequence), 0::bigint) + 1 AS "publicationSequence"
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = ${SOURCE_TYPE}
  `;
  const sequence = rows[0]?.publicationSequence;
  if (sequence === undefined) {
    throw new ConflictException('Could not allocate catalog publication sequence');
  }
  return sequence;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberRecord(value: unknown): Record<string, number> {
  const record = jsonRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}
