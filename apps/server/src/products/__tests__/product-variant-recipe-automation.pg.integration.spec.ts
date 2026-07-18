import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ProductOperationsRepositoryAdapter } from '../adapter/out/repository/product-operations.repository.adapter';
import { ProductVariantRecipeAutomationService } from '../application/service/product-variant-recipe-automation.service';

describe('ProductVariantRecipeAutomationService (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ProductOperationsRepositoryAdapter;
  let service: ProductVariantRecipeAutomationService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new ProductOperationsRepositoryAdapter(prisma as unknown as PrismaService);
    service = new ProductVariantRecipeAutomationService(repository);
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('creates deterministic quantity-one components only for empty variants', async () => {
    const empty = await createVariant(TEST_ORGANIZATION_ID, 'EMPTY');
    const configured = await createVariant(TEST_ORGANIZATION_ID, 'CONFIGURED');
    const activeA = await createSku(TEST_ORGANIZATION_ID, 'SP-A');
    const activeB = await createSku(TEST_ORGANIZATION_ID, 'SP-B');
    const manualConfirmedAt = new Date('2026-07-18T00:00:00.000Z');
    const manual = await prisma.productVariantComponent.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      productVariantId: configured,
      sellpiaInventorySkuId: activeA,
      quantity: 2,
      source: 'manual',
      confirmedBy: TEST_USER_ID,
      confirmedAt: manualConfirmedAt,
    } });

    await expect(service.applyIfEmpty({
      organizationId: TEST_ORGANIZATION_ID,
      recipes: [
        { productVariantId: empty, sellpiaInventorySkuId: activeA, quantity: 1 },
        { productVariantId: configured, sellpiaInventorySkuId: activeB, quantity: 1 },
      ],
    })).resolves.toEqual({
      appliedProductVariantIds: [empty],
      skippedExistingProductVariantIds: [configured],
    });
    expect(await prisma.productVariantComponent.findMany({
      where: { productVariantId: empty },
    })).toEqual([expect.objectContaining({
      sellpiaInventorySkuId: activeA,
      quantity: 1,
      source: 'deterministic',
      confirmedBy: null,
    })]);
    expect(await prisma.productVariantComponent.findUniqueOrThrow({
      where: { id: manual.id },
    })).toMatchObject({
      sellpiaInventorySkuId: activeA,
      quantity: 2,
      source: 'manual',
      confirmedBy: TEST_USER_ID,
      confirmedAt: manualConfirmedAt,
    });
  });

  it('allows different variants to consume the same active Sellpia SKU', async () => {
    const first = await createVariant(TEST_ORGANIZATION_ID, 'SHARED-FIRST');
    const second = await createVariant(TEST_ORGANIZATION_ID, 'SHARED-SECOND');
    const sharedSku = await createSku(TEST_ORGANIZATION_ID, 'SP-SHARED');

    await expect(service.applyIfEmpty({
      organizationId: TEST_ORGANIZATION_ID,
      recipes: [first, second].map((productVariantId) => ({
        productVariantId,
        sellpiaInventorySkuId: sharedSku,
        quantity: 1 as const,
      })),
    })).resolves.toEqual({
      appliedProductVariantIds: [first, second].sort(),
      skippedExistingProductVariantIds: [],
    });
    await expect(prisma.productVariantComponent.findMany({
      where: { productVariantId: { in: [first, second] } },
      orderBy: { productVariantId: 'asc' },
      select: {
        productVariantId: true,
        sellpiaInventorySkuId: true,
        quantity: true,
        source: true,
      },
    })).resolves.toEqual([first, second].sort().map((productVariantId) => ({
      productVariantId,
      sellpiaInventorySkuId: sharedSku,
      quantity: 1,
      source: 'deterministic',
    })));
  });

  it('rejects foreign variants, foreign SKUs, and inactive SKUs atomically', async () => {
    const ownVariant = await createVariant(TEST_ORGANIZATION_ID, 'OWN');
    const foreignVariant = await createVariant(OTHER_ORGANIZATION_ID, 'FOREIGN');
    const active = await createSku(TEST_ORGANIZATION_ID, 'SP-ACTIVE');
    const foreignSku = await createSku(OTHER_ORGANIZATION_ID, 'SP-FOREIGN');
    const inactive = await createSku(TEST_ORGANIZATION_ID, 'SP-INACTIVE', false);

    await expect(service.applyIfEmpty({
      organizationId: TEST_ORGANIZATION_ID,
      recipes: [
        { productVariantId: ownVariant, sellpiaInventorySkuId: active, quantity: 1 },
        { productVariantId: foreignVariant, sellpiaInventorySkuId: active, quantity: 1 },
      ],
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.applyIfEmpty({
      organizationId: TEST_ORGANIZATION_ID,
      recipes: [{ productVariantId: ownVariant, sellpiaInventorySkuId: foreignSku, quantity: 1 }],
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.applyIfEmpty({
      organizationId: TEST_ORGANIZATION_ID,
      recipes: [{ productVariantId: ownVariant, sellpiaInventorySkuId: inactive, quantity: 1 }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.productVariantComponent.count({
      where: { productVariantId: ownVariant },
    })).toBe(0);
  });

  it('serializes concurrent manual replacement and deterministic create-if-empty', async () => {
    const variant = await createVariant(TEST_ORGANIZATION_ID, 'RACE');
    const deterministicSku = await createSku(TEST_ORGANIZATION_ID, 'SP-AUTO');
    const manualSku = await createSku(TEST_ORGANIZATION_ID, 'SP-MANUAL');

    const [automatic, manual] = await Promise.allSettled([
      service.applyIfEmpty({
        organizationId: TEST_ORGANIZATION_ID,
        recipes: [{ productVariantId: variant, sellpiaInventorySkuId: deterministicSku, quantity: 1 }],
      }),
      repository.replaceRecipe({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        productVariantId: variant,
        components: [{ sellpiaInventorySkuId: manualSku, quantity: 1 }],
        expectedRecipe: [],
      }),
    ]);

    const components = await prisma.productVariantComponent.findMany({
      where: { productVariantId: variant },
    });
    expect(components).toHaveLength(1);
    expect(['manual', 'deterministic']).toContain(components[0]!.source);
    expect([automatic.status, manual.status]).toContain('fulfilled');
  });

  async function createVariant(organizationId: string, label: string) {
    const master = await prisma.masterProduct.create({ data: {
      organizationId,
      code: `MP-${label}-${randomUUID()}`,
      name: label,
    } });
    const variant = await prisma.productVariant.create({ data: {
      organizationId,
      masterProductId: master.id,
      code: `PV-${label}-${randomUUID()}`,
      name: label,
    } });
    return variant.id;
  }

  async function createSku(organizationId: string, code: string, isActive = true) {
    const sku = await prisma.sellpiaInventorySku.create({ data: {
      organizationId,
      code: `${code}-${randomUUID()}`,
      name: code,
      currentStock: 10,
      isActive,
    } });
    return sku.id;
  }
});
