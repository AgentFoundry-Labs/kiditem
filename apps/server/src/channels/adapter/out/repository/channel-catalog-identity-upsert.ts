import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readListingProductIds } from '../persistence/listing-product-summary.reader';
import { listingRawJsonReplacementSql } from './channel-listing-raw-json';

const UPSERT_BATCH_SIZE = 500;

import type { ChannelCatalogIdentityOption, ChannelCatalogIdentityMedia, ChannelCatalogIdentityProduct, ChannelCatalogBasicsUpsertInput, ChannelCatalogIdentityUpsertInput, ChannelCatalogUnobservedOptionField, ChannelCatalogDetailIdentityOption, ChannelCatalogDetailIdentityProduct, ChannelCatalogIdentityUpsertResult, PersistedChannelCatalogListing } from '../../../domain/collection/catalog-identities';
export type { ChannelCatalogIdentityOption, ChannelCatalogIdentityMedia, ChannelCatalogIdentityProduct, ChannelCatalogBasicsUpsertInput, ChannelCatalogIdentityUpsertInput, ChannelCatalogUnobservedOptionField, ChannelCatalogDetailIdentityOption, ChannelCatalogDetailIdentityProduct, ChannelCatalogIdentityUpsertResult, PersistedChannelCatalogListing } from '../../../domain/collection/catalog-identities';

/**
 * Publish the complete Wing inventory-list stage without touching fields
 * owned by the seller-product detail stage. The list response may create or
 * reactivate identities and update observed basic facts, but its empty
 * attributes/model/barcode/media values must not erase detail data.
 */
