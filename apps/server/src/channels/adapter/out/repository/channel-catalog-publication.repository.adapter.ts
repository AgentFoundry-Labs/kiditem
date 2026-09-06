import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  COUPANG_CATALOG_BROWSER_FILE_NAME,
  PutCoupangCatalogChunkRequestSchema,
  type CoupangCatalogProductV1,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CATALOG_MEDIA_PUBLICATION_PORT,
  type CatalogMediaPublicationPort,
} from '../../../application/port/out/cross-domain/catalog-media-publication.port';
import { resolveCoupangVendorId } from '../../../domain/coupang-account-identity';
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

type LockedCollectionRun = {
  id: string;
  status: string;
  sourceImportRunId: string | null;
  metaJson: Prisma.JsonValue | null;
};

@Injectable()
export class ChannelCatalogPublicationRepositoryAdapter implements ChannelCatalogPublicationPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOG_MEDIA_PUBLICATION_PORT)
    private readonly media: CatalogMediaPublicationPort,
  ) {}

  publish(input: PublishInput): Promise<ChannelCatalogPublicationResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockProductMapping(tx, input.organizationId);
      await lockAccount(tx, input.organizationId, input.channelAccountId);
      const collectionRun = await lockCollectionRun(tx, input);
      if (collectionRun.status === 'completed') {
        const metadata = jsonRecord(collectionRun.metaJson);
        if (
          metadata?.snapshotHash !== input.snapshotHash ||
          metadata?.chunkSetHash !== input.chunkSetHash
        ) {
          throw new ConflictException('Completed collection has a different final receipt');
        }
        return completedCollectionResult(collectionRun);
      }
      if (collectionRun.status !== 'running') {
        throw new ConflictException(`Cannot publish a collection that is ${collectionRun.status}`);
      }

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
      await assertActiveCoupangAccount(tx, input.organizationId, input.channelAccountId);

      const optionCount = products.reduce((sum, item) => sum + item.product.options.length, 0);
      const sourceRun = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          fileName: COUPANG_CATALOG_BROWSER_FILE_NAME,
          fileHash: null,
          contentChecksum: input.snapshotHash,
          status: 'running',
          rowCount: optionCount,
          createdBy: input.userId,
        },
        select: { id: true },
      });

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
      await tx.sourceImportRun.update({
        where: { id: sourceRun.id, organizationId: input.organizationId },
        data: {
          status: 'completed',
          importedAt: new Date(),
          publicationSequence,
        },
      });
      const result = {
        sourceImportRunId: sourceRun.id,
        duplicate: false,
        changes: {
          ...upserted.changes,
          deactivatedProductCount: deactivatedListings.count,
          deactivatedSkuCount: deactivatedOptions.count,
        },
      };
      await completeCollectionRun(tx, input, collectionRun.metaJson, result);
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

async function lockAccount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelAccountId: string,
): Promise<void> {
  const accountLockKey = `channel-catalog-publication:${organizationId}:${SOURCE_TYPE}:${channelAccountId}`;
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${accountLockKey}, 0))::text AS "lock"
  `;
}

async function lockCollectionRun(
  tx: Prisma.TransactionClient,
  input: Pick<PublishInput, 'organizationId' | 'channelAccountId' | 'collectionRunId'>,
): Promise<LockedCollectionRun> {
  const rows = await tx.$queryRaw<LockedCollectionRun[]>`
    SELECT
      id,
      status,
      source_import_run_id AS "sourceImportRunId",
      meta_json AS "metaJson"
    FROM channel_scrape_runs
    WHERE id = ${input.collectionRunId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND channel_account_id = ${input.channelAccountId}::uuid
      AND channel = ${CHANNEL}
      AND source = ${COLLECTION_SOURCE}
    FOR UPDATE
  `;
  const run = rows[0];
  if (!run) throw new NotFoundException('Coupang catalog collection run not found');
  return run;
}

async function assertActiveCoupangAccount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelAccountId: string,
): Promise<void> {
  const account = await tx.channelAccount.findFirst({
    where: { id: channelAccountId, organizationId, status: 'active' },
    select: { channel: true, externalAccountId: true, vendorId: true },
  });
  if (!account) throw new NotFoundException('Active channel account not found');
  if (account.channel !== CHANNEL) {
    throw new BadRequestException('Coupang catalog publication requires channel=coupang');
  }
  assertCanonicalAccount(account);
}

async function completeCollectionRun(
  tx: Prisma.TransactionClient,
  input: PublishInput,
  existingMeta: Prisma.JsonValue | null,
  result: ChannelCatalogPublicationResult,
): Promise<void> {
  const metadata = jsonRecord(existingMeta) ?? {};
  const completed = await tx.channelScrapeRun.updateMany({
    where: {
      id: input.collectionRunId,
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      channel: CHANNEL,
      source: COLLECTION_SOURCE,
      status: 'running',
    },
    data: {
      status: 'completed',
      sourceImportRunId: result.sourceImportRunId,
      finishedAt: new Date(),
      metaJson: {
        ...metadata,
        phase: 'finished',
        snapshotHash: input.snapshotHash,
        chunkSetHash: input.chunkSetHash,
        publication: {
          sourceImportRunId: result.sourceImportRunId,
          duplicate: result.duplicate,
          changes: result.changes,
        },
      } as Prisma.InputJsonValue,
      errorJson: Prisma.DbNull,
    },
  });
  if (completed.count !== 1) {
    throw new ConflictException('Coupang catalog collection lost its publication fence');
  }
}

function completedCollectionResult(run: LockedCollectionRun): ChannelCatalogPublicationResult {
  const publication = jsonRecord(jsonRecord(run.metaJson)?.publication);
  if (!run.sourceImportRunId || !publication) {
    throw new ConflictException('Completed collection is missing publication metadata');
  }
  return {
    sourceImportRunId: run.sourceImportRunId,
    duplicate: publication.duplicate === true,
    changes: numberRecord(publication.changes),
  };
}

function assertCanonicalAccount(account: {
  externalAccountId: string | null;
  vendorId: string | null;
}): void {
  if (!resolveCoupangVendorId(account)) {
    throw new BadRequestException('Coupang account requires a vendor identity');
  }
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
