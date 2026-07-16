import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ChannelCatalogProductProvisioningInput,
  ChannelCatalogProductProvisioningResult,
  ChannelCatalogProvisioningListing,
  ChannelCatalogProvisioningOption,
} from '../../../application/port/in/channel-catalog-product-provisioning.port';
import type { ChannelCatalogProductProvisioningRepositoryPort } from '../../../application/port/out/repository/channel-catalog-product-provisioning.repository.port';
import {
  channelOriginProductCode,
  channelOriginVariantCode,
  normalizeExactBarcode,
  selectUniqueMasterProduct,
  selectUniqueProductVariant,
  type ExactVariantTarget,
} from '../../../domain/channel-catalog-product-resolution';

type MasterTarget = {
  id: string;
  isActive: boolean;
  originChannelListingId: string | null;
};

type VariantTarget = {
  id: string;
  code: string;
  isActive: boolean;
  isDefault: boolean;
  masterProductId: string;
};

type BarcodeTargetRow = {
  normalizedBarcode: string;
  masterProductId: string;
  productVariantId: string;
};

type ListingResolution = {
  listing: ChannelCatalogProvisioningListing;
  masterProduct: MasterTarget;
  isOriginProduct: boolean;
};

const WRITE_BATCH_SIZE = 500;

@Injectable()
export class ChannelCatalogProductProvisioningRepositoryAdapter
implements ChannelCatalogProductProvisioningRepositoryPort {
  async provision(
    input: ChannelCatalogProductProvisioningInput,
  ): Promise<ChannelCatalogProductProvisioningResult> {
    const tx = transactionClient(input.transaction);
    if (input.listings.length === 0) return emptyResult();

    const scope = await validateScope(tx, input);
    const evidence = await loadExactEvidence(tx, input.organizationId, input.listings);
    const origins = await loadOriginProducts(
      tx,
      input.organizationId,
      input.listings.map((listing) => listing.channelListingId),
    );
    const staged = input.listings.filter((listing) => {
      if (listing.currentMasterProductId) return false;
      const origin = origins.get(listing.channelListingId);
      if (origin) {
        if (!origin.isActive) {
          throw new ConflictException('Inactive channel-origin product requires review');
        }
        return false;
      }
      return selectUniqueMasterProduct(exactTargetsForListing(listing, evidence)) === null;
    });

    const createdMasterProductCount = await createMissingOriginProducts(
      tx,
      input.organizationId,
      staged,
    );
    const allOrigins = await loadOriginProducts(
      tx,
      input.organizationId,
      input.listings.map((listing) => listing.channelListingId),
    );
    const resolutions = resolveProducts(input.listings, scope.currentMasters, allOrigins, evidence);
    const createdVariantCount = await createMissingOriginVariants(
      tx,
      input.organizationId,
      resolutions,
    );
    const originVariantByCode = await loadOriginVariants(tx, input.organizationId, resolutions);

    return {
      listings: resolutions.map(({ listing, masterProduct, isOriginProduct }) => ({
        channelListingId: listing.channelListingId,
        masterProductId: masterProduct.id,
        optionLinks: listing.options.map((option) => ({
          channelListingOptionId: option.channelListingOptionId,
          productVariantId: option.currentProductVariantId
            ?? (isOriginProduct
              ? originVariantByCode.get(
                channelOriginVariantCode(option.channelListingOptionId),
              )?.id ?? null
              : selectUniqueProductVariant(
                masterProduct.id,
                exactTargetsForOption(option, evidence),
              )),
        })),
      })),
      createdMasterProductCount,
      reusedMasterProductCount: input.listings.length - createdMasterProductCount,
      createdVariantCount,
    };
  }
}

