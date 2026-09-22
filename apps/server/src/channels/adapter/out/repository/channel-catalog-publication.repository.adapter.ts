import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CoupangCatalogFullDetailsChunkV1Schema,
  CoupangCatalogDiscoveryPageV1Schema,
  PutCoupangCatalogChunkRequestSchema,
  type CoupangCatalogBasicProductV1,
  type CoupangCatalogDetailProductV1,
  type CoupangCatalogFullDetailsChunkV1,
  type CoupangCatalogProductV1,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS, SOURCE_IMPORT_RUN_RUNNING_STATUS } from '@kiditem/shared/source-import';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import {
  CATALOG_MEDIA_PUBLICATION_PORT,
  type CatalogMediaPublicationPort,
} from '../../../application/port/out/cross-domain/catalog-media-publication.port';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from '../../../../common/product-mapping-generation';
import { allocatePublicationSequence } from '../../../../common/publication-sequence';
import {
  assembleCompleteSnapshot,
  assembleFullDetailsSnapshot,
  assembleListingBasicsSnapshot,
  hashCatalogStageSnapshot,
  hashCatalogChunkPayload,
  hashCatalogChunkReceipts,
  hashCoupangCatalogSnapshot,
} from '../../../application/service/collection/channel-catalog-collection.service';
import {
  assertCatalogWritable,
  assertCatalogPublicationPlan,
  catalogAlertKey,
  catalogSourceForStage,
  catalogWhere,
  lockCatalogAccount,
  lockCatalogAttempt,
} from './channel-catalog-attempt-fence';
import { deactivateCatalogAbsence } from './catalog-absence';
import {
  updateChannelCatalogDetails,
  upsertChannelCatalogBasics,
  upsertChannelCatalogIdentities,
} from './channel-catalog-identity-upsert';
import {
  CHANNEL_OPTION_RECIPE_PORT,
  type ChannelOptionRecipePort,
} from '../../../application/port/in/channel-option-recipe.port';
import { applyRegisteredOptionRecipes } from '../persistence/registered-option-recipes';
import type {
  ChannelCatalogPublicationPort,
  ChannelCatalogPublicationResult,
} from '../../../application/port/out/repository/channel-catalog-publication.port';

const channelIntegrity = new ChannelIntegrityAdapter();

const CHANNEL = 'coupang';
const COLLECTION_SOURCE = 'coupang_wing_catalog_browser';
const SOURCE_TYPE = 'coupang_wing_catalog';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

type PublishInput = Parameters<ChannelCatalogPublicationPort['publish']>[0];
type DetailChunkInput = Parameters<ChannelCatalogPublicationPort['publishDetailChunk']>[0];

