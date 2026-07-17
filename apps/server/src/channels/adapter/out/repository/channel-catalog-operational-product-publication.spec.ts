import { describe, expect, it, vi } from 'vitest';
import type { ChannelCatalogProductProvisioningPort } from '../../../../products/application/port/in/channel-catalog-product-provisioning.port';
import type { ChannelCatalogIdentityProduct } from './channel-catalog-identity-upsert';
import {
  buildCatalogProductProvisioningListings,
  publishCatalogOperationalProducts,
} from './channel-catalog-operational-product-publication';

describe('buildCatalogProductProvisioningListings', () => {
  it('maps persisted identities and typed exact evidence without raw aliases', () => {
    const products: ChannelCatalogIdentityProduct[] = [{
      externalProductId: 'P-1',
      registeredName: '등록상품명',
      displayName: '노출상품명',
      category: '완구',
      manufacturer: '제조사',
      brand: '브랜드',
      productStatus: '승인완료',
      raw: { productCode: 'RAW-PRODUCT-CODE' },
      options: [{
        externalOptionId: 'O-1',
        optionName: '파랑',
        salePrice: 12_900,
        sellerSku: 'SELLER-001',
        barcode: '001234567890',
        modelNumber: null,
        skuStatus: '판매중',
        attributes: [],
        raw: { sellpiaCode: 'RAW-SELLPIA-CODE' },
      }],
    }];

    expect(buildCatalogProductProvisioningListings(products, [{
      id: 'listing-1',
      externalProductId: 'P-1',
      masterProductId: null,
      options: [{
        id: 'option-1',
        externalOptionId: 'O-1',
        productVariantId: null,
      }],
    }])).toEqual([{
      channelListingId: 'listing-1',
      currentMasterProductId: null,
      name: '등록상품명',
      category: '완구',
      brand: '브랜드',
      options: [{
        channelListingOptionId: 'option-1',
        currentProductVariantId: null,
        name: '파랑',
        sellerSku: 'SELLER-001',
        barcode: '001234567890',
      }],
    }]);
  });

  it('falls back through display and external identities for nullable names', () => {
    const products: ChannelCatalogIdentityProduct[] = [{
      externalProductId: 'P-FALLBACK',
      registeredName: null,
      displayName: null,
      category: null,
      manufacturer: null,
      brand: null,
      productStatus: null,
      raw: {},
      options: [{
        externalOptionId: 'O-SELLER',
        optionName: null,
        salePrice: null,
        sellerSku: 'SELLER-FALLBACK',
        barcode: null,
        modelNumber: null,
        skuStatus: null,
        attributes: {},
        raw: {},
      }, {
        externalOptionId: 'O-EXTERNAL',
        optionName: null,
        salePrice: null,
        sellerSku: null,
        barcode: null,
        modelNumber: null,
        skuStatus: null,
        attributes: {},
        raw: {},
      }],
    }];

    const result = buildCatalogProductProvisioningListings(products, [{
      id: 'listing-fallback',
      externalProductId: 'P-FALLBACK',
      masterProductId: null,
      options: [{
        id: 'option-seller',
        externalOptionId: 'O-SELLER',
        productVariantId: null,
      }, {
        id: 'option-external',
        externalOptionId: 'O-EXTERNAL',
        productVariantId: null,
      }],
    }]);

    expect(result[0]?.name).toBe('P-FALLBACK');
    expect(result[0]?.options.map((option) => option.name)).toEqual([
      'SELLER-FALLBACK',
      'O-EXTERNAL',
    ]);
  });
});