export async function upsertChannelCatalogBasics(
  tx: Prisma.TransactionClient,
  input: ChannelCatalogBasicsUpsertInput,
): Promise<ChannelCatalogIdentityUpsertResult> {
  const externalProductIds = input.products.map((product) => product.externalProductId);
  const externalOptionIds = input.products.flatMap((product) =>
    product.options.map((option) => option.externalOptionId));
  const [existingListings, existingOptions] = await Promise.all([
    tx.channelListing.findMany({
      where: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        externalId: { in: externalProductIds },
      },
      select: { id: true, externalId: true, isActive: true },
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
        isActive: true,
        rawJson: true,
        listing: { select: { externalId: true } },
      },
    }),
  ]);
  const existingProductIds = new Set(existingListings.map(({ externalId }) => externalId));
  const existingListingByExternalId = new Map(
    existingListings.map((row) => [row.externalId, row]),
  );
  const existingOptionByExternalId = groupByExternalOptionId(existingOptions);
  let mappingIdentityChanged =
    input.products.some((product) => {
      const existing = existingListingByExternalId.get(product.externalProductId);
      return !existing || !existing.isActive;
    });
  const expectedOptionOwner = new Map<string, string>();
  for (const product of input.products) {
    for (const option of product.options) {
      const previous = expectedOptionOwner.get(option.externalOptionId);
      if (previous && previous !== product.externalProductId) {
        throw new ConflictException(
          `Channel option ${option.externalOptionId} belongs to multiple products`,
        );
      }
      expectedOptionOwner.set(option.externalOptionId, product.externalProductId);
    }
  }
  for (const option of existingOptions) {
    if (expectedOptionOwner.get(option.externalOptionId) !== option.listing.externalId) {
      throw new ConflictException(
        `Channel option ${option.externalOptionId} cannot move to another parent`,
      );
    }
  }
  if (existingOptions.some((option) =>
    (existingOptionByExternalId.get(option.externalOptionId)?.length ?? 0) > 1)) {
    throw new ConflictException('Channel option identity is ambiguous');
  }

  for (let offset = 0; offset < input.products.length; offset += UPSERT_BATCH_SIZE) {
    const payload = JSON.stringify(input.products
      .slice(offset, offset + UPSERT_BATCH_SIZE)
      .map((product) => ({
        id: randomUUID(),
        externalProductId: product.externalProductId,
        displayName: product.displayName,
        category: product.category,
        manufacturer: product.manufacturer,
        brand: product.brand,
        productStatus: product.productStatus,
        rawJson: {
          ...product.raw,
          source: input.rawSource,
          externalProductId: product.externalProductId,
        },
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
        'coupang',
        record->>'displayName',
        record->>'category',
        record->>'manufacturer',
        record->>'brand',
        record->>'productStatus',
        record->'rawJson',
        ${input.lastImportRunId}::uuid,
        TRUE,
        NOW(),
        NOW()
      FROM jsonb_array_elements(${payload}::jsonb) AS record
      ON CONFLICT (organization_id, channel_account_id, external_id)
      DO UPDATE SET
        channel_name = COALESCE(channel_listings.channel_name, EXCLUDED.channel_name),
        display_name = COALESCE(EXCLUDED.display_name, channel_listings.display_name),
        category = COALESCE(EXCLUDED.category, channel_listings.category),
        manufacturer = COALESCE(EXCLUDED.manufacturer, channel_listings.manufacturer),
        brand = COALESCE(EXCLUDED.brand, channel_listings.brand),
        status = COALESCE(EXCLUDED.status, channel_listings.status),
        raw_json = COALESCE(channel_listings.raw_json, '{}'::jsonb) || EXCLUDED.raw_json,
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
    throw new ConflictException('Not every basic channel parent listing was persisted');
  }
  const listingIds = new Map(persistedListings.map(({ externalId, id }) =>
    [externalId, id]));
  const listingOptions = await tx.channelListingOption.findMany({
    where: {
      organizationId: input.organizationId,
      listingId: { in: persistedListings.map((listing) => listing.id) },
    },
    select: {
      id: true,
      externalOptionId: true,
      isActive: true,
      rawJson: true,
      listing: { select: { externalId: true } },
    },
  });
  const optionPlans: BasicOptionPlan[] = input.products.flatMap((product) => {
    const listingId = listingIds.get(product.externalProductId);
    if (!listingId) throw new ConflictException('Basic listing ID is missing');
    const existingForListing = listingOptions.filter((row) =>
      row.listing.externalId === product.externalProductId);
    return product.options.map((option) => {
      const existing = resolveBasicOptionIdentity(
        product.externalProductId,
        option,
        existingForListing,
        existingOptionByExternalId.get(option.externalOptionId) ?? [],
      );
      const externalOptionId = canonicalBasicExternalOptionId(existing, option);
      if (!existing || !existing.isActive || existing.externalOptionId !== externalOptionId) {
        mappingIdentityChanged = true;
      }
      return {
        id: existing?.id ?? randomUUID(),
        listingId,
        existing,
        externalOptionId,
        itemName: option.optionName,
        salePrice: option.salePrice,
        sellerSku: option.sellerSku,
        status: option.skuStatus,
        barcode: option.barcode,
        modelNumber: option.modelNumber,
        attributesJson: option.attributes,
        rawJson: mergeBasicOptionRaw(
          jsonRecord(existing?.rawJson),
          option.raw,
          input.rawSource,
          product.externalProductId,
          externalOptionId,
          existing?.externalOptionId ?? null,
        ),
      };
    });
  });
  const options = optionPlans.map(({ existing: _existing, ...option }) => option);
  const promotedPlans = optionPlans.filter((option) =>
    option.existing && option.existing.externalOptionId !== option.externalOptionId);
  const identityRemaps = promotedPlans.map((option) => ({
    listingId: option.listingId,
    oldExternalOptionId: option.existing!.externalOptionId,
    newExternalOptionId: option.externalOptionId,
  }));
  assertUniqueResolvedBasicOptionIds(optionPlans);
  if (identityRemaps.length > 0) {
    const updated = await tx.$executeRaw`
      UPDATE channel_listing_options AS option_row
      SET external_option_id = incoming."externalOptionId",
          updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(promotedPlans.map((option) => ({
        id: option.id,
        externalOptionId: option.externalOptionId,
      })))}::jsonb)
        AS incoming(id uuid, "externalOptionId" text)
      WHERE option_row.organization_id = ${input.organizationId}::uuid
        AND option_row.id = incoming.id
    `;
    if (updated !== identityRemaps.length) {
      throw new ConflictException('BASIC_OPTION_IDENTITY_REMAP_FENCE');
    }
  }
  for (let offset = 0; offset < options.length; offset += UPSERT_BATCH_SIZE) {
    const payload = JSON.stringify(options.slice(offset, offset + UPSERT_BATCH_SIZE));
    await tx.$executeRaw`
      INSERT INTO channel_listing_options (
        id, listing_id, organization_id, external_option_id,
        item_name, sale_price, seller_sku, barcode, model_number, status,
        attributes_json, raw_json, last_import_run_id, is_active,
        created_at, updated_at
      )
      SELECT
        (record->>'id')::uuid,
        (record->>'listingId')::uuid,
        ${input.organizationId}::uuid,
        record->>'externalOptionId',
        record->>'itemName',
        (record->>'salePrice')::integer,
        record->>'sellerSku',
        record->>'barcode',
        record->>'modelNumber',
        record->>'status',
        record->'attributesJson',
        record->'rawJson',
        ${input.lastImportRunId}::uuid,
        TRUE,
        NOW(),
        NOW()
      FROM jsonb_array_elements(${payload}::jsonb) AS record
      ON CONFLICT (listing_id, external_option_id)
      DO UPDATE SET
        item_name = COALESCE(EXCLUDED.item_name, channel_listing_options.item_name),
        sale_price = COALESCE(EXCLUDED.sale_price, channel_listing_options.sale_price),
        seller_sku = COALESCE(EXCLUDED.seller_sku, channel_listing_options.seller_sku),
        status = COALESCE(EXCLUDED.status, channel_listing_options.status),
        raw_json = COALESCE(channel_listing_options.raw_json, '{}'::jsonb) || EXCLUDED.raw_json,
        last_import_run_id = EXCLUDED.last_import_run_id,
        is_active = TRUE,
        updated_at = NOW()
    `;
  }

  const persistedIdentities = await tx.channelListing.findMany({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      externalId: { in: externalProductIds },
    },
    select: {
      id: true,
      externalId: true,
      options: {
        where: {
          organizationId: input.organizationId,
          id: { in: options.map((option) => option.id) },
          isActive: true,
        },
        select: { id: true, externalOptionId: true },
        orderBy: { externalOptionId: 'asc' },
      },
    },
    orderBy: { externalId: 'asc' },
  });
  if (
    persistedIdentities.length !== input.products.length
    || persistedIdentities.reduce((sum, listing) => sum + listing.options.length, 0)
      !== options.length
  ) {
    throw new ConflictException('Not every persisted basic identity could be reloaded');
  }
  const summaryByListing = await readListingProductIds(tx, {
    organizationId: input.organizationId,
    listingIds: persistedIdentities.map((listing) => listing.id),
  });
  return {
    mappingIdentityChanged,
    externalProductIds,
    externalOptionIds: options.map((option) => option.externalOptionId),
    identityRemaps,
    listingIds,
    persistedListings: persistedIdentities.map((listing) => ({
      id: listing.id,
      externalProductId: listing.externalId,
      masterProductId: summaryByListing.get(listing.id) ?? null,
      options: listing.options,
    })),
    changes: {
      createdProductCount: input.products.length - existingProductIds.size,
      updatedProductCount: existingProductIds.size,
      createdSkuCount: optionPlans.filter(({ existing }) => !existing).length,
      updatedSkuCount: optionPlans.filter(({ existing }) => Boolean(existing)).length,
    },
  };
}

/**
 * Details are deliberately metadata-only.  They may enrich an identity that
 * was admitted by the basics stage, but may not create, move, deactivate or
 * re-key a listing/option.  This keeps confirmed BOM rows attached to the
 * canonical option when Wing later assigns a vendorItemId.
 */
export async function updateChannelCatalogDetails(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    products: ChannelCatalogDetailIdentityProduct[];
    lastImportRunId: string;
    rawSource: string;
  },
): Promise<Pick<ChannelCatalogIdentityUpsertResult, 'mappingIdentityChanged' | 'changes' | 'externalProductIds' | 'externalOptionIds' | 'identityRemaps' | 'listingIds' | 'persistedListings'>> {
  const externalProductIds = input.products.map((product) => product.externalProductId);
  const requestedOptionIds = input.products.flatMap((product) =>
    product.options.map((option) => option.externalOptionId));
  assertUniqueIds(externalProductIds, 'DETAIL_PRODUCT_ID_CONFLICT');
  assertUniqueIds(requestedOptionIds, 'DETAIL_OPTION_ID_CONFLICT');
  const listings = await tx.channelListing.findMany({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      externalId: { in: externalProductIds },
    },
    select: { id: true, externalId: true, isActive: true, rawJson: true },
  });
  if (listings.length !== new Set(externalProductIds).size || listings.some((listing) => !listing.isActive)) {
    throw new ConflictException('DETAIL_IDENTITY_MISSING');
  }
  const listingIds = new Map(listings.map((listing) => [listing.externalId, listing.id]));
  const options = await tx.channelListingOption.findMany({
    where: {
      organizationId: input.organizationId,
      listingId: { in: listings.map((listing) => listing.id) },
      isActive: true,
    },
    select: {
      id: true,
      externalOptionId: true,
      rawJson: true,
      listing: { select: { externalId: true } },
    },
  });
  const accountOptionCollisions = await tx.channelListingOption.findMany({
    where: {
      organizationId: input.organizationId,
      externalOptionId: { in: requestedOptionIds },
      listing: { channelAccountId: input.channelAccountId },
      isActive: true,
    },
    select: {
      id: true,
      externalOptionId: true,
      rawJson: true,
      listing: { select: { externalId: true } },
    },
  });
  const optionById = groupByExternalOptionId(accountOptionCollisions);
  const usedOptionIds = new Set<string>();
  const resolvedOptionByIncomingId = new Map<string, (typeof options)[number]>();
  for (const product of input.products) {
    const listing = listingIds.get(product.externalProductId);
    if (!listing) throw new ConflictException(`DETAIL_IDENTITY_MISSING:${product.externalProductId}`);
    const listingOptions = options.filter((option) => option.listing.externalId === product.externalProductId);
    if (listingOptions.length !== product.options.length) {
      throw new ConflictException(`DETAIL_OPTION_COVERAGE_MISMATCH:${product.externalProductId}`);
    }
    for (const option of product.options) {
      const exactCandidates = optionById.get(option.externalOptionId) ?? [];
      const exact = exactCandidates.length === 1 ? exactCandidates[0] : null;
      if (exactCandidates.length > 1) {
        throw new ConflictException(
          `DETAIL_IDENTITY_AMBIGUOUS:${product.externalProductId}:${option.externalOptionId}`,
        );
      }
      const relationMatches = options.filter((candidate) => {
        if (candidate.listing.externalId !== product.externalProductId || usedOptionIds.has(candidate.id)) return false;
        const raw = jsonRecord(candidate.rawJson);
        const providerVendorItemId = meaningfulText(option.vendorItemId);
        if (providerVendorItemId) return raw?.vendorItemId === providerVendorItemId;
        const relationId = meaningfulText(option.sellerProductItemId);
        return relationId !== null && (
          raw?.sellerProductItemId === relationId ||
          raw?.vendorInventoryItemId === relationId
        );
      });
      if (exact && exact.listing.externalId !== product.externalProductId) {
        throw new ConflictException(
          `DETAIL_IDENTITY_CONFLICT:${product.externalProductId}:${option.externalOptionId}`,
        );
      }
      if (exact && relationMatches.some((candidate) => candidate.id !== exact.id)) {
        throw new ConflictException(
          `DETAIL_IDENTITY_AMBIGUOUS:${product.externalProductId}:${option.externalOptionId}`,
        );
      }
      const existing = exact ?? (relationMatches.length === 1 ? relationMatches[0] : null);
      if (!existing || usedOptionIds.has(existing.id) || existing.listing.externalId !== product.externalProductId) {
        throw new ConflictException(`DETAIL_IDENTITY_CONFLICT:${product.externalProductId}:${option.externalOptionId}`);
      }
      usedOptionIds.add(existing.id);
      resolvedOptionByIncomingId.set(`${product.externalProductId}\u0000${option.externalOptionId}`, existing);
    }
  }

  const listingByExternalId = new Map(listings.map((listing) => [listing.externalId, listing]));
  const detailMerges = new Map<string, DetailMergeResult>();
  for (const product of input.products) {
    const listing = listingByExternalId.get(product.externalProductId);
    if (!listing) throw new ConflictException(`DETAIL_IDENTITY_MISSING:${product.externalProductId}`);
    const listingOptions = options.filter((option) => option.listing.externalId === product.externalProductId);
    detailMerges.set(product.externalProductId, mergeDetailState(
      jsonRecord(listing.rawJson),
      listingOptions,
      product,
      input.rawSource,
      resolvedOptionByIncomingId,
    ));
  }

  const identityRemaps = input.products.flatMap((product) => product.options.flatMap((option) => {
    const resolved = resolvedOptionByIncomingId.get(
      `${product.externalProductId}\u0000${option.externalOptionId}`,
    );
    if (!resolved || resolved.externalOptionId === option.externalOptionId) return [];
    return [{
      listingId: listingIds.get(product.externalProductId)!,
      oldExternalOptionId: option.externalOptionId,
      newExternalOptionId: resolved.externalOptionId,
    }];
  }));

  const listingUpdates = input.products.map((product) => ({
    id: listingIds.get(product.externalProductId)!,
    rawJson: detailMerges.get(product.externalProductId)!.listingRaw,
  }));
  for (let offset = 0; offset < listingUpdates.length; offset += UPSERT_BATCH_SIZE) {
    const batch = listingUpdates.slice(offset, offset + UPSERT_BATCH_SIZE);
    const updated = await tx.$executeRaw`
      UPDATE channel_listings AS listing
      SET raw_json = COALESCE(listing.raw_json, '{}'::jsonb) || incoming."rawJson",
          last_import_run_id = ${input.lastImportRunId}::uuid,
          updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
        AS incoming(id uuid, "rawJson" jsonb)
      WHERE listing.organization_id = ${input.organizationId}::uuid
        AND listing.channel_account_id = ${input.channelAccountId}::uuid
        AND listing.id = incoming.id
    `;
    if (updated !== batch.length) throw new ConflictException('DETAIL_LISTING_UPDATE_FENCE');
  }

  const optionUpdates = input.products.flatMap((product) => product.options.map((option) => {
    const resolved = resolvedOptionByIncomingId.get(
      `${product.externalProductId}\u0000${option.externalOptionId}`,
    );
    if (!resolved) throw new ConflictException('DETAIL_IDENTITY_CONFLICT');
    const detailMerge = detailMerges.get(product.externalProductId);
    if (!detailMerge) throw new ConflictException('DETAIL_DOCUMENT_MERGE_MISSING');
    return {
      id: resolved.id,
      attributesJson: option.attributes,
      modelNumber: option.modelNumber,
      barcode: option.barcode,
      sellerSku: option.externalVendorSku,
      hasAttributes: hasMeaningfulValue(option.attributes),
      rawJson: mergeDetailOptionRaw(
        jsonRecord(resolved.rawJson),
        option,
        input.rawSource,
        product.externalProductId,
        detailMerge.optionDocumentIds.get(resolved.id) ?? [],
        resolved.externalOptionId,
      ),
    };
  }));
  for (let offset = 0; offset < optionUpdates.length; offset += UPSERT_BATCH_SIZE) {
    const batch = optionUpdates.slice(offset, offset + UPSERT_BATCH_SIZE);
    const updated = await tx.$executeRaw`
      UPDATE channel_listing_options AS option_row
      SET attributes_json = CASE WHEN incoming."hasAttributes" THEN incoming."attributesJson" ELSE option_row.attributes_json END,
          model_number = CASE WHEN incoming."hasModelNumber" THEN incoming."modelNumber" ELSE option_row.model_number END,
          barcode = CASE WHEN incoming."hasBarcode" THEN incoming.barcode ELSE option_row.barcode END,
          seller_sku = CASE WHEN incoming."hasSellerSku" THEN incoming."sellerSku" ELSE option_row.seller_sku END,
          raw_json = COALESCE(option_row.raw_json, '{}'::jsonb) || incoming."rawJson",
          last_import_run_id = ${input.lastImportRunId}::uuid,
          updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch.map((row) => ({
        ...row,
        hasModelNumber: meaningfulText(row.modelNumber) !== null,
        hasBarcode: meaningfulText(row.barcode) !== null,
        hasSellerSku: meaningfulText(row.sellerSku) !== null,
      })))}::jsonb)
        AS incoming(id uuid, "attributesJson" jsonb, "modelNumber" text, barcode text, "sellerSku" text,
          "hasAttributes" boolean, "hasModelNumber" boolean, "hasBarcode" boolean, "hasSellerSku" boolean, "rawJson" jsonb)
      WHERE option_row.organization_id = ${input.organizationId}::uuid
        AND option_row.id = incoming.id
    `;
    if (updated !== batch.length) throw new ConflictException('DETAIL_OPTION_UPDATE_FENCE');
  }
  const persisted = await tx.channelListing.findMany({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      externalId: { in: externalProductIds },
    },
    select: {
      id: true,
      externalId: true,
      options: {
        where: { organizationId: input.organizationId, isActive: true },
        select: { id: true, externalOptionId: true },
        orderBy: { externalOptionId: 'asc' },
      },
    },
    orderBy: { externalId: 'asc' },
  });
  const summaryByListing = await readListingProductIds(tx, {
    organizationId: input.organizationId,
    listingIds: persisted.map((listing) => listing.id),
  });
  return {
    mappingIdentityChanged: false,
    changes: {
      createdProductCount: 0,
      updatedProductCount: externalProductIds.length,
      createdSkuCount: 0,
      updatedSkuCount: usedOptionIds.size,
    },
    externalProductIds,
    externalOptionIds: requestedOptionIds,
    identityRemaps,
    listingIds,
    persistedListings: persisted.map((listing) => ({
      id: listing.id,
      externalProductId: listing.externalId,
      masterProductId: summaryByListing.get(listing.id) ?? null,
      options: listing.options,
    })),
  };
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