async function validateScope(
  tx: Prisma.TransactionClient,
  input: ChannelCatalogProductProvisioningInput,
): Promise<{ currentMasters: Map<string, MasterTarget> }> {
  const listingIds = unique(input.listings.map((listing) => listing.channelListingId));
  const optionInputs = input.listings.flatMap((listing) => listing.options.map((option) => ({
    listingId: listing.channelListingId,
    option,
  })));
  const optionIds = unique(optionInputs.map(({ option }) => option.channelListingOptionId));
  if (listingIds.length !== input.listings.length || optionIds.length !== optionInputs.length) {
    throw new ConflictException('Duplicate channel catalog identity input');
  }

  const [listingRows, optionRows] = await Promise.all([
    tx.channelListing.findMany({
      where: { organizationId: input.organizationId, id: { in: listingIds } },
      select: { id: true, masterProductId: true },
    }),
    tx.channelListingOption.findMany({
      where: { organizationId: input.organizationId, id: { in: optionIds } },
      select: { id: true, listingId: true, productVariantId: true },
    }),
  ]);
  if (listingRows.length !== listingIds.length || optionRows.length !== optionIds.length) {
    throw new ConflictException('Channel catalog identity is outside the organization');
  }

  const listingById = new Map(listingRows.map((row) => [row.id, row]));
  const optionById = new Map(optionRows.map((row) => [row.id, row]));
  for (const listing of input.listings) {
    const row = listingById.get(listing.channelListingId)!;
    if (row.masterProductId !== listing.currentMasterProductId) {
      throw new ConflictException('Channel product link changed before provisioning');
    }
    for (const option of listing.options) {
      const optionRow = optionById.get(option.channelListingOptionId)!;
      if (
        optionRow.listingId !== listing.channelListingId
        || optionRow.productVariantId !== option.currentProductVariantId
      ) {
        throw new ConflictException('Channel option scope or link changed before provisioning');
      }
    }
  }

  const currentMasterIds = unique(input.listings
    .map((listing) => listing.currentMasterProductId)
    .filter((id): id is string => Boolean(id)));
  const currentVariantIds = unique(optionInputs
    .map(({ option }) => option.currentProductVariantId)
    .filter((id): id is string => Boolean(id)));
  const [currentMasterRows, currentVariantRows] = await Promise.all([
    tx.masterProduct.findMany({
      where: { organizationId: input.organizationId, id: { in: currentMasterIds } },
      select: { id: true, isActive: true, originChannelListingId: true },
    }),
    tx.productVariant.findMany({
      where: { organizationId: input.organizationId, id: { in: currentVariantIds } },
      select: {
        id: true,
        code: true,
        isActive: true,
        isDefault: true,
        masterProductId: true,
      },
    }),
  ]);
  if (
    currentMasterRows.length !== currentMasterIds.length
    || currentVariantRows.length !== currentVariantIds.length
  ) {
    throw new ConflictException('Current product link is outside the organization');
  }
  const currentMasters = new Map(currentMasterRows.map((row) => [row.id, row]));
  const currentVariants = new Map(currentVariantRows.map((row) => [row.id, row]));
  for (const listing of input.listings) {
    const master = listing.currentMasterProductId
      ? currentMasters.get(listing.currentMasterProductId)
      : null;
    if (master && !master.isActive) {
      throw new ConflictException('Inactive current product requires review');
    }
    for (const option of listing.options) {
      if (!option.currentProductVariantId) continue;
      const variant = currentVariants.get(option.currentProductVariantId)!;
      if (!master || variant.masterProductId !== master.id) {
        throw new ConflictException('Current variant does not belong to the current product');
      }
    }
  }
  return { currentMasters };
}

async function loadOriginProducts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  listingIds: readonly string[],
): Promise<Map<string, MasterTarget>> {
  const rows = await tx.masterProduct.findMany({
    where: {
      organizationId,
      originChannelListingId: { in: [...listingIds] },
    },
    select: { id: true, isActive: true, originChannelListingId: true },
  });
  return new Map(rows.map((row) => [row.originChannelListingId!, row]));
}

async function loadExactEvidence(
  tx: Prisma.TransactionClient,
  organizationId: string,
  listings: readonly ChannelCatalogProvisioningListing[],
) {
  const options = listings.flatMap((listing) => listing.options);
  const sellerSkus = unique(options
    .map((option) => option.sellerSku?.trim())
    .filter((value): value is string => Boolean(value)));
  const barcodes = unique(options
    .map((option) => normalizeExactBarcode(option.barcode))
    .filter((value): value is string => Boolean(value)));
  const sellerRows = sellerSkus.length === 0 ? [] : await tx.productVariant.findMany({
    where: {
      organizationId,
      code: { in: sellerSkus },
      isActive: true,
      masterProduct: { isActive: true },
    },
    select: { id: true, code: true, masterProductId: true },
  });
  const barcodeRows = barcodes.length === 0 ? [] : await tx.$queryRaw<BarcodeTargetRow[]>(
    Prisma.sql`
      SELECT
        regexp_replace(trim(sku.barcode), '[ -]', '', 'g') AS "normalizedBarcode",
        variant.master_product_id AS "masterProductId",
        variant.id AS "productVariantId"
      FROM product_variant_components component
      JOIN product_variants variant
        ON variant.id = component.product_variant_id
       AND variant.organization_id = component.organization_id
      JOIN master_products product
        ON product.id = variant.master_product_id
       AND product.organization_id = variant.organization_id
      JOIN sellpia_inventory_skus sku
        ON sku.id = component.sellpia_inventory_sku_id
       AND sku.organization_id = component.organization_id
      WHERE component.organization_id = ${organizationId}::uuid
        AND variant.is_active = TRUE
        AND product.is_active = TRUE
        AND sku.is_active = TRUE
        AND sku.barcode ~ '^[0-9 -]+$'
        AND length(regexp_replace(trim(sku.barcode), '[ -]', '', 'g')) BETWEEN 8 AND 14
        AND regexp_replace(trim(sku.barcode), '[ -]', '', 'g') IN (${Prisma.join(barcodes)})
    `,
  );
  return {
    sellerByCode: groupTargets(sellerRows.map((row) => ({
      key: row.code,
      masterProductId: row.masterProductId,
      productVariantId: row.id,
    }))),
    barcodeByValue: groupTargets(barcodeRows.map((row) => ({
      key: row.normalizedBarcode,
      masterProductId: row.masterProductId,
      productVariantId: row.productVariantId,
    }))),
  };
}

