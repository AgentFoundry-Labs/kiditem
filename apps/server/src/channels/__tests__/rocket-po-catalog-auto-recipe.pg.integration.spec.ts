import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SellpiaInventorySkuReadRepositoryAdapter } from '../../inventory/adapter/out/repository/sellpia-inventory-sku-read.repository.adapter';
import { SellpiaInventorySkuReadService } from '../../inventory/application/service/sellpia-inventory-sku-read.service';
import { ChannelCatalogProductProvisioningRepositoryAdapter } from '../../products/adapter/out/repository/channel-catalog-product-provisioning.repository.adapter';
import { ProductOperationsRepositoryAdapter } from '../../products/adapter/out/repository/product-operations.repository.adapter';
import { ProductVariantRecipeAutomationService } from '../../products/application/service/product-variant-recipe-automation.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SellpiaRecipeEvidenceAdapter } from '../adapter/out/inventory/sellpia-recipe-evidence.adapter';
import { ChannelRecipeAutomationContextRepositoryAdapter } from '../adapter/out/repository/channel-recipe-automation-context.repository.adapter';
import { ChannelRecipeSuggestionContextRepositoryAdapter } from '../adapter/out/repository/channel-recipe-suggestion-context.repository.adapter';
import { RocketPoCatalogRepositoryAdapter } from '../adapter/out/repository/rocket-po-catalog.repository.adapter';
import { ChannelRecipeAutomationService } from '../application/service/channel-recipe-automation.service';
import { ChannelRecipeSuggestionService } from '../application/service/channel-recipe-suggestion.service';
import { RocketPoCatalogService } from '../application/service/rocket-po-catalog.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const VENDOR_ID = 'ROCKET-VENDOR-1';

describe('Rocket PO catalog automatic recipe (PG integration)', () => {
  let prisma: PrismaClient;
  let service: RocketPoCatalogService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const evidence = new SellpiaRecipeEvidenceAdapter(
      new SellpiaInventorySkuReadService(
        new SellpiaInventorySkuReadRepositoryAdapter(prismaService),
      ),
    );
    const recipeAutomation = new ChannelRecipeAutomationService(
      new ChannelRecipeAutomationContextRepositoryAdapter(prismaService),
      new ChannelRecipeSuggestionService(
        new ChannelRecipeSuggestionContextRepositoryAdapter(prismaService),
        evidence,
      ),
      new ProductVariantRecipeAutomationService(
        new ProductOperationsRepositoryAdapter(prismaService),
      ),
    );
    service = new RocketPoCatalogService(
      new RocketPoCatalogRepositoryAdapter(
        prismaService,
        new ChannelCatalogProductProvisioningRepositoryAdapter(),
      ),
      recipeAutomation,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'rocket',
        name: 'Rocket supplier',
        vendorId: VENDOR_ID,
        status: 'active',
      },
    });
  });

  it('creates one deterministic component for a newly published exact-name item and stays idempotent', async () => {
    const inventorySku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-ROCKET-AUTO',
        name: '로켓 자동 연결 상품',
        currentStock: 8,
        isActive: true,
      },
    });
    const firstRequest = request(randomUUID());

    const first = await service.publishAndResolve({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      request: firstRequest,
    });
    const option = await prisma.channelListingOption.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        listing: { channelAccountId: ACCOUNT_ID },
        externalOptionId: 'ROCKET-P-1',
      },
    });

    expect(first.catalog?.recipeAutomation).toMatchObject({
      evaluatedProducts: 1,
      appliedProducts: 1,
      appliedVariants: 1,
      affectedOptions: 1,
    });
    await expect(prisma.productVariantComponent.findMany({
      where: { productVariantId: option.productVariantId! },
    })).resolves.toEqual([expect.objectContaining({
      sellpiaInventorySkuId: inventorySku.id,
      quantity: 1,
      source: 'deterministic',
      confirmedBy: null,
    })]);

    const replay = await service.publishAndResolve({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      request: { ...firstRequest, collection: { ...firstRequest.collection, collectionRunId: randomUUID() } },
    });

    expect(replay.catalog).toMatchObject({
      duplicate: true,
      recipeAutomation: {
        evaluatedProducts: 1,
        appliedProducts: 0,
        appliedVariants: 0,
        affectedOptions: 0,
        operatorReviewProducts: 0,
        blockedProducts: 0,
        alreadyConfiguredProducts: 1,
        skippedExistingVariants: 0,
      },
    });
    await expect(prisma.productVariantComponent.count({
      where: { productVariantId: option.productVariantId! },
    })).resolves.toBe(1);
    await expect(prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { id: inventorySku.id },
      select: { currentStock: true },
    })).resolves.toEqual({ currentStock: 8 });
  });

  it('leaves duplicate exact-name Sellpia candidates unresolved for operator review', async () => {
    await prisma.sellpiaInventorySku.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-DUPLICATE-A',
          name: '로켓 중복 상품',
          currentStock: 5,
          isActive: true,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-DUPLICATE-B',
          name: '로켓 중복 상품',
          currentStock: 6,
          isActive: true,
        },
      ],
    });
    const input = request(randomUUID());
    input.rows[0]!.productName = '로켓 중복 상품';

    const result = await service.publishAndResolve({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      request: input,
    });
    const option = await prisma.channelListingOption.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        listing: { channelAccountId: ACCOUNT_ID },
        externalOptionId: 'ROCKET-P-1',
      },
    });

    expect(result.catalog?.recipeAutomation).toMatchObject({
      evaluatedProducts: 1,
      appliedProducts: 0,
      appliedVariants: 0,
    });
    expect(
      (result.catalog?.recipeAutomation.operatorReviewProducts ?? 0)
      + (result.catalog?.recipeAutomation.blockedProducts ?? 0),
    ).toBe(1);
    await expect(prisma.productVariantComponent.count({
      where: { productVariantId: option.productVariantId! },
    })).resolves.toBe(0);
  });
});

function request(collectionRunId: string) {
  return {
    channelAccountId: ACCOUNT_ID,
    collection: {
      collectionRunId,
      vendorId: VENDOR_ID,
      listPagesRead: 1,
      totalListPages: 1,
      truncated: false,
      detailPoCount: 1,
      failedPoNumbers: [],
    },
    rows: [{
      poLineId: '1001:ROCKET-P-1::1',
      poNumber: '1001',
      vendorId: VENDOR_ID,
      productNo: 'ROCKET-P-1',
      barcode: '',
      productName: '로켓 자동 연결 상품',
      orderQty: 4,
      plannedDeliveryDate: '2026-07-20',
    }],
    editedQuantities: {},
  };
}