type DetailDocument = { id: string; kind: string; value: unknown };

type BasicOptionRow = {
  id: string;
  externalOptionId: string;
  isActive: boolean;
  rawJson: unknown;
  listing: { externalId: string };
};

type BasicOptionPlan = {
  id: string;
  listingId: string;
  existing: BasicOptionRow | null;
  externalOptionId: string;
  itemName: string | null;
  salePrice: number | null;
  sellerSku: string | null;
  status: string | null;
  barcode: string | null;
  modelNumber: string | null;
  attributesJson: unknown;
  rawJson: Record<string, unknown>;
};

type DetailMergeResult = {
  listingRaw: Record<string, unknown>;
  optionDocumentIds: Map<string, string[]>;
};

type DetailOptionRow = {
  id: string;
  externalOptionId: string;
  rawJson: unknown;
  listing: { externalId: string };
};

function mergeDetailState(
  existing: Record<string, unknown> | null,
  existingOptions: readonly DetailOptionRow[],
  product: ChannelCatalogDetailIdentityProduct,
  source: string,
  resolvedOptionByIncomingId: ReadonlyMap<string, DetailOptionRow>,
): DetailMergeResult {
  const documents: DetailDocument[] = [];
  const documentByKey = new Map<string, DetailDocument>();
  const documentById = new Map<string, DetailDocument>();
  const sourceIdToCanonicalId = new Map<string, string>();

  const addDocument = (document: DetailDocument): string => {
    const key = `${document.kind}\u0000${stableJson(document.value)}`;
    const priorById = documentById.get(document.id);
    if (priorById && `${priorById.kind}\u0000${stableJson(priorById.value)}` !== key) {
      throw new ConflictException(`DETAIL_DOCUMENT_ID_CONFLICT:${document.id}`);
    }
    const canonical = documentByKey.get(key);
    if (canonical) {
      documentById.set(document.id, canonical);
      sourceIdToCanonicalId.set(document.id, canonical.id);
      return canonical.id;
    }
    documents.push(document);
    documentByKey.set(key, document);
    documentById.set(document.id, document);
    sourceIdToCanonicalId.set(document.id, document.id);
    return document.id;
  };

  for (const document of detailDocumentsFromRaw(existing)) addDocument(document);
  const incomingDocumentById = new Map<string, DetailDocument>();
  for (const rawDocument of product.documents) {
    if (rawDocument.value === undefined) continue;
    const document = {
      id: rawDocument.id,
      kind: rawDocument.kind,
      value: rawDocument.value,
    };
    incomingDocumentById.set(document.id, document);
    const canonicalId = addDocument(document);
    sourceIdToCanonicalId.set(document.id, canonicalId);
  }

  const documentByCanonicalId = new Map(documents.map((document) => [document.id, document]));
  const oldRefsByOption = new Map<string, string[]>();
  for (const option of existingOptions) {
    oldRefsByOption.set(option.id, canonicalizeRefs(
      jsonRecord(option.rawJson)?.detailDocumentIds,
      sourceIdToCanonicalId,
    ));
  }

  const optionDocumentIds = new Map<string, string[]>();
  const replacedDocumentIds = new Set<string>();
  const incomingCanonicalIds = new Set<string>();
  for (const option of product.options) {
    const resolved = resolvedOptionByIncomingId.get(
      `${product.externalProductId}\u0000${option.externalOptionId}`,
    );
    if (!resolved) throw new ConflictException('DETAIL_IDENTITY_CONFLICT');
    const oldRefs = oldRefsByOption.get(resolved.id) ?? [];
    const incomingRefs = option.documentIds.map((id) => {
      const document = incomingDocumentById.get(id);
      if (!document) throw new ConflictException(`DETAIL_DOCUMENT_REFERENCE_CONFLICT:${id}`);
      const canonicalId = sourceIdToCanonicalId.get(id);
      if (!canonicalId) throw new ConflictException(`DETAIL_DOCUMENT_REFERENCE_CONFLICT:${id}`);
      incomingCanonicalIds.add(canonicalId);
      return canonicalId;
    });
    const incomingByKind = new Map<string, string[]>();
    for (const id of dedupe(incomingRefs)) {
      const document = documentByCanonicalId.get(id);
      if (!document || !hasMeaningfulValue(document.value)) continue;
      const ids = incomingByKind.get(document.kind) ?? [];
      ids.push(id);
      incomingByKind.set(document.kind, ids);
    }
    let mergedRefs = [...oldRefs];
    for (const [kind, kindRefs] of incomingByKind) {
      for (const id of oldRefs) {
        if (documentByCanonicalId.get(id)?.kind === kind) replacedDocumentIds.add(id);
      }
      mergedRefs = mergedRefs.filter((id) => documentByCanonicalId.get(id)?.kind !== kind);
      mergedRefs.push(...kindRefs);
    }
    optionDocumentIds.set(resolved.id, dedupe(mergedRefs));
  }

  const referencedIds = new Set([...optionDocumentIds.values()].flat());
  const persistedDocuments = documents.filter((document) =>
    referencedIds.has(document.id)
    || incomingCanonicalIds.has(document.id)
    || !replacedDocumentIds.has(document.id));
  const incomingRaw = withoutKey(product.raw, 'detailDocuments');
  return {
    listingRaw: {
      ...(existing ?? {}),
      ...incomingRaw,
      source,
      externalProductId: product.externalProductId,
      detailDocuments: persistedDocuments,
    },
    optionDocumentIds,
  };
}

