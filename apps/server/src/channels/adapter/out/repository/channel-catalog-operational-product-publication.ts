import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ChannelCatalogProductProvisioningPort,
  ChannelCatalogProvisioningListing,
} from '../../../../products/application/port/in/channel-catalog-product-provisioning.port';
import type {
  ChannelCatalogIdentityProduct,
  PersistedChannelCatalogListing,
} from './channel-catalog-identity-upsert';

export function buildCatalogProductProvisioningListings(
  products: readonly ChannelCatalogIdentityProduct[],
  persistedListings: readonly PersistedChannelCatalogListing[],
): ChannelCatalogProvisioningListing[] {
  const persistedByExternalId = new Map(
    persistedListings.map((listing) => [listing.externalProductId, listing]),
  );
  return products.map((product) => {
    const persisted = persistedByExternalId.get(product.externalProductId);
    if (!persisted) {
      throw new ConflictException('Published channel listing identity is missing');
    }
    const optionByExternalId = new Map(
      persisted.options.map((option) => [option.externalOptionId, option]),
    );
    return {
      channelListingId: persisted.id,
      currentMasterProductId: persisted.masterProductId,
      name: product.registeredName ?? product.displayName ?? product.externalProductId,
      category: product.category,
      brand: product.brand,
      options: product.options.map((option) => {
        const persistedOption = optionByExternalId.get(option.externalOptionId);
        if (!persistedOption) {
          throw new ConflictException('Published channel option identity is missing');
        }
        return {
          channelListingOptionId: persistedOption.id,
          currentProductVariantId: persistedOption.productVariantId,
          name: option.optionName ?? option.sellerSku ?? option.externalOptionId,
          sellerSku: option.sellerSku,
          barcode: option.barcode,
        };
      }),
    };
  });
}

type OperationalProductPublicationInput = {
  organizationId: string;
  userId: string;
  products: readonly ChannelCatalogIdentityProduct[];
  persistedListings: readonly PersistedChannelCatalogListing[];
};

type ProductLinkWrite = {
  channelListingId: string;
  masterProductId: string;
};

type VariantLinkWrite = ProductLinkWrite & {
  channelListingOptionId: string;
  productVariantId: string;
};

const LINK_BATCH_SIZE = 500;

