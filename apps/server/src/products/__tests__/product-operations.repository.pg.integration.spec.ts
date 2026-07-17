import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ProductOperationsRepositoryAdapter } from '../adapter/out/repository/product-operations.repository.adapter';
import { ProductOperationsService } from '../application/service/product-operations.service';

describe('ProductOperationsRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ProductOperationsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new ProductOperationsService(
      new ProductOperationsRepositoryAdapter(prisma as unknown as PrismaService),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('atomically creates a default variant and fences product reads by organization', async () => {
    const created = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'KI-001',
      name: 'Simple product',
    });

    expect(created.variants).toEqual([
      expect.objectContaining({
        code: 'KI-001-DEFAULT',
        isDefault: true,
        warningState: 'configuration_required',
        capacity: null,
      }),
    ]);
    expect(created.displayReference).toEqual({
      type: 'product_code',
      label: '상품 코드',
      value: 'KI-001',
    });
    await expect(service.getProduct(OTHER_ORGANIZATION_ID, created.id))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'KI-001',
      name: 'Duplicate',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.masterProduct.count({
      where: { organizationId: TEST_ORGANIZATION_ID, code: 'KI-001' },
    })).toBe(1);
  });

  it('displays the origin channel product number without replacing the internal CP code', async () => {
    const channelAccountId = randomUUID();
    await prisma.channelAccount.create({
      data: {
        id: channelAccountId,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Coupang Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        externalId: '13712531060',
      },
    });
    const internalCode = `CP-${listing.id}`;
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        originChannelListingId: listing.id,
        code: internalCode,
        name: 'Channel-origin product',
        variants: {
          create: {
            code: `CP-SKU-${randomUUID()}`,
            name: 'Channel-origin option',
            isDefault: true,
          },
        },
      },
    });
    await prisma.channelListing.update({
      where: { id: listing.id },
      data: { masterProductId: product.id },
    });
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { masterProductId: product.id },
    });
    await prisma.channelListingOption.create({
      data: {
        listingId: listing.id,
        organizationId: TEST_ORGANIZATION_ID,
        productVariantId: variant.id,
        externalOptionId: '13684204503001',
      },
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
    });
    const listItem = page.items.find((item) => item.id === product.id);
    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);

    expect(listItem).toMatchObject({
      code: internalCode,
      displayReference: {
        type: 'channel_product',
        label: 'Coupang Wing 상품번호',
        value: '13712531060',
      },
    });
    expect(detail).toMatchObject({
      code: internalCode,
      displayReference: {
        type: 'channel_product',
        label: 'Coupang Wing 상품번호',
        value: '13712531060',
      },
      variants: [{
        code: variant.code,
        displayReference: {
          type: 'channel_option',
          label: 'Coupang Wing 옵션번호',
          value: '13684204503001',
        },
      }],
    });
  });

  it('summarizes ABC grades across the full result instead of the current page', async () => {
    await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'GRADE-A-1',
      name: 'A grade one',
      abcGrade: 'A',
    });
    await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'GRADE-A-2',
      name: 'A grade two',
      abcGrade: 'A',
    });
    await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'GRADE-B-1',
      name: 'B grade one',
      abcGrade: 'B',
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 1,
      periodDays: 30,
    });

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);
    expect(page.summary.abcGradeCounts).toEqual({ A: 2, B: 1, C: 0 });
    expect(page.summary.channelConnectionCounts).toEqual({ connected: 0, unconnected: 3 });
    expect(page.summary.inventoryStatusCounts).toEqual({
      sellable: 0,
      partial_out_of_stock: 0,
      out_of_stock: 0,
      configuration_required: 3,
      review_required: 0,
    });
    expect(page.summary.negativeProfitCount).toBe(0);
  });

  it('allows organization-local codes and rejects organization-local variant collisions', async () => {
    await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'KI-SHARED',
      name: 'Test product',
      variants: [{ code: 'VAR-SHARED', name: 'Test variant' }],
    });
    await service.createProduct(OTHER_ORGANIZATION_ID, OTHER_USER_ID, {
      code: 'KI-SHARED',
      name: 'Other product',
      variants: [{ code: 'VAR-SHARED', name: 'Other variant' }],
    });

    await expect(service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'KI-002',
      name: 'Collision',
      variants: [{ code: 'VAR-SHARED', name: 'Collision' }],
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('deduplicates shared physical SKU stock while retaining variant capacities', async () => {
    const sku = await inventorySku('SP-SHARED', 7);
    const created = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'KI-BUNDLE',
      name: 'Bundle',
      variants: [
        {
          code: 'KI-BUNDLE-1',
          name: 'Single',
          components: [{ sellpiaInventorySkuId: sku.id, quantity: 1 }],
        },
        {
          code: 'KI-BUNDLE-2',
          name: 'Double',
          components: [{ sellpiaInventorySkuId: sku.id, quantity: 2 }],
        },
      ],
    });

    expect(created.inventoryUnits).toBe(7);
    expect(created.inventoryStatus).toBe('sellable');
    expect(created.variants.map((variant) => variant.capacity)).toEqual([7, 3]);
    expect(created.variants[0]?.components[0]).toMatchObject({
      sellpiaInventorySkuId: sku.id,
      source: 'manual',
      confirmedBy: TEST_USER_ID,
    });
  });

  it('replaces recipes atomically and preserves the old recipe on inactive or foreign input', async () => {
    const active = await inventorySku('SP-ACTIVE', 8);
    const inactive = await inventorySku('SP-INACTIVE', 10, false);
    const foreign = await inventorySku('SP-FOREIGN', 10, true, OTHER_ORGANIZATION_ID);
    const created = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'KI-RECIPE',
      name: 'Recipe',
    });
    const variantId = created.variants[0]!.id;

    const replaced = await service.replaceRecipe(
      TEST_ORGANIZATION_ID,
      TEST_USER_ID,
      variantId,
      { components: [{ sellpiaInventorySkuId: active.id, quantity: 3 }], expectedRecipe: [] },
    );
    expect(replaced).toMatchObject({ capacity: 2, warningState: 'none' });
    expect(replaced.components[0]?.confirmedAt).toEqual(expect.any(Date));

    await expect(service.replaceRecipe(
      TEST_ORGANIZATION_ID,
      TEST_USER_ID,
      variantId,
      { components: [{ sellpiaInventorySkuId: inactive.id, quantity: 1 }], expectedRecipe: recipeSnapshot(replaced) },
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.replaceRecipe(
      TEST_ORGANIZATION_ID,
      TEST_USER_ID,
      variantId,
      { components: [{ sellpiaInventorySkuId: foreign.id, quantity: 1 }], expectedRecipe: recipeSnapshot(replaced) },
    )).rejects.toBeInstanceOf(BadRequestException);
    await prisma.sellpiaInventorySku.update({
      where: { id: active.id },
      data: { isActive: false },
    });
    const afterInactivation = await service.getProduct(
      TEST_ORGANIZATION_ID,
      created.id,
    );
    expect(afterInactivation.variants[0]?.components.map(
      (component) => component.sellpiaInventorySkuId,
    )).toEqual([active.id]);
    expect(afterInactivation.variants[0]).toMatchObject({
      capacity: null,
      warningState: 'review_required',
    });
  });

  it('serializes competing full recipe replacements without merging component sets', async () => {
    const skuA = await inventorySku('SP-RACE-A', 9);
    const skuB = await inventorySku('SP-RACE-B', 12);
    const created = await service.createProduct(TEST_ORGANIZATION_ID, TEST_USER_ID, {
      code: 'KI-RACE',
      name: 'Concurrent recipe',
    });
    const variantId = created.variants[0]!.id;
    let releaseLock!: () => void;
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM product_variants
        WHERE id = ${variantId}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `;
      signalLocked();
      await release;
    });
    await locked;

    let settled = 0;
    const replacements = [
      service.replaceRecipe(TEST_ORGANIZATION_ID, TEST_USER_ID, variantId, {
        components: [{ sellpiaInventorySkuId: skuA.id, quantity: 1 }],
        expectedRecipe: [],
      }),
      service.replaceRecipe(TEST_ORGANIZATION_ID, TEST_USER_ID, variantId, {
        components: [{ sellpiaInventorySkuId: skuB.id, quantity: 2 }],
        expectedRecipe: [],
      }),
    ].map((promise) => promise.finally(() => { settled += 1; }));

    try {
      await prisma.$queryRaw`SELECT pg_sleep(0.1)::text AS slept`;
      expect(settled).toBe(0);
    } finally {
      releaseLock();
      await blocker;
    }
    const results = await Promise.allSettled(replacements);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')[0]).toMatchObject({
      reason: expect.any(ConflictException),
    });
    const componentIds = (await service.getProduct(TEST_ORGANIZATION_ID, created.id))
      .variants[0]!.components.map((component) => component.sellpiaInventorySkuId);
    expect([[skuA.id], [skuB.id]]).toContainEqual(componentIds);
  });

  it('keeps product metrics null without facts and aggregates linked listing facts when present', async () => {
    const withoutFacts = await service.createProduct(
      TEST_ORGANIZATION_ID,
      TEST_USER_ID,
      { code: 'KI-NULL', name: 'No facts' },
    );
    const withFacts = await service.createProduct(
      TEST_ORGANIZATION_ID,
      TEST_USER_ID,
      { code: 'KI-FACTS', name: 'With facts' },
    );
    const channelAccountId = randomUUID();
    await prisma.channelAccount.create({
      data: {
        id: channelAccountId,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        masterProductId: withFacts.id,
        externalId: 'P-001',
      },
    });
    const now = new Date();
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: now,
        trafficViews: 20,
        trafficOrders: 3,
        trafficRevenue: 40_000,
        adSpend: 5_000,
      },
    });
    await prisma.profitLoss.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        netProfit: 12_000,
      },
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
    });
    const byId = new Map(page.items.map((item) => [item.id, item]));
    expect(byId.get(withoutFacts.id)).toMatchObject({
      traffic: null,
      orderCount: null,
      salesAmount: null,
      adSpend: null,
      profit: null,
    });
    expect(byId.get(withFacts.id)).toMatchObject({
      channelCount: 1,
      traffic: 20,
      orderCount: 3,
      salesAmount: 40_000,
      adSpend: 5_000,
      profit: 12_000,
    });
  });

  function inventorySku(
    code: string,
    currentStock: number,
    isActive = true,
    organizationId = TEST_ORGANIZATION_ID,
  ) {
    return prisma.sellpiaInventorySku.create({
      data: { organizationId, code, name: code, currentStock, isActive },
    });
  }

  function recipeSnapshot(variant: { components: Array<{
    id: string;
    sellpiaInventorySkuId: string;
    quantity: number;
    source: 'manual' | 'deterministic';
    confirmedBy: string | null;
    confirmedAt: Date | string;
  }> }) {
    return variant.components.map((component) => ({
      id: component.id,
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      quantity: component.quantity,
      source: component.source,
      confirmedBy: component.confirmedBy,
      confirmedAt: component.confirmedAt,
    }));
  }
});