function mergeDetailOptionRaw(
  existing: Record<string, unknown> | null,
  option: ChannelCatalogDetailIdentityOption,
  source: string,
  externalProductId: string,
  detailDocumentIds: string[],
  canonicalExternalOptionId: string,
): Record<string, unknown> {
  const incoming = withoutKey(option.raw, 'detailDocumentIds');
  const result: Record<string, unknown> = {
    ...(existing ?? {}),
    ...incoming,
    source,
    externalProductId,
  };
  for (const [key, value] of [
    ['vendorItemId', option.vendorItemId],
    ['sellerProductItemId', option.sellerProductItemId],
    ['externalVendorSku', option.externalVendorSku],
    ['barcode', option.barcode],
    ['modelNumber', option.modelNumber],
  ] as const) {
    if (value !== undefined) result[key] = value;
  }
  const identitySource = identitySourceForDetailOption(
    option,
    incoming,
    existing,
    canonicalExternalOptionId,
  );
  if (identitySource) {
    result.externalOptionIdentitySource = identitySource;
  } else if (
    result.externalOptionIdentitySource === 'vendor_item'
    || result.externalOptionIdentitySource === 'seller_product_item'
    || result.externalOptionIdentitySource === 'inventory_item'
  ) {
    // An unknown/null detail identity must not manufacture a fallback label.
    // Keep a previously persisted source only when its relation is still
    // present; otherwise remove the stale derived marker.
    const existingSource = existing?.externalOptionIdentitySource;
    const existingHasRelation = meaningfulText(existing?.vendorItemId)
      || meaningfulText(existing?.sellerProductItemId)
      || meaningfulText(existing?.vendorInventoryItemId);
    if (existingHasRelation && existingSource) result.externalOptionIdentitySource = existingSource;
    else delete result.externalOptionIdentitySource;
  }
  result.detailDocumentIds = dedupe(detailDocumentIds);
  return result;
}

