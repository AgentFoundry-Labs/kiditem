import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const UPSERT_BATCH_SIZE = 500;

export type ChannelCatalogIdentityOption = {
  externalOptionId: string;
  optionName: string | null;
  salePrice: number | null;
  sellerSku: string | null;
  barcode: string | null;
  modelNumber: string | null;
  skuStatus: string | null;
  attributes: unknown;
  raw: Record<string, unknown>;
};

export type ChannelCatalogIdentityProduct = {
  externalProductId: string;
  registeredName: string | null;
  displayName: string | null;
  category: string | null;
  manufacturer: string | null;
  brand: string | null;
  productStatus: string | null;
  raw: Record<string, unknown>;
  options: ChannelCatalogIdentityOption[];
};

export type ChannelCatalogIdentityUpsertInput = {
  organizationId: string;
  channelAccountId: string;
  products: ChannelCatalogIdentityProduct[];
  lastImportRunId: string | null;
  rawSource: string;
};

export type ChannelCatalogIdentityUpsertResult = {
  changes: {
    createdProductCount: number;
    updatedProductCount: number;
    createdSkuCount: number;
    updatedSkuCount: number;
  };
  externalProductIds: string[];
  externalOptionIds: string[];
  listingIds: Map<string, string>;
};

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
  const existingProductIds = new Set(existingListings.map(({ externalId }) => externalId));
  const existingOptionIds = new Set(existingOptions.map(({ externalOptionId }) =>
    externalOptionId));
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
        channel_name = EXCLUDED.channel_name,
        display_name = EXCLUDED.display_name,
        category = EXCLUDED.category,
        manufacturer = EXCLUDED.manufacturer,
        brand = EXCLUDED.brand,
        status = EXCLUDED.status,
        raw_json = EXCLUDED.raw_json,
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
        ${input.lastImportRunId}::uuid,
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
        last_import_run_id = COALESCE(
          EXCLUDED.last_import_run_id,
          channel_listing_options.last_import_run_id
        ),
        is_active = TRUE,
        updated_at = NOW()
    `;
  }

  return {
    externalProductIds,
    externalOptionIds,
    listingIds,
    changes: {
      createdProductCount: input.products.length - existingProductIds.size,
      updatedProductCount: existingProductIds.size,
      createdSkuCount: options.length - existingOptionIds.size,
      updatedSkuCount: existingOptionIds.size,
    },
  };
}