type ExactEvidence = Awaited<ReturnType<typeof loadExactEvidence>>;

function exactTargetsForListing(
  listing: ChannelCatalogProvisioningListing,
  evidence: ExactEvidence,
): ExactVariantTarget[] {
  return listing.options.flatMap((option) => exactTargetsForOption(option, evidence));
}

function exactTargetsForOption(
  option: ChannelCatalogProvisioningOption,
  evidence: ExactEvidence,
): ExactVariantTarget[] {
  const sellerSku = option.sellerSku?.trim();
  const barcode = normalizeExactBarcode(option.barcode);
  return [
    ...(sellerSku ? evidence.sellerByCode.get(sellerSku) ?? [] : []),
    ...(barcode ? evidence.barcodeByValue.get(barcode) ?? [] : []),
  ];
}

function resolveProducts(
  listings: readonly ChannelCatalogProvisioningListing[],
  currentMasters: Map<string, MasterTarget>,
  origins: Map<string, MasterTarget>,
  evidence: ExactEvidence,
): ListingResolution[] {
  return listings.map((listing) => {
    const current = listing.currentMasterProductId
      ? currentMasters.get(listing.currentMasterProductId) ?? null
      : null;
    const origin = origins.get(listing.channelListingId) ?? null;
    if (!current && origin && !origin.isActive) {
      throw new ConflictException('Inactive channel-origin product requires review');
    }
    const exactId = selectUniqueMasterProduct(exactTargetsForListing(listing, evidence));
    const selected = current ?? origin ?? (exactId ? masterFromExact(exactId) : null);
    if (!selected) {
      throw new ConflictException('Channel-origin product was not created');
    }
    return {
      listing,
      masterProduct: selected,
      isOriginProduct: selected.originChannelListingId === listing.channelListingId,
    };
  });
}

function masterFromExact(id: string): MasterTarget {
  return { id, isActive: true, originChannelListingId: null };
}