function detailDocumentsFromRaw(raw: Record<string, unknown> | null): DetailDocument[] {
  if (!Array.isArray(raw?.detailDocuments)) return [];
  return raw.detailDocuments.flatMap((value) => {
    const document = jsonRecord(value);
    return typeof document?.id === 'string'
      && document.id.trim().length > 0
      && typeof document.kind === 'string'
      && document.kind.trim().length > 0
      && Object.prototype.hasOwnProperty.call(document, 'value')
      ? [{ id: document.id, kind: document.kind, value: document.value }]
      : [];
  });
}

function canonicalizeRefs(value: unknown, sourceIdToCanonicalId: ReadonlyMap<string, string>): string[] {
  if (!Array.isArray(value)) return [];
  return dedupe(value.flatMap((item) => {
    if (typeof item !== 'string' || item.trim().length === 0) return [];
    return [sourceIdToCanonicalId.get(item) ?? item];
  }));
}

function groupByExternalOptionId<T extends { externalOptionId: string }>(
  options: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const option of options) {
    const rows = grouped.get(option.externalOptionId) ?? [];
    rows.push(option);
    grouped.set(option.externalOptionId, rows);
  }
  return grouped;
}

function resolveBasicOptionIdentity(
  externalProductId: string,
  option: ChannelCatalogIdentityOption,
  listingOptions: readonly BasicOptionRow[],
  exactCandidates: readonly BasicOptionRow[],
): BasicOptionRow | null {
  if (exactCandidates.length > 1) {
    throw new ConflictException(`BASIC_IDENTITY_AMBIGUOUS:${externalProductId}:${option.externalOptionId}`);
  }
  const exact = exactCandidates[0] ?? null;
  if (exact && exact.listing.externalId !== externalProductId) {
    throw new ConflictException(`BASIC_IDENTITY_CONFLICT:${externalProductId}:${option.externalOptionId}`);
  }
  const incomingInventoryItemId = meaningfulText(option.raw.vendorInventoryItemId);
  const incomingVendorItemId = meaningfulText(option.raw.vendorItemId);
  const relationMatches = listingOptions.filter((candidate) => {
    const raw = jsonRecord(candidate.rawJson);
    if (incomingInventoryItemId) return raw?.vendorInventoryItemId === incomingInventoryItemId;
    if (incomingVendorItemId) return raw?.vendorItemId === incomingVendorItemId;
    return false;
  });
  if (exact && relationMatches.some((candidate) => candidate.id !== exact.id)) {
    throw new ConflictException(`BASIC_IDENTITY_AMBIGUOUS:${externalProductId}:${option.externalOptionId}`);
  }
  if (relationMatches.length > 1) {
    throw new ConflictException(`BASIC_IDENTITY_AMBIGUOUS:${externalProductId}:${option.externalOptionId}`);
  }
  return exact ?? relationMatches[0] ?? null;
}