@Injectable()
export class ChannelCatalogPublicationRepositoryAdapter implements ChannelCatalogPublicationPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOG_MEDIA_PUBLICATION_PORT)
    private readonly media: CatalogMediaPublicationPort,
    private readonly alerts: SourceFailureAlerts,
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipes: ChannelOptionRecipePort,
  ) {}

  async publishDetailChunk(input: DetailChunkInput): Promise<ChannelCatalogPublicationResult> {
    const tx = transactionClient(input.transaction);
    if (input.chunk.kind !== 'full_details') {
      throw new ConflictException('Only full-details chunks can be published incrementally');
    }
    const sourceRun = await lockCatalogAttempt(tx, {
      ...input,
      runId: input.attemptId,
      stage: 'details',
    });
    assertCatalogWritable(sourceRun);
    const userId = sourceRun.createdBy;
    if (!userId) throw new ConflictException('Catalog attempt creator is missing');
    if (input.chunk.publishedAt && jsonRecord(input.chunk.publicationJson)) {
      const receipt = jsonRecord(input.chunk.publicationJson)!;
      return {
        sourceImportRunId: sourceRun.id,
        duplicate: true,
        changes: numberRecord(receipt.changes),
      };
    }
    const request = PutCoupangCatalogChunkRequestSchema.safeParse({
      kind: input.chunk.kind,
      sequence: input.chunk.sequence,
      checksum: input.chunk.checksum,
      itemCount: input.chunk.itemCount,
      payload: input.chunk.payload,
    });
    if (!request.success || request.data.kind !== 'full_details') {
      throw new ConflictException('Stored full-details chunk is invalid');
    }
    if (hashCatalogChunkPayload(request.data.payload, channelIntegrity.sha256) !== input.chunk.checksum) {
      throw new ConflictException('Stored full-details chunk does not match its receipt');
    }
    await assertCatalogPublicationPlan(tx, input, sourceRun.plan);
    const payload = CoupangCatalogFullDetailsChunkV1Schema.parse(request.data.payload);
    await assertDetailChunkAgainstDiscovery(tx, input, sourceRun.plan, payload.products);
    const identities = await updateChannelCatalogDetails(tx, {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      products: payload.products.map(({ product }) => ({
        externalProductId: product.externalProductId,
        documents: product.documents,
        raw: product.raw,
        options: product.options,
      })),
      lastImportRunId: sourceRun.id,
      rawSource: 'coupang_catalog_details',
    });
    await applyRegisteredOptionRecipes(ownerTransaction(tx), this.recipes, {
      organizationId: input.organizationId,
      channelListingIds: [...identities.listingIds.values()],
    });
    // Detail and option media are independent observations.  Reconcile only
    // the role present in this response; publishing both through the old
    // broad `detail` scope would deactivate the other role when it was merely
    // omitted by Wing.  An empty role is intentionally left unchanged.
    const media = { imageCount: 0, inactivatedImageCount: 0 };
    for (const scope of ['detail', 'option'] as const) {
      const mediaListings = payload.products
        .map(({ product }) => {
          const listingId = identities.listingIds.get(product.externalProductId)!;
          return {
            listingId,
            channel: CHANNEL,
            displayName: product.externalProductId,
            optionIdentityRemaps: identities.identityRemaps
              .filter((remap) => remap.listingId === listingId)
              .map(({ oldExternalOptionId, newExternalOptionId }) => ({
                oldExternalOptionId,
                newExternalOptionId,
              })),
            media: product.media
              .filter((item) => item.role === scope)
              .map((item) => ({
                sourceUrl: item.sourceUrl,
                role: item.role,
                sortOrder: item.sortOrder,
                externalOptionId: item.externalOptionId ??
                  (item.externalOptionIds?.length === 1 ? item.externalOptionIds[0]! : null),
                ...(item.externalOptionIds ? { externalOptionIds: item.externalOptionIds } : {}),
              })),
          };
        })
        .filter((listing) => listing.media.length > 0);
      if (mediaListings.length === 0) continue;
      const published = await this.media.publishProviderMedia({
        transaction: tx,
        organizationId: input.organizationId,
        userId,
        publicationReference: { type: 'source_import_run', id: sourceRun.id },
        publicationScope: scope,
        listings: mediaListings,
      });
      media.imageCount += published.imageCount;
      media.inactivatedImageCount += published.inactivatedImageCount;
    }
    const result: ChannelCatalogPublicationResult = {
      sourceImportRunId: sourceRun.id,
      duplicate: false,
      changes: {
        ...identities.changes,
        ...media,
        deactivatedProductCount: 0,
        deactivatedSkuCount: 0,
      },
    };
    const marked = await tx.channelScrapeChunk.updateMany({
      where: {
        id: input.chunk.id,
        organizationId: input.organizationId,
        scrapeRunId: input.collectionRunId,
        kind: 'full_details',
        checksum: input.chunk.checksum,
        publishedAt: null,
      },
      data: {
        publishedAt: new Date(),
        publicationJson: {
          ...result,
          projection: compactChunkProjection(payload),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    if (marked.count !== 1) {
      throw new ConflictException('Detail chunk publication receipt fence lost');
    }
    return result;
  }

  publish(input: PublishInput): Promise<ChannelCatalogPublicationResult> {
    return this.prisma.$transaction(async (tx) => {
      const stage = input.stage ?? 'full';
      await lockProductMapping(tx, input.organizationId);
      await lockCatalogAccount(tx, input);
      const sourceRun = await lockCatalogAttempt(tx, {
        ...input,
        runId: input.attemptId,
        stage,
      });
      if (sourceRun.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS) {
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
      assertCatalogWritable(sourceRun);
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
          publishedAt: true,
          publicationJson: true,
        },
      });
      if (hashCatalogChunkReceipts(chunks, channelIntegrity.sha256) !== input.chunkSetHash) {
        throw new ConflictException('Staged catalog receipts changed before publication');
      }
      for (const chunk of chunks) {
        const parsed = PutCoupangCatalogChunkRequestSchema.safeParse(chunk);
        if (!parsed.success || hashCatalogChunkPayload(parsed.data.payload, channelIntegrity.sha256) !== chunk.checksum) {
          throw new ConflictException('Stored catalog chunk does not match its receipt');
        }
      }
      await assertCatalogPublicationPlan(tx, input, sourceRun.plan);
      let result: ChannelCatalogPublicationResult;
      let optionCount = 0;
      let qualityReport: Record<string, unknown>;
      if (stage === 'details') {
        const snapshot = assembleFullDetailsSnapshot(chunks, sourceRun.plan);
        if (hashCatalogStageSnapshot(snapshot.products, channelIntegrity.sha256) !== input.snapshotHash) {
          throw new ConflictException('Staged detail snapshot changed before publication');
        }
        const detailChunks = chunks.filter((chunk) => chunk.kind === 'full_details');
        if (detailChunks.some((chunk) => !chunk.publishedAt)) {
          throw new ConflictException('A detail chunk was not atomically published');
        }
        const detailListings = await tx.channelListing.findMany({
          where: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            externalId: {
              in: snapshot.products.map((item) => item.product.externalProductId),
            },
          },
          select: { id: true },
        });
        await applyRegisteredOptionRecipes(ownerTransaction(tx), this.recipes, {
          organizationId: input.organizationId,
          channelListingIds: detailListings.map(({ id }) => id),
        });
        optionCount = snapshot.products.reduce((sum, item) => sum + item.product.options.length, 0);
        result = {
          sourceImportRunId: sourceRun.id,
          duplicate: false,
          changes: sumDetailChunkChanges(detailChunks),
        };
        qualityReport = {
          snapshotHash: input.snapshotHash,
          chunkSetHash: input.chunkSetHash,
          publication: result,
          basicAttemptId: jsonRecord(sourceRun.plan)?.basicAttemptId,
          basicManifestHash: jsonRecord(sourceRun.plan)?.basicManifestHash,
        };
      } else {
        const snapshot = stage === 'basics'
          ? assembleListingBasicsSnapshot(chunks)
          : assembleCompleteSnapshot(chunks);
        const products = snapshot.products;
        const snapshotHash = stage === 'basics'
          ? hashCatalogStageSnapshot(products, channelIntegrity.sha256)
          : hashCoupangCatalogSnapshot(products, channelIntegrity.sha256);
        if (snapshotHash !== input.snapshotHash) {
          throw new ConflictException('Staged catalog snapshot changed before publication');
        }
        optionCount = products.reduce((sum, item) => sum + item.product.options.length, 0);
        const upserted = stage === 'basics'
          ? await upsertCoupangCatalogBasicsRows(tx, this.media, {
              organizationId: input.organizationId,
              userId: input.userId,
              channelAccountId: input.channelAccountId,
              products,
              lastImportRunId: sourceRun.id,
              publicationReference: { type: 'source_import_run', id: sourceRun.id },
            })
          : await upsertCoupangCatalogRows(tx, this.media, {
              organizationId: input.organizationId,
              userId: input.userId,
              channelAccountId: input.channelAccountId,
              products,
              lastImportRunId: sourceRun.id,
              publicationReference: { type: 'source_import_run', id: sourceRun.id },
            });
        await applyRegisteredOptionRecipes(ownerTransaction(tx), this.recipes, {
          organizationId: input.organizationId,
          channelListingIds: upserted.listingIds,
        });
        const absence = await deactivateCatalogAbsence(tx, {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          sourceImportRunId: sourceRun.id,
          // 윙 수집은 계정의 상품 목록 전체를 한 번에 본다.
          scope: { kind: 'account' },
          presentExternalProductIds: upserted.externalProductIds,
          presentExternalOptionIds: upserted.externalOptionIds,
        });
        if (upserted.mappingIdentityChanged || absence.listings > 0 || absence.options > 0) {
          await advanceProductMappingGeneration(tx, input.organizationId);
        }
        result = {
          sourceImportRunId: sourceRun.id,
          duplicate: false,
          changes: {
            ...upserted.changes,
            deactivatedProductCount: absence.listings,
            deactivatedSkuCount: absence.options,
          },
        };
        qualityReport = {
          snapshotHash: input.snapshotHash,
          chunkSetHash: input.chunkSetHash,
          publication: result,
          ...(stage === 'basics'
            ? {
                basicManifestHash: hashCatalogChunkPayload(snapshot.manifest, channelIntegrity.sha256),
                productIds: products.map((item) => item.product.externalProductId),
              }
            : {}),
        };
      }
      const publicationSequence = await allocatePublicationSequence(
        tx,
        input.organizationId,
        catalogSourceForStage(stage),
      );
      assertCatalogWritable(sourceRun);
      const completed = await tx.sourceImportRun.updateMany({
        where: {
          ...catalogWhere(input, stage),
          id: sourceRun.id,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          attemptToken: input.attemptToken,
          expiresAt: { gt: new Date() },
        },
        data: {
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          importedAt: new Date(),
          rowCount: optionCount,
          publicationSequence,
          contentChecksum: input.snapshotHash,
          qualityReport: qualityReport as unknown as Prisma.InputJsonValue,
        },
      });
      if (completed.count !== 1)
        throw new ConflictException('Catalog attempt lost its publication fence');
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: catalogAlertKey(input.channelAccountId, stage),
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
    // 윙 브라우저 수집은 옵션 칸을 모두 읽는다 (CoupangCatalogOptionV1).
    unobservedOptionFields: [],
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
    listingIds: [...identities.listingIds.values()],
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

async function upsertCoupangCatalogBasicsRows(
  tx: Prisma.TransactionClient,
  mediaPublisher: CatalogMediaPublicationPort,
  input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    products: Array<{ ordinal: number; product: CoupangCatalogBasicProductV1 }>;
    lastImportRunId: string;
    publicationReference: {
      type: 'source_import_run';
      id: string;
    };
  },
) {
  const identities = await upsertChannelCatalogBasics(tx, {
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    products: input.products.map(({ product }) => product),
    lastImportRunId: input.lastImportRunId,
    rawSource: 'coupang_catalog_basics',
  });
  const media = await mediaPublisher.publishProviderMedia({
    transaction: tx,
    organizationId: input.organizationId,
    userId: input.userId,
    publicationReference: input.publicationReference,
    publicationScope: 'basic',
    listings: input.products.map(({ product }) => ({
      listingId: identities.listingIds.get(product.externalProductId)!,
      channel: CHANNEL,
      displayName: product.displayName ?? product.registeredName ?? product.externalProductId,
      optionIdentityRemaps: identities.identityRemaps
        .filter((remap) => remap.listingId === identities.listingIds.get(product.externalProductId))
        .map(({ oldExternalOptionId, newExternalOptionId }) => ({
          oldExternalOptionId,
          newExternalOptionId,
        })),
      media: product.media,
    })),
  });
  return {
    listingIds: [...identities.listingIds.values()],
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

async function assertDetailChunkAgainstDiscovery(
  tx: Prisma.TransactionClient,
  input: DetailChunkInput,
  rawPlan: unknown,
  products: Array<{ ordinal: number; product: CoupangCatalogDetailProductV1 }>,
): Promise<void> {
  const plan = jsonRecord(rawPlan);
  const allowedIds = new Set(
    Array.isArray(plan?.basicProductIds)
      ? plan.basicProductIds.filter((value): value is string => typeof value === 'string')
      : [],
  );
  const chunks = await tx.channelScrapeChunk.findMany({
    where: {
      organizationId: input.organizationId,
      scrapeRunId: input.collectionRunId,
      kind: 'discovery_page',
    },
    select: { payload: true },
  });
  const discovered = new Map<number, string>();
  for (const chunk of chunks) {
    const parsed = CoupangCatalogDiscoveryPageV1Schema.safeParse(chunk.payload);
    if (!parsed.success) {
      throw new ConflictException('Stored discovery chunk is invalid');
    }
    for (const item of parsed.data.items) {
      const previous = discovered.get(item.ordinal);
      if (previous && previous !== item.externalProductId) {
        throw new ConflictException('Discovery identity changed during detail publication');
      }
      discovered.set(item.ordinal, item.externalProductId);
    }
  }
  for (const item of products) {
    if (
      (allowedIds.size > 0 && !allowedIds.has(item.product.externalProductId))
      || discovered.get(item.ordinal) !== item.product.externalProductId
    ) {
      throw new ConflictException(`Detail product does not match its completed basics basis: ${item.product.externalProductId}`);
    }
  }
}

function sumDetailChunkChanges(
  chunks: Array<{ publicationJson?: unknown }>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const chunk of chunks) {
    const publication = jsonRecord(chunk.publicationJson);
    const changes = numberRecord(publication?.changes);
    for (const [key, value] of Object.entries(changes)) totals[key] = (totals[key] ?? 0) + value;
  }
  return totals;
}

function transactionClient(value: unknown): Prisma.TransactionClient {
  if (!value || typeof value !== 'object' || !('channelListing' in value)) {
    throw new ConflictException('Catalog publication requires a Prisma transaction');
  }
  return value as Prisma.TransactionClient;
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

function compactChunkProjection(
  payload: CoupangCatalogFullDetailsChunkV1,
): Record<string, unknown> {
  return {
    kind: payload.kind,
    startOrdinal: payload.startOrdinal,
    products: payload.products.map(({ ordinal, product }) => ({
      ordinal,
      externalProductId: product.externalProductId,
      optionCount: product.options.length,
      mediaCount: product.media.length,
    })),
  };
}
