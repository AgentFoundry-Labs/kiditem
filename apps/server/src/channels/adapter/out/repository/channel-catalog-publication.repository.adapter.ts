import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CoupangCatalogCollectionPlanSchema,
  PutCoupangCatalogChunkRequestSchema,
  type CoupangCatalogBasicProductV1,
  type CoupangCatalogCollectionQuality,
  type CoupangCatalogDetailProductV1,
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
import { lockProductMapping } from '../../../../products/transaction/product-mapping-lock';
import {
  CHANNELS_PRODUCT_MAPPING_GENERATION_PORT,
  type ChannelsProductMappingGenerationPort,
} from '../../../application/port/out/cross-domain/product-mapping-generation.port';
import { allocatePublicationSequence } from '../../../../common/publication-sequence';
import {
  assembleCompleteSnapshot,
  assembleFullDetailsSnapshot,
  assembleListingBasicsSnapshot,
} from '../../../domain/collection/catalog-chunk-snapshot';
import {
  hashCatalogStageSnapshot,
  hashCatalogChunkPayload,
  hashCatalogChunkReceipts,
  hashCoupangCatalogSnapshot,
} from '../../../domain/collection/catalog-collection-hash';
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
  planCatalogDetailTargets,
  withUnfinishedDetailTargets,
  type StoredCatalogListing,
} from '../../../domain/collection/catalog-detail-targets';
import { readListingRawSections } from '../../../domain/collection/channel-listing-raw-sections';
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