export async function publishCatalogOperationalProducts(
  tx: Prisma.TransactionClient,
  provisioner: ChannelCatalogProductProvisioningPort,
  input: OperationalProductPublicationInput,
) {
  if (input.persistedListings.length === 0) {
    return {
      createdMasterProductCount: 0,
      reusedMasterProductCount: 0,
      createdVariantCount: 0,
      linkedProductCount: 0,
      linkedVariantCount: 0,
    };
  }
  const listingIds = unique(input.persistedListings.map((listing) => listing.id)).sort();
  const optionIds = unique(input.persistedListings.flatMap((listing) =>
    listing.options.map((option) => option.id)));
  if (
    listingIds.length !== input.persistedListings.length
    || optionIds.length !== input.persistedListings.reduce(
      (sum, listing) => sum + listing.options.length,
      0,
    )
  ) {
    throw new ConflictException('Duplicate persisted channel identity');
  }

  // source upsert -> listing lock -> Products provision -> still-null links
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM channel_listings
    WHERE organization_id = ${input.organizationId}::uuid
      AND id IN (${Prisma.join(listingIds)})
    ORDER BY id
    FOR UPDATE
  `;
  if (locked.length !== listingIds.length) {
    throw new ConflictException('Not every published channel listing could be locked');
  }

  const currentRows = await tx.channelListing.findMany({
    where: {
      organizationId: input.organizationId,
      id: { in: listingIds },
    },
    select: {
      id: true,
      externalId: true,
      masterProductId: true,
      options: {
        where: {
          organizationId: input.organizationId,
          id: { in: optionIds },
          isActive: true,
        },
        select: {
          id: true,
          externalOptionId: true,
          productVariantId: true,
        },
        orderBy: { externalOptionId: 'asc' },
      },
    },
    orderBy: { externalId: 'asc' },
  });
  if (
    currentRows.length !== listingIds.length
    || currentRows.reduce((sum, listing) => sum + listing.options.length, 0)
      !== optionIds.length
  ) {
    throw new ConflictException('Locked channel identities changed before provisioning');
  }
  const currentListings: PersistedChannelCatalogListing[] = currentRows.map((listing) => ({
    id: listing.id,
    externalProductId: listing.externalId,
    masterProductId: listing.masterProductId,
    options: listing.options,
  }));
  const provisioningListings = buildCatalogProductProvisioningListings(
    input.products,
    currentListings,
  );
  const provisioned = await provisioner.provision({
    transaction: tx,
    organizationId: input.organizationId,
    userId: input.userId,
    listings: provisioningListings,
  });
  const validated = await validateProvisionedLinks(
    tx,
    input.organizationId,
    provisioningListings,
    provisioned.listings,
  );

  const currentByListingId = new Map(
    provisioningListings.map((listing) => [listing.channelListingId, listing]),
  );
  const productWrites = validated.listings.flatMap((listing) =>
    currentByListingId.get(listing.channelListingId)?.currentMasterProductId === null
      ? [{
        channelListingId: listing.channelListingId,
        masterProductId: listing.masterProductId,
      }]
      : []);
  const linkedProductCount = await applyProductLinksInBatches(
    tx,
    input.organizationId,
    productWrites,
  );

  const selectedRows = await tx.channelListing.findMany({
    where: {
      organizationId: input.organizationId,
      id: { in: listingIds },
    },
    select: { id: true, masterProductId: true },
  });
  if (selectedRows.length !== listingIds.length) {
    throw new ConflictException('Published channel product links could not be reloaded');
  }
  const selectedMasterByListingId = new Map(
    selectedRows.map((listing) => [listing.id, listing.masterProductId]),
  );
  const variantWrites = validated.listings.flatMap((listing) => {
    const selectedMasterProductId = selectedMasterByListingId.get(listing.channelListingId);
    if (selectedMasterProductId !== listing.masterProductId) return [];
    const currentListing = currentByListingId.get(listing.channelListingId)!;
    const currentVariantByOptionId = new Map(currentListing.options.map((option) => [
      option.channelListingOptionId,
      option.currentProductVariantId,
    ]));
    return listing.optionLinks.flatMap((option) => {
      if (
        !option.productVariantId
        || currentVariantByOptionId.get(option.channelListingOptionId) !== null
        || validated.variantMasterById.get(option.productVariantId) !== selectedMasterProductId
      ) {
        return [];
      }
      return [{
        channelListingId: listing.channelListingId,
        masterProductId: selectedMasterProductId,
        channelListingOptionId: option.channelListingOptionId,
        productVariantId: option.productVariantId,
      }];
    });
  });
  const linkedVariantCount = await applyVariantLinksInBatches(
    tx,
    input.organizationId,
    variantWrites,
  );

  return {
    createdMasterProductCount: provisioned.createdMasterProductCount,
    reusedMasterProductCount: provisioned.reusedMasterProductCount,
    createdVariantCount: provisioned.createdVariantCount,
    linkedProductCount,
    linkedVariantCount,
  };
}

async function validateProvisionedLinks(
  tx: Prisma.TransactionClient,
  organizationId: string,
  requested: readonly ChannelCatalogProvisioningListing[],
  provisioned: Awaited<ReturnType<ChannelCatalogProductProvisioningPort['provision']>>['listings'],
) {
  const requestedByListingId = new Map(requested.map((listing) => [
    listing.channelListingId,
    listing,
  ]));
  if (
    requestedByListingId.size !== requested.length
    || provisioned.length !== requested.length
    || unique(provisioned.map((listing) => listing.channelListingId)).length
      !== provisioned.length
  ) {
    throw new ConflictException('Products returned an invalid listing result set');
  }
  const masterProductIds = unique(provisioned.map((listing) => listing.masterProductId));
  const productVariantIds = unique(provisioned.flatMap((listing) =>
    listing.optionLinks
      .map((option) => option.productVariantId)
      .filter((id): id is string => Boolean(id))));
  const [masters, variants] = await Promise.all([
    tx.masterProduct.findMany({
      where: { organizationId, id: { in: masterProductIds } },
      select: { id: true },
    }),
    tx.productVariant.findMany({
      where: { organizationId, id: { in: productVariantIds } },
      select: { id: true, masterProductId: true },
    }),
  ]);
  if (masters.length !== masterProductIds.length || variants.length !== productVariantIds.length) {
    throw new ConflictException('Products returned an identity outside the organization');
  }
  const variantMasterById = new Map(
    variants.map((variant) => [variant.id, variant.masterProductId]),
  );
  for (const listing of provisioned) {
    const request = requestedByListingId.get(listing.channelListingId);
    if (!request) {
      throw new ConflictException('Products returned an unknown channel listing');
    }
    const requestedOptionIds = new Set(
      request.options.map((option) => option.channelListingOptionId),
    );
    if (
      listing.optionLinks.length !== request.options.length
      || unique(listing.optionLinks.map((option) => option.channelListingOptionId)).length
        !== listing.optionLinks.length
    ) {
      throw new ConflictException('Products returned an invalid option result set');
    }
    for (const option of listing.optionLinks) {
      if (!requestedOptionIds.has(option.channelListingOptionId)) {
        throw new ConflictException('Products returned an option under the wrong parent');
      }
      if (
        option.productVariantId
        && variantMasterById.get(option.productVariantId) !== listing.masterProductId
      ) {
        throw new ConflictException('Products returned a variant for another product');
      }
    }
  }
  return { listings: provisioned, variantMasterById };
}

async function applyProductLinksInBatches(
  tx: Prisma.TransactionClient,
  organizationId: string,
  writes: readonly ProductLinkWrite[],
): Promise<number> {
  let changed = 0;
  for (let offset = 0; offset < writes.length; offset += LINK_BATCH_SIZE) {
    const payload = JSON.stringify(writes.slice(offset, offset + LINK_BATCH_SIZE));
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE channel_listings AS listing
      SET master_product_id = record."masterProductId", updated_at = NOW()
      FROM jsonb_to_recordset(${payload}::jsonb) AS record(
        "channelListingId" uuid,
        "masterProductId" uuid
      )
      WHERE listing.id = record."channelListingId"
        AND listing.organization_id = ${organizationId}::uuid
        AND listing.master_product_id IS NULL
      RETURNING listing.id
    `;
    changed += rows.length;
  }
  return changed;
}