describe('publishCatalogOperationalProducts', () => {
  it('locks, provisions, validates, and conditionally writes product and variant links', async () => {
    const product = catalogProduct('P-1', [{ externalOptionId: 'O-1' }]);
    const persisted = persistedListing('listing-1', 'P-1', [{
      id: 'option-1',
      externalOptionId: 'O-1',
    }]);
    const transaction = transactionDouble({
      persisted: [persisted],
      selected: [{ id: 'listing-1', masterProductId: 'master-1' }],
      masters: [{ id: 'master-1' }],
      variants: [{ id: 'variant-1', masterProductId: 'master-1' }],
      rawResults: [
        [{ id: 'listing-1' }],
        [{ id: 'listing-1' }],
        [{ id: 'option-1' }],
      ],
    });
    const provisioner = provisionerDouble({
      listings: [{
        channelListingId: 'listing-1',
        masterProductId: 'master-1',
        optionLinks: [{
          channelListingOptionId: 'option-1',
          productVariantId: 'variant-1',
        }],
      }],
      createdMasterProductCount: 1,
      reusedMasterProductCount: 0,
      createdVariantCount: 1,
    });

    await expect(publishCatalogOperationalProducts(transaction as never, provisioner, {
      organizationId: 'organization-1',
      userId: 'user-1',
      products: [product],
      persistedListings: [persisted],
    })).resolves.toEqual({
      createdMasterProductCount: 1,
      reusedMasterProductCount: 0,
      createdVariantCount: 1,
      linkedProductCount: 1,
      linkedVariantCount: 1,
    });
    expect(provisioner.provision).toHaveBeenCalledWith(expect.objectContaining({
      transaction,
      organizationId: 'organization-1',
      userId: 'user-1',
    }));
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('keeps database work bounded by batches for 1,225 listings and 2,241 options', async () => {
    const products: ChannelCatalogIdentityProduct[] = [];
    const persisted = [];
    const provisionedListings = [];
    const selected = [];
    const masters = [];
    const variants = [];
    for (let index = 0; index < 1_225; index += 1) {
      const optionCount = index < 1_016 ? 2 : 1;
      const optionFacts = Array.from({ length: optionCount }, (_, optionIndex) => ({
        externalOptionId: `O-${index}-${optionIndex}`,
      }));
      const optionIdentities = optionFacts.map((option, optionIndex) => ({
        id: `option-${index}-${optionIndex}`,
        externalOptionId: option.externalOptionId,
      }));
      const masterProductId = `master-${index}`;
      products.push(catalogProduct(`P-${index}`, optionFacts));
      persisted.push(persistedListing(`listing-${index}`, `P-${index}`, optionIdentities));
      provisionedListings.push({
        channelListingId: `listing-${index}`,
        masterProductId,
        optionLinks: optionIdentities.map((option, optionIndex) => ({
          channelListingOptionId: option.id,
          productVariantId: `variant-${index}-${optionIndex}`,
        })),
      });
      selected.push({ id: `listing-${index}`, masterProductId });
      masters.push({ id: masterProductId });
      variants.push(...optionIdentities.map((_, optionIndex) => ({
        id: `variant-${index}-${optionIndex}`,
        masterProductId,
      })));
    }
    const rawResults = [
      persisted.map(({ id }) => ({ id })),
      ...[500, 500, 225].map((count) => Array.from({ length: count }, () => ({}))),
      ...[500, 500, 500, 500, 241].map((count) => Array.from({ length: count }, () => ({}))),
    ];
    const transaction = transactionDouble({
      persisted,
      selected,
      masters,
      variants,
      rawResults,
    });
    const provisioner = provisionerDouble({
      listings: provisionedListings,
      createdMasterProductCount: 1_225,
      reusedMasterProductCount: 0,
      createdVariantCount: 2_241,
    });

    const result = await publishCatalogOperationalProducts(transaction as never, provisioner, {
      organizationId: 'organization-1',
      userId: 'user-1',
      products,
      persistedListings: persisted,
    });

    expect(result.linkedProductCount).toBe(1_225);
    expect(result.linkedVariantCount).toBe(2_241);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(9);
    expect(transaction.channelListing.findMany).toHaveBeenCalledTimes(2);
    expect(transaction.masterProduct.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.productVariant.findMany).toHaveBeenCalledTimes(1);
    expect(provisioner.provision).toHaveBeenCalledTimes(1);
  });

  it('rejects a Products result whose master identity is outside the organization', async () => {
    const product = catalogProduct('P-FOREIGN', [{ externalOptionId: 'O-FOREIGN' }]);
    const persisted = persistedListing('listing-foreign', 'P-FOREIGN', [{
      id: 'option-foreign',
      externalOptionId: 'O-FOREIGN',
    }]);
    const transaction = transactionDouble({
      persisted: [persisted],
      selected: [],
      masters: [],
      variants: [],
      rawResults: [[{ id: 'listing-foreign' }]],
    });
    const provisioner = provisionerDouble({
      listings: [{
        channelListingId: 'listing-foreign',
        masterProductId: 'foreign-master',
        optionLinks: [{
          channelListingOptionId: 'option-foreign',
          productVariantId: null,
        }],
      }],
      createdMasterProductCount: 0,
      reusedMasterProductCount: 1,
      createdVariantCount: 0,
    });

    await expect(publishCatalogOperationalProducts(transaction as never, provisioner, {
      organizationId: 'organization-1',
      userId: 'user-1',
      products: [product],
      persistedListings: [persisted],
    })).rejects.toThrow('outside the organization');
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

function catalogProduct(
  externalProductId: string,
  options: Array<{ externalOptionId: string }>,
): ChannelCatalogIdentityProduct {
  return {
    externalProductId,
    registeredName: `${externalProductId} 등록상품`,
    displayName: null,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: null,
    raw: {},
    options: options.map(({ externalOptionId }) => ({
      externalOptionId,
      optionName: null,
      salePrice: null,
      sellerSku: null,
      barcode: null,
      modelNumber: null,
      skuStatus: null,
      attributes: {},
      raw: {},
    })),
  };
}

function persistedListing(
  id: string,
  externalProductId: string,
  options: Array<{ id: string; externalOptionId: string }>,
) {
  return {
    id,
    externalProductId,
    masterProductId: null,
    options: options.map((option) => ({ ...option, productVariantId: null })),
  };
}

function provisionerDouble(result: Awaited<ReturnType<ChannelCatalogProductProvisioningPort['provision']>>) {
  return {
    provision: vi.fn().mockResolvedValue(result),
  } satisfies ChannelCatalogProductProvisioningPort;
}

function transactionDouble(input: {
  persisted: unknown[];
  selected: unknown[];
  masters: unknown[];
  variants: unknown[];
  rawResults: unknown[][];
}) {
  return {
    $queryRaw: vi.fn()
      .mockImplementationOnce(() => Promise.resolve(input.rawResults[0]))
      .mockImplementationOnce(() => Promise.resolve(input.rawResults[1]))
      .mockImplementationOnce(() => Promise.resolve(input.rawResults[2]))
      .mockImplementationOnce(() => Promise.resolve(input.rawResults[3]))
      .mockImplementationOnce(() => Promise.resolve(input.rawResults[4]))
      .mockImplementationOnce(() => Promise.resolve(input.rawResults[5]))
      .mockImplementationOnce(() => Promise.resolve(input.rawResults[6]))
      .mockImplementationOnce(() => Promise.resolve(input.rawResults[7]))
      .mockImplementationOnce(() => Promise.resolve(input.rawResults[8])),
    channelListing: {
      findMany: vi.fn()
        .mockResolvedValueOnce(input.persisted.map((listing) => {
          const row = listing as ReturnType<typeof persistedListing>;
          return {
            id: row.id,
            externalId: row.externalProductId,
            masterProductId: row.masterProductId,
            options: row.options,
          };
        }))
        .mockResolvedValueOnce(input.selected),
    },
    masterProduct: { findMany: vi.fn().mockResolvedValue(input.masters) },
    productVariant: { findMany: vi.fn().mockResolvedValue(input.variants) },
  };
}
