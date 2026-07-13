import { randomUUID } from 'node:crypto';
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
  type CoupangCatalogMediaV1,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CATALOG_MEDIA_PUBLICATION_PORT,
  type CatalogMediaPublicationPort,
} from '../../../application/port/out/cross-domain/catalog-media-publication.port';
import type {
  ChannelCatalogPublicationPort,
  ChannelCatalogPublicationResult,
} from '../../../application/port/out/repository/channel-catalog-publication.port';

const CHANNEL = 'coupang';
const COLLECTION_SOURCE = 'coupang_wing_catalog_browser';
const SOURCE_TYPE = 'coupang_wing_catalog';
const UPSERT_BATCH_SIZE = 500;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

type PublishInput = Parameters<ChannelCatalogPublicationPort['publish']>[0];

type LockedCollectionRun = {
  id: string;
  status: string;
  sourceImportRunId: string | null;
  metaJson: Prisma.JsonValue | null;
};

@Injectable()
export class ChannelCatalogPublicationRepositoryAdapter
implements ChannelCatalogPublicationPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOG_MEDIA_PUBLICATION_PORT)
    private readonly media: CatalogMediaPublicationPort,
  ) {}

  publish(input: PublishInput): Promise<ChannelCatalogPublicationResult> {
    return this.prisma.$transaction(async (tx) => {
      const accountLockKey =
        `channel-catalog-publication:${input.organizationId}:${SOURCE_TYPE}:${input.channelAccountId}`;
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${accountLockKey}, 0))::text AS "lock"
      `;

      const lockedRows = await tx.$queryRaw<LockedCollectionRun[]>`
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
      const collectionRun = lockedRows[0];
      if (!collectionRun) {
        throw new NotFoundException('Coupang catalog collection run not found');
      }
      if (collectionRun.status === 'completed') {
        return completedCollectionResult(collectionRun);
      }
      if (collectionRun.status !== 'running') {
        throw new ConflictException(
          `Cannot publish a collection that is ${collectionRun.status}`,
        );
      }

      const account = await tx.channelAccount.findFirst({
        where: {
          id: input.channelAccountId,
          organizationId: input.organizationId,
          status: 'active',
        },
        select: { channel: true, externalAccountId: true, vendorId: true },
      });
      if (!account) throw new NotFoundException('Active channel account not found');
      if (account.channel !== CHANNEL) {
        throw new BadRequestException('Coupang catalog publication requires channel=coupang');
      }
      assertCanonicalAccount(account);

      const duplicate = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          fileHash: input.snapshotHash,
          status: 'completed',
        },
        select: { id: true },
      });
      if (duplicate) {
        const result = {
          sourceImportRunId: duplicate.id,
          duplicate: true,
          changes: zeroChanges(),
        };
        await completeCollectionRun(tx, input, collectionRun.metaJson, result);
        return result;
      }

      const optionCount = input.products.reduce(
        (sum, item) => sum + item.product.options.length,
        0,
      );
      const sourceRun = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          fileName: COUPANG_CATALOG_BROWSER_FILE_NAME,
          fileHash: input.snapshotHash,
          status: 'running',
          rowCount: optionCount,
          createdBy: input.userId,
        },
        select: { id: true },
      });

      const externalProductIds = input.products.map(
        (item) => item.product.externalProductId,
      );
      const externalOptionIds = input.products.flatMap((item) =>
        item.product.options.map((option) => option.externalOptionId),
      );
      const [existingListings, existingOptions] = await Promise.all([
        tx.channelListing.findMany({
          where: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            externalId: { in: externalProductIds },
          },
          select: { id: true, externalId: true },
        }),
        tx.channelListingOption.findMany({
          where: {
            organizationId: input.organizationId,
            externalOptionId: { in: externalOptionIds },
            listing: { channelAccountId: input.channelAccountId },
          },
          select: {
            id: true,
            externalOptionId: true,
            listing: { select: { externalId: true } },
          },
        }),
      ]);
      const existingListingIds = new Set(
        existingListings.map((listing) => listing.externalId),
      );
      const existingOptionIds = new Set(
        existingOptions.map((option) => option.externalOptionId),
      );
      const expectedOptionOwner = new Map<string, string>();
      for (const item of input.products) {
        for (const option of item.product.options) {
          expectedOptionOwner.set(option.externalOptionId, item.product.externalProductId);
        }
      }
      for (const option of existingOptions) {
        if (expectedOptionOwner.get(option.externalOptionId) !== option.listing.externalId) {
          throw new ConflictException(
            `Coupang option ${option.externalOptionId} cannot move to another parent`,
          );
        }
      }

      for (let offset = 0; offset < input.products.length; offset += UPSERT_BATCH_SIZE) {
        const batch = input.products.slice(offset, offset + UPSERT_BATCH_SIZE);
        const payload = JSON.stringify(batch.map(({ product }) => ({
          id: randomUUID(),
          ...product,
        })));
        await tx.$executeRaw`
          INSERT INTO channel_listings (
            id, organization_id, channel_account_id, external_id,
            channel_name, display_name, category, manufacturer, brand,
            status, raw_json, last_import_run_id, is_active, created_at, updated_at
          )
          SELECT
            (record->>'id')::uuid,
            ${input.organizationId}::uuid,
            ${input.channelAccountId}::uuid,
            record->>'externalProductId',
            record->>'registeredName',
            record->>'displayName',
            record->>'category',
            record->>'manufacturer',
            record->>'brand',
            record->>'productStatus',
            record->'raw',
            ${sourceRun.id}::uuid,
            TRUE,
            NOW(),
            NOW()
          FROM jsonb_array_elements(${payload}::jsonb) AS record
          ON CONFLICT (organization_id, channel_account_id, external_id)
          DO UPDATE SET
            channel_name = EXCLUDED.channel_name,
            display_name = EXCLUDED.display_name,
            category = EXCLUDED.category,
            manufacturer = EXCLUDED.manufacturer,
            brand = EXCLUDED.brand,
            status = EXCLUDED.status,
            raw_json = EXCLUDED.raw_json,
            last_import_run_id = EXCLUDED.last_import_run_id,
            is_active = TRUE,
            updated_at = NOW()
        `;
      }

      const persistedListings = await tx.channelListing.findMany({
        where: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          externalId: { in: externalProductIds },
        },
        select: { id: true, externalId: true },
      });
      if (persistedListings.length !== input.products.length) {
        throw new ConflictException('Not every Coupang parent listing was persisted');
      }
      const listingIds = new Map(
        persistedListings.map((listing) => [listing.externalId, listing.id]),
      );

      const options = input.products.flatMap(({ product }) => {
        const listingId = listingIds.get(product.externalProductId);
        if (!listingId) throw new ConflictException('Published listing ID is missing');
        return product.options.map((option) => ({
          id: randomUUID(),
          listingId,
          ...option,
          attributesJson: option.attributes,
          rawJson: {
            ...option.raw,
            source: 'coupang_catalog_browser',
            externalProductId: product.externalProductId,
          },
        }));
      });
      for (let offset = 0; offset < options.length; offset += UPSERT_BATCH_SIZE) {
        const payload = JSON.stringify(options.slice(offset, offset + UPSERT_BATCH_SIZE));
        await tx.$executeRaw`
          INSERT INTO channel_listing_options (
            id, listing_id, organization_id, external_option_id,
            item_name, sale_price, seller_sku, barcode, model_number, status, mapping_status,
            attributes_json, raw_json, last_import_run_id, is_active,
            created_at, updated_at
          )
          SELECT
            (record->>'id')::uuid,
            (record->>'listingId')::uuid,
            ${input.organizationId}::uuid,
            record->>'externalOptionId',
            record->>'optionName',
            (record->>'salePrice')::integer,
            record->>'sellerSku',
            record->>'barcode',
            record->>'modelNumber',
            record->>'skuStatus',
            'unmatched',
            record->'attributesJson',
            record->'rawJson',
            ${sourceRun.id}::uuid,
            TRUE,
            NOW(),
            NOW()
          FROM jsonb_array_elements(${payload}::jsonb) AS record
          ON CONFLICT (listing_id, external_option_id)
          DO UPDATE SET
            item_name = EXCLUDED.item_name,
            sale_price = EXCLUDED.sale_price,
            seller_sku = EXCLUDED.seller_sku,
            barcode = EXCLUDED.barcode,
            model_number = EXCLUDED.model_number,
            status = EXCLUDED.status,
            attributes_json = EXCLUDED.attributes_json,
            raw_json = EXCLUDED.raw_json,
            last_import_run_id = EXCLUDED.last_import_run_id,
            is_active = TRUE,
            updated_at = NOW()
        `;
      }

      const deactivatedOptions = await tx.channelListingOption.updateMany({
        where: {
          organizationId: input.organizationId,
          listing: { channelAccountId: input.channelAccountId },
          externalOptionId: { notIn: externalOptionIds },
          isActive: true,
        },
        data: { isActive: false, lastImportRunId: sourceRun.id },
      });
      const deactivatedListings = await tx.channelListing.updateMany({
        where: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          externalId: { notIn: externalProductIds },
          isActive: true,
        },
        data: { isActive: false, lastImportRunId: sourceRun.id },
      });

      const media = await this.media.publishProviderMedia({
        transaction: tx,
        organizationId: input.organizationId,
        userId: input.userId,
        sourceImportRunId: sourceRun.id,
        listings: input.products.map(({ product }) => ({
          listingId: listingIds.get(product.externalProductId)!,
          displayName:
            product.displayName ?? product.registeredName ?? product.externalProductId,
          media: flattenMedia(product.media, product.options.flatMap((option) => option.media)),
        })),
      });

      const publicationSequence = await nextPublicationSequence(tx, input.organizationId);
      await tx.sourceImportRun.update({
        where: { id: sourceRun.id },
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
          createdProductCount: input.products.length - existingListingIds.size,
          updatedProductCount: existingListingIds.size,
          deactivatedProductCount: deactivatedListings.count,
          createdSkuCount: options.length - existingOptionIds.size,
          updatedSkuCount: existingOptionIds.size,
          deactivatedSkuCount: deactivatedOptions.count,
          ...media,
        },
      };
      await completeCollectionRun(tx, input, collectionRun.metaJson, result);
      return result;
    }, TRANSACTION_OPTIONS);
  }
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
  const identity = account.externalAccountId?.trim();
  if (!identity) {
    throw new BadRequestException('Coupang account requires externalAccountId');
  }
  if (account.vendorId?.trim() && account.vendorId.trim() !== identity) {
    throw new ConflictException('Coupang account vendorId conflicts with externalAccountId');
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

function flattenMedia(
  productMedia: CoupangCatalogMediaV1[],
  optionMedia: CoupangCatalogMediaV1[],
): CoupangCatalogMediaV1[] {
  return [...productMedia, ...optionMedia];
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberRecord(value: unknown): Record<string, number> {
  const record = jsonRecord(value);
  if (!record) return {};
  return Object.fromEntries(Object.entries(record).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  ));
}

function zeroChanges(): Record<string, number> {
  return {
    createdProductCount: 0,
    updatedProductCount: 0,
    deactivatedProductCount: 0,
    createdSkuCount: 0,
    updatedSkuCount: 0,
    deactivatedSkuCount: 0,
    imageCount: 0,
    pendingImageCount: 0,
    readyImageCount: 0,
    failedImageCount: 0,
    inactivatedImageCount: 0,
  };
}