async function applyVariantLinksInBatches(
  tx: Prisma.TransactionClient,
  organizationId: string,
  writes: readonly VariantLinkWrite[],
): Promise<number> {
  let changed = 0;
  for (let offset = 0; offset < writes.length; offset += LINK_BATCH_SIZE) {
    const payload = JSON.stringify(writes.slice(offset, offset + LINK_BATCH_SIZE));
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE channel_listing_options AS sku
      SET product_variant_id = record."productVariantId", updated_at = NOW()
      FROM jsonb_to_recordset(${payload}::jsonb) AS record(
        "channelListingId" uuid,
        "masterProductId" uuid,
        "channelListingOptionId" uuid,
        "productVariantId" uuid
      ), product_variants AS variant, channel_listings AS listing
      WHERE sku.id = record."channelListingOptionId"
        AND sku.organization_id = ${organizationId}::uuid
        AND sku.listing_id = record."channelListingId"
        AND sku.product_variant_id IS NULL
        AND listing.id = record."channelListingId"
        AND listing.organization_id = ${organizationId}::uuid
        AND listing.master_product_id = record."masterProductId"
        AND variant.id = record."productVariantId"
        AND variant.organization_id = ${organizationId}::uuid
        AND variant.master_product_id = record."masterProductId"
      RETURNING sku.id
    `;
    changed += rows.length;
  }
  return changed;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