function canonicalBasicExternalOptionId(
  existing: BasicOptionRow | null,
  option: ChannelCatalogIdentityOption,
): string {
  if (!existing) return option.externalOptionId;
  // Wing may fall back to vendorInventoryItemId while vendorItemId is
  // explicitly null.  That is an unverified observation, not permission to
  // rename a known vendor identity on the same row.
  return meaningfulText(option.raw.vendorItemId)
    ? option.externalOptionId
    : existing.externalOptionId;
}

function mergeBasicOptionRaw(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
  source: string,
  externalProductId: string,
  canonicalExternalOptionId: string,
  existingExternalOptionId: string | null,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    ...(existing ?? {}),
    ...incoming,
    source,
    externalProductId,
  };
  const identitySource = identitySourceForBasicOption(
    result,
    canonicalExternalOptionId,
    existing,
    existingExternalOptionId,
  );
  if (identitySource) {
    result.externalOptionIdentitySource = identitySource;
  } else if (
    result.externalOptionIdentitySource === 'vendor_item'
    || result.externalOptionIdentitySource === 'inventory_item'
  ) {
    delete result.externalOptionIdentitySource;
  }
  return result;
}

function assertUniqueResolvedBasicOptionIds(optionPlans: readonly BasicOptionPlan[]): void {
  const canonicalByExistingId = new Map<string, string>();
  for (const plan of optionPlans) {
    if (!plan.existing) continue;
    const prior = canonicalByExistingId.get(plan.existing.id);
    if (prior !== undefined) {
      throw new ConflictException(
        prior === plan.externalOptionId
          ? 'BASIC_OPTION_IDENTITY_DUPLICATE'
          : 'BASIC_OPTION_IDENTITY_REMAP_AMBIGUOUS',
      );
    }
    canonicalByExistingId.set(plan.existing.id, plan.externalOptionId);
  }
}