@Injectable()
export class ChannelCatalogPublicationRepositoryAdapter implements ChannelCatalogPublicationPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOG_MEDIA_PUBLICATION_PORT)
    private readonly media: CatalogMediaPublicationPort,
    private readonly alerts: SourceFailureAlerts,
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipes: ChannelOptionRecipePort,
    @Inject(CHANNELS_PRODUCT_MAPPING_GENERATION_PORT)
    private readonly productMapping: ChannelsProductMappingGenerationPort,
  ) {}

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
        // 청크는 스테이징에만 쌓였다: 리스팅 반영은 이 종료 트랜잭션에서 한 번에 한다 (KID-348).
        const userId = sourceRun.createdBy;
        if (!userId) throw new ConflictException('Catalog attempt creator is missing');
        const applied = await applyCatalogDetails(tx, this.media, this.recipes, {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          userId,
          sourceImportRunId: sourceRun.id,
          products: snapshot.products,
        });
        const plan = CoupangCatalogCollectionPlanSchema.parse(sourceRun.plan);
        optionCount = snapshot.products.reduce((sum, item) => sum + item.product.options.length, 0);
        result = {
          sourceImportRunId: sourceRun.id,
          duplicate: false,
          changes: applied.changes,
        };
        const quality: CoupangCatalogCollectionQuality = {
          detailTargets: snapshot.products.length,
          detailApplied: applied.appliedProductIds.length,
          detailUnchanged: applied.unchangedProductIds.length,
          deletedProducts: 0,
          unconfirmedAbsentProductIds: plan.absentProductIds ?? [],
        };
        qualityReport = {
          snapshotHash: input.snapshotHash,
          chunkSetHash: input.chunkSetHash,
          publication: result,
          quality,
          basicAttemptId: plan.basicAttemptId,
          basicManifestHash: plan.basicManifestHash,
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
        // 상세 대상은 이번 목록이 쓰기 전의 저장값과 비교해야 한다 (KID-348).
        const detailPlan = stage === 'basics'
          ? withUnfinishedDetailTargets(
              planCatalogDetailTargets({
                listed: products.map(({ product }) => ({
                  externalProductId: product.externalProductId,
                  modifiedOn: textValue(product.raw.modifiedOn),
                })),
                stored: await readStoredCatalogListings(tx, input),
              }),
              products.map(({ product }) => product.externalProductId),
              await unfinishedPreviousDetailTargets(tx, input, sourceRun.id),
            )
          : null;
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
        // 목록 단계는 사라진 상품을 끄지 않는다: 삭제 확인을 거친 상세 단계 종료만 바꾼다 (KID-348).
        const absence = stage === 'basics'
          ? { listings: 0, options: 0 }
          : await deactivateCatalogAbsence(tx, {
              organizationId: input.organizationId,
              channelAccountId: input.channelAccountId,
              sourceImportRunId: sourceRun.id,
              scope: { kind: 'account' },
              presentExternalProductIds: upserted.externalProductIds,
              presentExternalOptionIds: upserted.externalOptionIds,
            });
        if (upserted.mappingIdentityChanged || absence.listings > 0 || absence.options > 0) {
          await this.productMapping.advance(tx, input.organizationId);
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
                ...detailPlan,
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

/**
 * 상세 스냅샷을 리스팅·옵션에 반영한다. 같은 상세라 쓰지 않은 상품은 옵션 조합·미디어도 다시
 * 반영하지 않는다. 종료 트랜잭션 안에서만 부른다 (KID-348).
 */
async function applyCatalogDetails(
  tx: Prisma.TransactionClient,
  mediaPublisher: CatalogMediaPublicationPort,
  recipes: ChannelOptionRecipePort,
  input: {
    organizationId: string;
    channelAccountId: string;
    userId: string;
    sourceImportRunId: string;
    products: Array<{ ordinal: number; product: CoupangCatalogDetailProductV1 }>;
  },
) {
  if (input.products.length === 0) {
    return {
      appliedProductIds: [] as string[],
      unchangedProductIds: [] as string[],
      changes: { createdProductCount: 0, updatedProductCount: 0, createdSkuCount: 0, updatedSkuCount: 0,
        imageCount: 0, inactivatedImageCount: 0, deactivatedProductCount: 0, deactivatedSkuCount: 0 },
    };
  }
  const identities = await updateChannelCatalogDetails(tx, {
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    products: input.products.map(({ product }) => ({
      externalProductId: product.externalProductId,
      documents: product.documents,
      raw: product.raw,
      media: product.media,
      options: product.options,
    })),
    lastImportRunId: input.sourceImportRunId,
    rawSource: 'coupang_catalog_details',
  });
  const applied = new Set(identities.appliedProductIds);
  const appliedProducts = input.products.filter(({ product }) => applied.has(product.externalProductId));
  if (appliedProducts.length > 0) {
    await applyRegisteredOptionRecipes(ownerTransaction(tx), recipes, {
      organizationId: input.organizationId,
      channelListingIds: appliedProducts.map(({ product }) => identities.listingIds.get(product.externalProductId)!),
    });
  }
  // Detail and option media are independent observations.  Reconcile only
  // the role present in this response; publishing both through the old
  // broad `detail` scope would deactivate the other role when it was merely
  // omitted by Wing.  An empty role is intentionally left unchanged.
  const media = { imageCount: 0, inactivatedImageCount: 0 };
  for (const scope of ['detail', 'option'] as const) {
    const mediaListings = appliedProducts
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
    const published = await mediaPublisher.publishProviderMedia({
      transaction: tx,
      organizationId: input.organizationId,
      userId: input.userId,
      publicationReference: { type: 'source_import_run', id: input.sourceImportRunId },
      publicationScope: scope,
      listings: mediaListings,
    });
    media.imageCount += published.imageCount;
    media.inactivatedImageCount += published.inactivatedImageCount;
  }
  return {
    appliedProductIds: identities.appliedProductIds,
    unchangedProductIds: identities.unchangedProductIds,
    changes: {
      ...identities.changes,
      ...media,
      deactivatedProductCount: 0,
      deactivatedSkuCount: 0,
    },
  };
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

/**
 * 계정의 저장된 리스팅을 상세 대상 비교에 필요한 만큼만 읽는다. 상세 문서는 크므로 `detail`·
 * `detailDocuments`·`catalogExcel`은 빼고 읽고, 상세가 있는지만 따로 본다.
 */
async function readStoredCatalogListings(
  tx: Prisma.TransactionClient,
  scope: { organizationId: string; channelAccountId: string },
): Promise<StoredCatalogListing[]> {
  const rows = await tx.$queryRaw<Array<{ externalId: string; status: string | null; raw: unknown; hasDetail: boolean }>>`
    SELECT external_id AS "externalId",
           status,
           COALESCE(raw_json, '{}'::jsonb) - 'detail' - 'detailDocuments' - 'catalogExcel' AS raw,
           (COALESCE(raw_json, '{}'::jsonb) ? 'detail'
             OR jsonb_typeof(raw_json -> 'detailDocuments') = 'array') AS "hasDetail"
    FROM channel_listings
    WHERE organization_id = ${scope.organizationId}::uuid
      AND channel_account_id = ${scope.channelAccountId}::uuid
  `;
  return rows.map((row) => ({
    externalProductId: row.externalId,
    listModifiedOn: readListingRawSections(row.raw).list?.modifiedOn ?? null,
    hasDetail: row.hasDetail,
    status: row.status,
  }));
}

/**
 * 바로 앞 목록 단계가 계획한 상세 대상 가운데 그 details 자식이 완료로 끝나지 못한 것.
 * 자식이 없거나(넘겨받기 전 만료) 실패·중단이면 대상 전부가 아직 반영되지 않았다.
 */
async function unfinishedPreviousDetailTargets(
  tx: Prisma.TransactionClient,
  scope: { organizationId: string; channelAccountId: string },
  currentRunId: string,
): Promise<string[]> {
  const previous = await tx.sourceImportRun.findFirst({
    where: {
      ...catalogWhere(scope, 'basics'),
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
      id: { not: currentRunId },
    },
    orderBy: [{ publicationSequence: 'desc' }, { importedAt: 'desc' }],
    select: { id: true, plan: true, qualityReport: true },
  });
  const targets = jsonRecord(previous?.qualityReport)?.detailTargetProductIds;
  if (!previous || !Array.isArray(targets) || targets.length === 0) return [];
  const detailsIdempotencyKey = jsonRecord(previous.plan)?.detailsIdempotencyKey;
  const child = typeof detailsIdempotencyKey === 'string'
    ? await tx.sourceImportRun.findFirst({
        where: {
          ...catalogWhere(scope, 'details'),
          idempotencyKey: detailsIdempotencyKey,
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
        },
        select: { plan: true },
      })
    : null;
  if (child && jsonRecord(child.plan)?.rootAttemptId === previous.id) return [];
  return targets.filter((id): id is string => typeof id === 'string');
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
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

