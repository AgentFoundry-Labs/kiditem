import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ChannelCatalogProductProvisioningRepositoryAdapter } from '../adapter/out/repository/channel-catalog-product-provisioning.repository.adapter';
import type { ChannelCatalogProvisioningListing } from '../application/port/in/channel-catalog-product-provisioning.port';
import { ChannelCatalogProductProvisioningService } from '../application/service/channel-catalog-product-provisioning.service';
import {
  channelOriginProductCode,
  channelOriginVariantCode,
} from '../domain/channel-catalog-product-resolution';

describe('ChannelCatalogProductProvisioningRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelCatalogProductProvisioningService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new ChannelCatalogProductProvisioningService(
      new ChannelCatalogProductProvisioningRepositoryAdapter(),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('creates one stable channel-origin product and variant with no recipe', async () => {
    const fixture = await channelFixture();
    const first = await provision(fixture.listing);
    const second = await provision(fixture.listing);

    expect(first).toMatchObject({
      createdMasterProductCount: 1,
      reusedMasterProductCount: 0,
      createdVariantCount: 1,
    });
    expect(second).toMatchObject({
      createdMasterProductCount: 0,
      reusedMasterProductCount: 1,
      createdVariantCount: 0,
    });
    expect(second.listings).toEqual(first.listings);

    const product = await prisma.masterProduct.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        originChannelListingId: fixture.listing.channelListingId,
      },
      include: { variants: { include: { components: true } } },
    });
    expect(product).toMatchObject({
      code: channelOriginProductCode(fixture.listing.channelListingId),
      name: '쿠팡 등록 상품',
      category: '완구',
      brand: 'KidItem',
    });
    expect(product.variants).toEqual([
      expect.objectContaining({
        code: channelOriginVariantCode(
          fixture.listing.options[0]!.channelListingOptionId,
        ),
        isDefault: true,
      }),
    ]);
    expect(product.variants[0]!.components).toEqual([]);
  });

  it('preserves operator metadata and an operator-selected default variant on replay', async () => {
    const fixture = await channelFixture();
    await provision(fixture.listing);
    const origin = await prisma.masterProduct.findFirstOrThrow({
      where: { originChannelListingId: fixture.listing.channelListingId },
      include: { variants: true },
    });
    const generatedVariant = origin.variants[0]!;
    await prisma.productVariant.update({
      where: { id: generatedVariant.id },
      data: { isDefault: false, name: '운영자 수정 옵션', optionLabel: '운영자 라벨' },
    });
    const operatorDefault = await prisma.productVariant.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: origin.id,
        code: `OPERATOR-${randomUUID()}`,
        name: '운영자 기본 옵션',
        isDefault: true,
      },
    });
    await prisma.masterProduct.update({
      where: { id: origin.id },
      data: {
        name: '운영자 상품명',
        category: '운영자 카테고리',
        brand: '운영자 브랜드',
        tags: ['operator'],
      },
    });

    const replay = await provision({
      ...fixture.listing,
      name: '수집된 새 상품명',
      category: '수집된 카테고리',
      brand: '수집된 브랜드',
      options: [
        fixture.listing.options[0]!,
        {
          channelListingOptionId: fixture.secondOptionId,
          currentProductVariantId: null,
          name: '새 수집 옵션',
          sellerSku: null,
          barcode: null,
        },
      ],
    });

    expect(replay.createdMasterProductCount).toBe(0);
    expect(replay.createdVariantCount).toBe(1);
    await expect(prisma.masterProduct.findUniqueOrThrow({
      where: { id: origin.id },
      select: { name: true, category: true, brand: true, tags: true },
    })).resolves.toEqual({
      name: '운영자 상품명',
      category: '운영자 카테고리',
      brand: '운영자 브랜드',
      tags: ['operator'],
    });
    const variants = await prisma.productVariant.findMany({
      where: { masterProductId: origin.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(variants.find((variant) => variant.id === generatedVariant.id)).toMatchObject({
      name: '운영자 수정 옵션',
      optionLabel: '운영자 라벨',
      isDefault: false,
    });
    expect(variants.find((variant) => variant.id === operatorDefault.id)?.isDefault).toBe(true);
    expect(variants.filter((variant) => variant.isDefault)).toHaveLength(1);
  });

  it('reuses only unique typed seller SKU or safe barcode evidence', async () => {
    const fixture = await channelFixture();
    const exact = await existingProduct('EXACT', 'SELLER-001', '001-2345-67890');

    const result = await provision({
      ...fixture.listing,
      options: [{
        ...fixture.listing.options[0]!,
        sellerSku: 'SELLER-001',
        barcode: '001234567890',
      }],
    });

    expect(result.listings[0]).toEqual({
      channelListingId: fixture.listing.channelListingId,
      masterProductId: exact.productId,
      optionLinks: [{
        channelListingOptionId: fixture.listing.options[0]!.channelListingOptionId,
        productVariantId: exact.variantId,
      }],
    });
    expect(result.createdMasterProductCount).toBe(0);
    expect(await prisma.masterProduct.count({
      where: { originChannelListingId: fixture.listing.channelListingId },
    })).toBe(0);
  });

  it('creates an origin identity for name-only, unsafe barcode, or conflicting exact evidence', async () => {
    const fixture = await channelFixture();
    await existingProduct('NAME', 'OTHER-SKU', null, '쿠팡 등록 상품');
    await existingProduct('CONFLICT-A', 'SELLER-CONFLICT', null);
    await existingProduct('CONFLICT-B', 'OTHER', '001234567890');

    const result = await provision({
      ...fixture.listing,
      options: [{
        ...fixture.listing.options[0]!,
        sellerSku: 'SELLER-CONFLICT',
        barcode: 'ABC001234567890XYZ',
      }, {
        channelListingOptionId: fixture.secondOptionId,
        currentProductVariantId: null,
        name: '빨강',
        sellerSku: null,
        barcode: '001234567890',
      }],
    });

    const product = await prisma.masterProduct.findFirstOrThrow({
      where: { originChannelListingId: fixture.listing.channelListingId },
    });
    expect(result.listings[0]!.masterProductId).toBe(product.id);
    expect(result.createdMasterProductCount).toBe(1);
  });

  it('preserves current links and rejects foreign, inactive, or colliding identities', async () => {
    const fixture = await channelFixture();
    const current = await existingProduct('CURRENT', 'CURRENT-SKU', null);
    await prisma.channelListing.update({
      where: { id: fixture.listing.channelListingId },
      data: { masterProductId: current.productId },
    });
    await prisma.channelListingOption.update({
      where: { id: fixture.listing.options[0]!.channelListingOptionId },
      data: { productVariantId: current.variantId },
    });

    const preserved = await provision({
      ...fixture.listing,
      currentMasterProductId: current.productId,
      options: [{
        ...fixture.listing.options[0]!,
        currentProductVariantId: current.variantId,
        sellerSku: 'DOES-NOT-MATTER',
      }],
    });
    expect(preserved.listings[0]).toMatchObject({
      masterProductId: current.productId,
      optionLinks: [{ productVariantId: current.variantId }],
    });

    const foreign = await channelFixture(OTHER_ORGANIZATION_ID);
    await expect(provision(foreign.listing)).rejects.toBeInstanceOf(ConflictException);

    const inactiveFixture = await channelFixture();
    await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        originChannelListingId: inactiveFixture.listing.channelListingId,
        code: channelOriginProductCode(inactiveFixture.listing.channelListingId),
        name: 'Inactive origin',
        isActive: false,
      },
    });
    await expect(provision(inactiveFixture.listing))
      .rejects.toBeInstanceOf(ConflictException);

    const collisionFixture = await channelFixture();
    await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: channelOriginProductCode(collisionFixture.listing.channelListingId),
        name: 'Operator collision',
      },
    });
    await expect(provision(collisionFixture.listing))
      .rejects.toBeInstanceOf(ConflictException);

    const inactiveVariantFixture = await channelFixture();
    await provision(inactiveVariantFixture.listing);
    await prisma.productVariant.updateMany({
      where: {
        code: channelOriginVariantCode(
          inactiveVariantFixture.listing.options[0]!.channelListingOptionId,
        ),
      },
      data: { isActive: false },
    });
    await expect(provision(inactiveVariantFixture.listing))
      .rejects.toThrow('Inactive channel-origin variant requires review');
  });

  it('converges concurrent direct retries onto one product and one variant', async () => {
    const fixture = await channelFixture();
    const [left, right] = await Promise.all([
      provision(fixture.listing),
      provision(fixture.listing),
    ]);

    expect(left.listings).toEqual(right.listings);
    expect(await prisma.masterProduct.count({
      where: { originChannelListingId: fixture.listing.channelListingId },
    })).toBe(1);
    expect(await prisma.productVariant.count({
      where: { code: channelOriginVariantCode(fixture.listing.options[0]!.channelListingOptionId) },
    })).toBe(1);
  });

  async function provision(listing: ChannelCatalogProvisioningListing) {
    return prisma.$transaction((transaction) => service.provision({
      transaction,
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listings: [listing],
    }));
  }

  async function channelFixture(
    organizationId = TEST_ORGANIZATION_ID,
  ): Promise<{
    listing: ChannelCatalogProvisioningListing;
    secondOptionId: string;
  }> {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId,
        channel: 'coupang',
        name: `Wing-${randomUUID()}`,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId: account.id,
        externalId: `P-${randomUUID()}`,
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listing.id,
        externalOptionId: `O-${randomUUID()}`,
      },
    });
    const secondOption = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listing.id,
        externalOptionId: `O-${randomUUID()}`,
      },
    });
    return {
      listing: {
        channelListingId: listing.id,
        currentMasterProductId: null,
        name: '쿠팡 등록 상품',
        category: '완구',
        brand: 'KidItem',
        options: [{
          channelListingOptionId: option.id,
          currentProductVariantId: null,
          name: '파랑',
          sellerSku: null,
          barcode: null,
        }],
      },
      secondOptionId: secondOption.id,
    };
  }

  async function existingProduct(
    suffix: string,
    variantCode: string,
    barcode: string | null,
    name = `Existing ${suffix}`,
  ) {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: `PRODUCT-${suffix}`,
        name,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: product.id,
        code: variantCode,
        name: `Variant ${suffix}`,
        isDefault: true,
      },
    });
    if (barcode) {
      const sku = await prisma.sellpiaInventorySku.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: `SP-${suffix}`,
          name: `Sellpia ${suffix}`,
          barcode,
          currentStock: 10,
        },
      });
      await prisma.productVariantComponent.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          productVariantId: variant.id,
          sellpiaInventorySkuId: sku.id,
          quantity: 1,
          source: 'manual',
          confirmedBy: TEST_USER_ID,
        },
      });
    }
    return { productId: product.id, variantId: variant.id };
  }
});