function assertUniqueIds(ids: readonly string[], code: string): void {
  if (new Set(ids).size !== ids.length) throw new ConflictException(code);
}

function identitySourceForBasicOption(
  raw: Record<string, unknown>,
  canonicalExternalOptionId: string,
  existing: Record<string, unknown> | null,
  existingExternalOptionId: string | null,
): 'vendor_item' | 'inventory_item' | null {
  if (meaningfulText(raw.vendorItemId) === canonicalExternalOptionId) return 'vendor_item';
  if (meaningfulText(raw.vendorInventoryItemId) === canonicalExternalOptionId) {
    return 'inventory_item';
  }
  if (existingExternalOptionId === canonicalExternalOptionId) {
    const existingMarker = existing?.externalOptionIdentitySource;
    if (
      existingMarker === 'vendor_item'
      || existingMarker === 'inventory_item'
    ) return existingMarker;
    if (meaningfulText(existing?.vendorItemId) === canonicalExternalOptionId) return 'vendor_item';
    if (meaningfulText(existing?.vendorInventoryItemId) === canonicalExternalOptionId) {
      return 'inventory_item';
    }
  }
  return null;
}

function identitySourceForDetailOption(
  option: ChannelCatalogDetailIdentityOption,
  raw: Record<string, unknown>,
  existing: Record<string, unknown> | null,
  canonicalExternalOptionId: string,
): 'vendor_item' | 'seller_product_item' | 'inventory_item' | null {
  if (
    meaningfulText(option.vendorItemId) === canonicalExternalOptionId
    || meaningfulText(raw.vendorItemId) === canonicalExternalOptionId
  ) return 'vendor_item';
  if (
    meaningfulText(option.sellerProductItemId) === canonicalExternalOptionId
    || meaningfulText(raw.sellerProductItemId) === canonicalExternalOptionId
  ) {
    return 'seller_product_item';
  }
  if (meaningfulText(raw.vendorInventoryItemId) === canonicalExternalOptionId) return 'inventory_item';
  if (meaningfulText(existing?.vendorItemId) === canonicalExternalOptionId) return 'vendor_item';
  if (meaningfulText(existing?.sellerProductItemId) === canonicalExternalOptionId) {
    return 'seller_product_item';
  }
  if (meaningfulText(existing?.vendorInventoryItemId) === canonicalExternalOptionId) {
    return 'inventory_item';
  }
  const existingMarker = existing?.externalOptionIdentitySource;
  if (
    existingMarker === 'vendor_item'
    || existingMarker === 'seller_product_item'
    || existingMarker === 'inventory_item'
  ) return existingMarker;
  return null;
}

function meaningfulText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function withoutKey(
  value: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> {
  if (!value) return {};
  const result = { ...value };
  delete result[key];
  return result;
}

function stableJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}

/**
 * 옵션 칸마다 "이번 관측으로 덮는 식"과 "저장값을 지키는 식". 칸 이름이 닫힌 union 이고
 * SQL 조각이 여기 한 번만 적히므로 식별자가 입력으로 새지 않는다.
 */
const OPTION_COLUMN_SQL: Record<
  ChannelCatalogUnobservedOptionField,
  { observed: Prisma.Sql; kept: Prisma.Sql }
> = {
  optionName: {
    observed: Prisma.sql`EXCLUDED.item_name`,
    kept: Prisma.sql`channel_listing_options.item_name`,
  },
  salePrice: {
    observed: Prisma.sql`EXCLUDED.sale_price`,
    kept: Prisma.sql`channel_listing_options.sale_price`,
  },
  sellerSku: {
    observed: Prisma.sql`EXCLUDED.seller_sku`,
    kept: Prisma.sql`channel_listing_options.seller_sku`,
  },
  barcode: {
    observed: Prisma.sql`EXCLUDED.barcode`,
    kept: Prisma.sql`channel_listing_options.barcode`,
  },
  modelNumber: {
    observed: Prisma.sql`EXCLUDED.model_number`,
    kept: Prisma.sql`channel_listing_options.model_number`,
  },
  skuStatus: {
    observed: Prisma.sql`EXCLUDED.status`,
    kept: Prisma.sql`channel_listing_options.status`,
  },
};

/**
 * 원천이 읽지 않는다고 선언한 칸은 저장된 관측값을 그대로 두고, 그 밖의 칸은 이번 관측으로
 * 덮는다.
 */
function observedOptionColumn(
  input: ChannelCatalogIdentityUpsertInput,
  field: ChannelCatalogUnobservedOptionField,
): Prisma.Sql {
  const column = OPTION_COLUMN_SQL[field];
  return input.unobservedOptionFields.includes(field) ? column.kept : column.observed;
}