async function createMissingOriginProducts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  listings: readonly ChannelCatalogProvisioningListing[],
): Promise<number> {
  if (listings.length === 0) return 0;
  const codes = listings.map((listing) => channelOriginProductCode(listing.channelListingId));
  const collisions = await tx.masterProduct.findMany({
    where: { organizationId, code: { in: codes } },
    select: { code: true, originChannelListingId: true },
  });
  if (collisions.some((row) =>
    row.originChannelListingId === null
    || channelOriginProductCode(row.originChannelListingId) !== row.code)) {
    throw new ConflictException('Channel-origin product code is already in use');
  }

  let created = 0;
  for (let offset = 0; offset < listings.length; offset += WRITE_BATCH_SIZE) {
    const batch = listings.slice(offset, offset + WRITE_BATCH_SIZE);
    const result = await tx.masterProduct.createMany({
      data: batch.map((listing) => ({
        id: randomUUID(),
        organizationId,
        originChannelListingId: listing.channelListingId,
        code: channelOriginProductCode(listing.channelListingId),
        name: listing.name,
        category: listing.category,
        brand: listing.brand,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }
  const origins = await loadOriginProducts(
    tx,
    organizationId,
    listings.map((listing) => listing.channelListingId),
  );
  if (origins.size !== listings.length) {
    throw new ConflictException('Channel-origin product code is already in use');
  }
  return created;
}

async function createMissingOriginVariants(
  tx: Prisma.TransactionClient,
  organizationId: string,
  resolutions: readonly ListingResolution[],
): Promise<number> {
  const originResolutions = resolutions.filter((resolution) => resolution.isOriginProduct);
  const originMasterIds = unique(originResolutions.map(({ masterProduct }) => masterProduct.id));
  const optionCodes = originResolutions.flatMap(({ listing }) => listing.options.map(
    (option) => channelOriginVariantCode(option.channelListingOptionId),
  ));
  if (optionCodes.length === 0) return 0;
  const existing = await tx.productVariant.findMany({
    where: {
      organizationId,
      OR: [
        { code: { in: optionCodes } },
        {
          masterProductId: { in: originMasterIds },
          isDefault: true,
          isActive: true,
        },
      ],
    },
    select: {
      id: true,
      code: true,
      isActive: true,
      isDefault: true,
      masterProductId: true,
    },
  });
  const expectedMasterByCode = new Map(originResolutions.flatMap(({ listing, masterProduct }) =>
    listing.options.map((option) => [
      channelOriginVariantCode(option.channelListingOptionId),
      masterProduct.id,
    ] as const)));
  const existingOptionVariants = existing.filter((row) => expectedMasterByCode.has(row.code));
  if (existingOptionVariants.some(
    (row) => expectedMasterByCode.get(row.code) !== row.masterProductId,
  )) {
    throw new ConflictException('Channel-origin variant code is already in use');
  }
  if (existingOptionVariants.some((row) => !row.isActive)) {
    throw new ConflictException('Inactive channel-origin variant requires review');
  }
  const existingByCode = new Map(existingOptionVariants.map((row) => [row.code, row]));
  const hasDefaultByMaster = new Map<string, boolean>();
  for (const row of existing) {
    if (row.isActive && row.isDefault) hasDefaultByMaster.set(row.masterProductId, true);
  }
  const staged = originResolutions.flatMap(({ listing, masterProduct }) =>
    listing.options.flatMap((option) => {
      const code = channelOriginVariantCode(option.channelListingOptionId);
      if (existingByCode.has(code)) return [];
      const isDefault = !hasDefaultByMaster.get(masterProduct.id);
      if (isDefault) hasDefaultByMaster.set(masterProduct.id, true);
      return [{
        id: randomUUID(),
        organizationId,
        masterProductId: masterProduct.id,
        code,
        name: option.name,
        optionLabel: option.name,
        isDefault,
      }];
    }));
  let created = 0;
  for (let offset = 0; offset < staged.length; offset += WRITE_BATCH_SIZE) {
    const result = await tx.productVariant.createMany({
      data: staged.slice(offset, offset + WRITE_BATCH_SIZE),
      skipDuplicates: true,
    });
    created += result.count;
  }
  return created;
}

async function loadOriginVariants(
  tx: Prisma.TransactionClient,
  organizationId: string,
  resolutions: readonly ListingResolution[],
): Promise<Map<string, VariantTarget>> {
  const codes = resolutions
    .filter((resolution) => resolution.isOriginProduct)
    .flatMap(({ listing }) => listing.options.map(
      (option) => channelOriginVariantCode(option.channelListingOptionId),
    ));
  if (codes.length === 0) return new Map();
  const rows = await tx.productVariant.findMany({
    where: { organizationId, code: { in: codes } },
    select: {
      id: true,
      code: true,
      isActive: true,
      isDefault: true,
      masterProductId: true,
    },
  });
  if (rows.length !== codes.length) {
    throw new ConflictException('Not every channel-origin variant was created');
  }
  return new Map(rows.map((row) => [row.code, row]));
}

function groupTargets(
  rows: readonly (ExactVariantTarget & { key: string })[],
): Map<string, ExactVariantTarget[]> {
  const result = new Map<string, ExactVariantTarget[]>();
  for (const row of rows) {
    const values = result.get(row.key) ?? [];
    values.push({
      masterProductId: row.masterProductId,
      productVariantId: row.productVariantId,
    });
    result.set(row.key, values);
  }
  return result;
}

function transactionClient(value: unknown): Prisma.TransactionClient {
  if (
    !value
    || typeof value !== 'object'
    || !('channelListing' in value)
    || !('masterProduct' in value)
    || !('$queryRaw' in value)
    || '$connect' in value
    || '$disconnect' in value
  ) {
    throw new Error('Channel catalog product provisioning requires a Prisma transaction');
  }
  return value as Prisma.TransactionClient;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function emptyResult(): ChannelCatalogProductProvisioningResult {
  return {
    listings: [],
    createdMasterProductCount: 0,
    reusedMasterProductCount: 0,
    createdVariantCount: 0,
  };
}