export async function upsertChannelCatalogIdentities(
  tx: Prisma.TransactionClient,
  input: ChannelCatalogIdentityUpsertInput,
): Promise<ChannelCatalogIdentityUpsertResult> {
  const externalProductIds = input.products.map((product) => product.externalProductId);
  const externalOptionIds = input.products.flatMap((product) =>
    product.options.map((option) => option.externalOptionId));
  const [existingListings, existingOptions] = await Promise.all([
    tx.channelListing.findMany({
      where: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        externalId: { in: externalProductIds },
      },
      select: { id: true, externalId: true, isActive: true },
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
        isActive: true,
        listing: { select: { externalId: true } },
      },
    }),
  ]);
  const existingProductIds = new Set(existingListings.map(({ externalId }) => externalId));
  const existingOptionIds = new Set(existingOptions.map(({ externalOptionId }) =>
    externalOptionId));
  const existingListingByExternalId = new Map(
    existingListings.map((row) => [row.externalId, row]),
  );
  const existingOptionByExternalId = new Map(
    existingOptions.map((row) => [row.externalOptionId, row]),
  );
  const mappingIdentityChanged =
    input.products.some((product) => {
      const existing = existingListingByExternalId.get(product.externalProductId);
      return !existing || !existing.isActive;
    })
    || input.products.some((product) => product.options.some((option) => {
      const existing = existingOptionByExternalId.get(option.externalOptionId);
      return !existing || !existing.isActive;
    }));
  const expectedOptionOwner = new Map<string, string>();
  for (const product of input.products) {
    for (const option of product.options) {
      expectedOptionOwner.set(option.externalOptionId, product.externalProductId);
    }
  }
  for (const option of existingOptions) {
    if (expectedOptionOwner.get(option.externalOptionId) !== option.listing.externalId) {
      throw new ConflictException(
        `Channel option ${option.externalOptionId} cannot move to another parent`,
      );
    }
  }

  for (let offset = 0; offset < input.products.length; offset += UPSERT_BATCH_SIZE) {
    const payload = JSON.stringify(input.products
      .slice(offset, offset + UPSERT_BATCH_SIZE)
      .map((product) => ({ id: randomUUID(), ...product })));
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
        ${input.lastImportRunId}::uuid,
        TRUE,
        NOW(),
        NOW()
      FROM jsonb_array_elements(${payload}::jsonb) AS record
      ON CONFLICT (organization_id, channel_account_id, external_id)
      DO UPDATE SET
        channel_name = COALESCE(EXCLUDED.channel_name, channel_listings.channel_name),
        display_name = COALESCE(EXCLUDED.display_name, channel_listings.display_name),
        category = COALESCE(EXCLUDED.category, channel_listings.category),
        manufacturer = COALESCE(EXCLUDED.manufacturer, channel_listings.manufacturer),
        brand = COALESCE(EXCLUDED.brand, channel_listings.brand),
        status = COALESCE(EXCLUDED.status, channel_listings.status),
        raw_json = ${listingRawJsonReplacementSql},
        last_import_run_id = COALESCE(
          EXCLUDED.last_import_run_id,
          channel_listings.last_import_run_id
        ),
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
    throw new ConflictException('Not every channel parent listing was persisted');
  }
  const listingIds = new Map(persistedListings.map(({ externalId, id }) =>
    [externalId, id]));
  const options = input.products.flatMap((product) => {
    const listingId = listingIds.get(product.externalProductId);
    if (!listingId) throw new ConflictException('Published listing ID is missing');
    return product.options.map((option) => ({
      id: randomUUID(),
      listingId,
      ...option,
      attributesJson: option.attributes,
      rawJson: {
        ...option.raw,
        source: input.rawSource,
        externalProductId: product.externalProductId,
      },
    }));
  });
  for (let offset = 0; offset < options.length; offset += UPSERT_BATCH_SIZE) {
    const payload = JSON.stringify(options.slice(offset, offset + UPSERT_BATCH_SIZE));
    await tx.$executeRaw`
      INSERT INTO channel_listing_options (
        id, listing_id, organization_id, external_option_id,
        item_name, sale_price, seller_sku, barcode, model_number, status,
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
        record->'attributesJson',
        record->'rawJson',
        ${input.lastImportRunId}::uuid,
        TRUE,
        NOW(),
        NOW()
      FROM jsonb_array_elements(${payload}::jsonb) AS record
      ON CONFLICT (listing_id, external_option_id)
      DO UPDATE SET
        item_name = ${observedOptionColumn(input, 'optionName')},
        sale_price = ${observedOptionColumn(input, 'salePrice')},
        seller_sku = ${observedOptionColumn(input, 'sellerSku')},
        barcode = ${observedOptionColumn(input, 'barcode')},
        model_number = ${observedOptionColumn(input, 'modelNumber')},
        status = ${observedOptionColumn(input, 'skuStatus')},
        attributes_json = EXCLUDED.attributes_json,
        raw_json = EXCLUDED.raw_json,
        last_import_run_id = COALESCE(
          EXCLUDED.last_import_run_id,
          channel_listing_options.last_import_run_id
        ),
        is_active = TRUE,
        updated_at = NOW()
    `;
  }

  const persistedIdentities = await tx.channelListing.findMany({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      externalId: { in: externalProductIds },
    },
    select: {
      id: true,
      externalId: true,
      options: {
        where: {
          organizationId: input.organizationId,
          externalOptionId: { in: externalOptionIds },
          isActive: true,
        },
        select: {
          id: true,
          externalOptionId: true,
        },
        orderBy: { externalOptionId: 'asc' },
      },
    },
    orderBy: { externalId: 'asc' },
  });
  if (
    persistedIdentities.length !== input.products.length
    || persistedIdentities.reduce((sum, listing) => sum + listing.options.length, 0)
      !== options.length
  ) {
    throw new ConflictException('Not every persisted channel identity could be reloaded');
  }
  const summaryByListing = await readListingProductIds(tx, {
    organizationId: input.organizationId,
    listingIds: persistedIdentities.map((listing) => listing.id),
  });
  const persistedIdentityOutput = persistedIdentities.map((listing) => ({
    id: listing.id,
    externalProductId: listing.externalId,
    masterProductId: summaryByListing.get(listing.id) ?? null,
    options: listing.options,
  }));

  return {
    mappingIdentityChanged,
    externalProductIds,
    externalOptionIds,
    identityRemaps: [],
    listingIds,
    persistedListings: persistedIdentityOutput,
    changes: {
      createdProductCount: input.products.length - existingProductIds.size,
      updatedProductCount: existingProductIds.size,
      createdSkuCount: options.length - existingOptionIds.size,
      updatedSkuCount: existingOptionIds.size,
    },
  };
}
