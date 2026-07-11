import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
import { InventorySkuReadRepositoryAdapter } from '../../inventory/adapter/out/repository/inventory-sku-read.repository.adapter';
import { InventorySkuReadService } from '../../inventory/application/service/inventory-sku-read.service';
import { InventorySkuImportRepositoryAdapter } from '../../inventory/adapter/out/repository/inventory-sku-import.repository.adapter';
import { SellpiaInventoryImportService } from '../../inventory/application/service/sellpia-inventory-import.service';
import { ChannelsInventorySkuReadAdapter } from '../adapter/out/inventory/inventory-sku-read.adapter';
import { ChannelSkuMappingRepositoryAdapter } from '../adapter/out/repository/channel-sku-mapping.repository.adapter';
import { ChannelSkuMappingService } from '../application/service/channel-sku-mapping.service';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const OTHER_ACCOUNT = '33333333-3333-4333-8333-333333333333';

describe('ChannelSkuMappingRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ChannelSkuMappingRepositoryAdapter;
  let service: ChannelSkuMappingService;
  let inventoryImport: SellpiaInventoryImportService;
  let runA: string;
  let runB: string;
  let otherRun: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    repository = new ChannelSkuMappingRepositoryAdapter(prismaService);
    const inventoryOwner = new InventorySkuReadService(
      new InventorySkuReadRepositoryAdapter(prismaService),
    );
    service = new ChannelSkuMappingService(
      repository,
      new ChannelsInventorySkuReadAdapter(inventoryOwner),
    );
    inventoryImport = new SellpiaInventoryImportService(
      new InventorySkuImportRepositoryAdapter(prismaService),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [
        account(ACCOUNT_A, TEST_ORGANIZATION_ID, 'Wing A'),
        account(ACCOUNT_B, TEST_ORGANIZATION_ID, 'Wing B'),
        account(OTHER_ACCOUNT, OTHER_ORGANIZATION_ID, 'Other Wing'),
      ],
    });
    [runA, runB, otherRun] = await Promise.all([
      completedRun(TEST_ORGANIZATION_ID, ACCOUNT_A),
      completedRun(TEST_ORGANIZATION_ID, ACCOUNT_B),
      completedRun(OTHER_ORGANIZATION_ID, OTHER_ACCOUNT),
    ]);
  });

  it('server-pages tenant/account/search results and counts with component-derived status', async () => {
    const inventory = await createInventorySku('SP-COMP');
    const matched = await createQueueSku({
      externalProductId: 'P-NEEDLE-MATCHED',
      externalSkuId: 'S-MATCHED',
      mappingStatus: 'unmatched',
    });
    const review = await createQueueSku({
      externalProductId: 'P-NEEDLE-REVIEW',
      externalSkuId: 'S-REVIEW',
      mappingStatus: 'needs_review',
    });
    const staleLegacyMatch = await createQueueSku({
      externalProductId: 'P-NEEDLE-LEGACY-OPTION',
      externalSkuId: 'S-LEGACY-OPTION',
      mappingStatus: 'matched',
    });
    await prisma.channelSkuComponent.create({
      data: component(matched.sku.id, inventory.id, 1),
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: `M-${randomUUID()}`,
        name: 'Legacy master',
      },
    });
    const productOption = await prisma.productOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterId: master.id,
        sku: `SKU-${randomUUID()}`,
        optionName: 'Legacy option',
      },
    });
    await prisma.channelListingOption.update({
      where: { id: staleLegacyMatch.sku.id },
      data: { optionId: productOption.id },
    });
    await createQueueSku({
      channelAccountId: ACCOUNT_B,
      runId: runB,
      externalProductId: 'P-NEEDLE-ACCOUNT-B',
      externalSkuId: 'S-B',
    });
    await createQueueSku({
      organizationId: OTHER_ORGANIZATION_ID,
      channelAccountId: OTHER_ACCOUNT,
      runId: otherRun,
      externalProductId: 'P-NEEDLE-OTHER',
      externalSkuId: 'S-OTHER',
    });
    await createLegacySkuWithoutProvenance('P-NEEDLE-NO-PROVENANCE');
    const reconciliationRun = await prisma.channelReconciliationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        source: 'wing_inventory',
        status: 'completed',
      },
    });
    await prisma.channelReconciliationItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        lastSeenRunId: reconciliationRun.id,
        channel: 'coupang',
        source: 'wing_inventory',
        itemType: 'channel_option',
        itemKey: 'option:P-NEEDLE-LEGACY:S-OLD',
        externalId: 'P-NEEDLE-LEGACY',
        externalOptionId: 'S-OLD',
      },
    });

    const result = await service.list(TEST_ORGANIZATION_ID, {
      channelAccountId: ACCOUNT_A,
      mappingStatus: 'matched',
      search: '  needle  ',
      page: 1,
      limit: 1,
    });
    const unmapped = await service.list(TEST_ORGANIZATION_ID, {
      channelAccountId: ACCOUNT_A,
      mappingStatus: 'unmatched',
      search: 'needle',
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.sku.id).toBe(matched.sku.id);
    expect(result.counts).toEqual({ all: 3, unmatched: 1, needsReview: 1, matched: 1 });
    expect(unmapped.items.map((item) => item.sku.id)).toEqual([staleLegacyMatch.sku.id]);
    expect(unmapped.items[0]?.sku.mappingStatus).toBe('unmatched');
    expect(unmapped.items.some((item) => item.sku.id === review.sku.id)).toBe(false);
  });

  it('uses only sellerSku, full modelNumber, explicit option code, and normalized identifiers', async () => {
    const target = await createQueueSku({
      externalProductId: 'SP-EXTERNAL-MUST-NOT-MATCH',
      externalSkuId: 'SP-EXTERNAL-SKU-MUST-NOT-MATCH',
      registeredName: 'ordinary name',
      displayName: 'display words',
      sellerSku: 'SP-SELLER',
      modelNumber: 'SP-MODEL',
      optionName: 'ordinary words / SP-OPTION',
      barcode: '00-1234-5678',
    });
    const seller = await createInventorySku('SP-SELLER');
    const model = await createInventorySku('SP-MODEL');
    const option = await createInventorySku('SP-OPTION');
    const ambiguousA = await createInventorySku('SP-BAR-A', '0012345678');
    const ambiguousB = await createInventorySku('SP-BAR-B', '0012345678');
    await createInventorySku('SP-EXTERNAL-MUST-NOT-MATCH');
    await createInventorySku('ordinary');

    const result = await service.candidates(TEST_ORGANIZATION_ID, target.sku.id, { limit: 100 });
    const byId = new Map(result.items.map((item) => [item.inventorySkuId, item]));

    expect(result.items.slice(0, 3).map((item) => item.inventorySkuId)).toEqual([
      seller.id,
      model.id,
      option.id,
    ]);
    expect(byId.get(ambiguousA.id)?.reason).toBe('ambiguous_identifier');
    expect(byId.get(ambiguousB.id)?.reason).toBe('ambiguous_identifier');
    expect(result.items.some((item) => item.sellpiaProductCode === 'ordinary')).toBe(false);
    expect(result.items.some((item) =>
      item.sellpiaProductCode === 'SP-EXTERNAL-MUST-NOT-MATCH')).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/rawJson|externalProductId|externalSkuId/);

    const refreshed = await service.refreshStatuses(TEST_ORGANIZATION_ID, {
      channelAccountId: ACCOUNT_A,
    });
    expect(refreshed).toEqual({ all: 1, unmatched: 0, needsReview: 1, matched: 0 });
  });

  it('persists 1:1, multipack, mixed recipes, full replacement, and explicit unmapping without stock writes', async () => {
    const target = await createQueueSku({ sellerSku: 'SP-X' });
    const x = await createInventorySku('SP-X', '8801234567890', 13);
    const y = await createInventorySku('SP-Y', '8801234567891', 29);
    const stockBefore = new Map((await prisma.inventorySku.findMany()).map((row) => [
      row.id,
      row.reportedStock,
    ]));

    await service.replaceComponents(TEST_ORGANIZATION_ID, TEST_USER_ID, target.sku.id, {
      components: [{ inventorySkuId: x.id, quantity: 1 }],
    });
    expect(await componentState(target.sku.id)).toEqual([[x.id, 1]]);

    await service.replaceComponents(TEST_ORGANIZATION_ID, TEST_USER_ID, target.sku.id, {
      components: [{ inventorySkuId: x.id, quantity: 4 }],
    });
    expect(await componentState(target.sku.id)).toEqual([[x.id, 4]]);

    await service.replaceComponents(TEST_ORGANIZATION_ID, TEST_USER_ID, target.sku.id, {
      components: [
        { inventorySkuId: x.id, quantity: 1 },
        { inventorySkuId: y.id, quantity: 2 },
      ],
    });
    expect(await componentState(target.sku.id)).toEqual([[x.id, 1], [y.id, 2]]);

    await service.replaceComponents(TEST_ORGANIZATION_ID, TEST_USER_ID, target.sku.id, {
      components: [{ inventorySkuId: y.id, quantity: 3 }],
    });
    expect(await componentState(target.sku.id)).toEqual([[y.id, 3]]);

    const cleared = await service.replaceComponents(
      TEST_ORGANIZATION_ID,
      TEST_USER_ID,
      target.sku.id,
      { components: [] },
    );
    expect(cleared.components).toEqual([]);
    expect(cleared.sku.mappingStatus).toBe('needs_review');
    expect(await componentState(target.sku.id)).toEqual([]);
    const stockAfter = new Map((await prisma.inventorySku.findMany()).map((row) => [
      row.id,
      row.reportedStock,
    ]));
    expect(stockAfter).toEqual(stockBefore);
  });

  it('validates the full request and tenant InventorySku ownership before deletion', async () => {
    const target = await createQueueSku();
    const local = await createInventorySku('SP-LOCAL');
    const foreign = await createInventorySku(
      'SP-FOREIGN',
      null,
      4,
      OTHER_ORGANIZATION_ID,
    );
    await prisma.channelSkuComponent.create({
      data: component(target.sku.id, local.id, 7),
    });

    for (const input of [
      { components: [
        { inventorySkuId: local.id, quantity: 1 },
        { inventorySkuId: local.id, quantity: 2 },
      ] },
      { components: [{ inventorySkuId: local.id, quantity: -1 }] },
      { components: [{ inventorySkuId: foreign.id, quantity: 1 }] },
    ]) {
      await expect(service.replaceComponents(
        TEST_ORGANIZATION_ID,
        TEST_USER_ID,
        target.sku.id,
        input,
      )).rejects.toBeInstanceOf(BadRequestException);
      expect(await componentState(target.sku.id)).toEqual([[local.id, 7]]);
    }

    await expect(service.candidates(OTHER_ORGANIZATION_ID, target.sku.id, {}))
      .rejects.toBeInstanceOf(NotFoundException);

    await expect(repository.replaceComponents({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelSkuId: target.sku.id,
      components: [{ inventorySkuId: foreign.id, quantity: 1 }],
      mappingSource: 'manual',
      nextStatus: 'matched',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(await componentState(target.sku.id)).toEqual([[local.id, 7]]);
  });

  it('serializes concurrent full replacements into one complete recipe', async () => {
    const target = await createQueueSku();
    const a = await createInventorySku('SP-A');
    const b = await createInventorySku('SP-B');
    const c = await createInventorySku('SP-C');
    const replace = (components: Array<{ inventorySkuId: string; quantity: number }>) =>
      repository.replaceComponents({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        channelSkuId: target.sku.id,
        components,
        mappingSource: 'manual',
        nextStatus: 'matched',
      });

    await Promise.all([
      replace([{ inventorySkuId: a.id, quantity: 1 }]),
      replace([
        { inventorySkuId: b.id, quantity: 2 },
        { inventorySkuId: c.id, quantity: 3 },
      ]),
    ]);

    const final = await componentState(target.sku.id);
    expect([
      JSON.stringify([[a.id, 1]]),
      JSON.stringify([[b.id, 2], [c.id, 3]]),
    ]).toContain(JSON.stringify(final));
  });

  it('does not let advisory refresh overwrite a newly confirmed mapping', async () => {
    const target = await createQueueSku({ sellerSku: 'SP-EVIDENCE' });
    const inventory = await createInventorySku('SP-EVIDENCE');
    await prisma.channelSkuComponent.create({ data: component(target.sku.id, inventory.id, 1) });
    await prisma.channelListingOption.update({
      where: { id: target.sku.id },
      data: { mappingStatus: 'matched' },
    });

    await repository.updateUnmappedStatuses(TEST_ORGANIZATION_ID, [{
      channelSkuId: target.sku.id,
      mappingStatus: 'unmatched',
    }]);

    expect(await prisma.channelListingOption.findUniqueOrThrow({
      where: { id: target.sku.id },
    })).toMatchObject({ mappingStatus: 'matched' });
  });

  it('preserves component identity/quantity across a Sellpia metadata re-import', async () => {
    const target = await createQueueSku();
    const inventory = await createInventorySku('SP-PRESERVE', null, 2);
    const componentRow = await prisma.channelSkuComponent.create({
      data: component(target.sku.id, inventory.id, 5),
    });

    await inventoryImport.importInventory({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      fileName: 'sellpia.xlsx',
      fileHash: createHash('sha256').update('metadata-reimport').digest('hex'),
      headers: ['상품코드', '상품명', '재고'],
      rows: [{
        rowNumber: 2,
        sellpiaProductCode: 'SP-PRESERVE',
        name: 'Updated metadata',
        optionName: 'Updated option',
        barcode: '001234567890',
        reportedStock: 99,
        purchasePrice: 100,
        salePrice: 200,
        rawJson: { revision: 2 },
      }],
    });

    expect(await prisma.channelSkuComponent.findUniqueOrThrow({
      where: { id: componentRow.id },
    })).toMatchObject({
      id: componentRow.id,
      channelSkuId: target.sku.id,
      inventorySkuId: inventory.id,
      quantity: 5,
    });
  });

  function account(id: string, organizationId: string, name: string) {
    return { id, organizationId, channel: 'coupang', name, status: 'active' };
  }

  async function completedRun(organizationId: string, channelAccountId: string) {
    const run = await prisma.sourceImportRun.create({
      data: {
        organizationId,
        channelAccountId,
        sourceType: 'coupang_wing_catalog',
        fileName: 'wing.xlsx',
        fileHash: createHash('sha256').update(randomUUID()).digest('hex'),
        status: 'completed',
        rowCount: 1,
        importedAt: new Date(),
        createdBy: organizationId === TEST_ORGANIZATION_ID ? TEST_USER_ID : OTHER_USER_ID,
      },
    });
    return run.id;
  }

  async function createQueueSku(input: {
    organizationId?: string;
    channelAccountId?: string;
    runId?: string;
    externalProductId?: string;
    externalSkuId?: string;
    registeredName?: string;
    displayName?: string;
    sellerSku?: string | null;
    modelNumber?: string | null;
    optionName?: string | null;
    barcode?: string | null;
    mappingStatus?: string;
  } = {}) {
    const organizationId = input.organizationId ?? TEST_ORGANIZATION_ID;
    const channelAccountId = input.channelAccountId ?? ACCOUNT_A;
    const runId = input.runId ?? runA;
    const suffix = randomUUID();
    const listing = await prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId,
        channel: 'coupang',
        externalId: input.externalProductId ?? `P-${suffix}`,
        channelName: input.registeredName ?? 'Registered product',
        displayName: input.displayName ?? 'Display product',
        status: 'approved',
        lastImportRunId: runId,
      },
    });
    const sku = await prisma.channelListingOption.create({
      data: {
        organizationId,
        channelAccountId,
        listingId: listing.id,
        externalOptionId: input.externalSkuId ?? `S-${suffix}`,
        itemName: input.optionName ?? 'Blue',
        sellerSku: input.sellerSku ?? null,
        modelNumber: input.modelNumber ?? null,
        barcode: input.barcode ?? null,
        status: 'on_sale',
        mappingStatus: input.mappingStatus ?? 'unmatched',
        lastImportRunId: runId,
      },
    });
    return { listing, sku };
  }

  async function createLegacySkuWithoutProvenance(externalProductId: string) {
    const suffix = randomUUID();
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_A,
        channel: 'coupang',
        externalId: externalProductId,
      },
    });
    return prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_A,
        listingId: listing.id,
        externalOptionId: `LEGACY-${suffix}`,
      },
    });
  }

  async function createInventorySku(
    sellpiaProductCode: string,
    barcode: string | null = null,
    reportedStock = 1,
    organizationId = TEST_ORGANIZATION_ID,
  ) {
    return prisma.inventorySku.create({
      data: {
        organizationId,
        sellpiaProductCode,
        name: `${sellpiaProductCode} item`,
        optionName: null,
        barcode,
        reportedStock,
      },
    });
  }

  function component(channelSkuId: string, inventorySkuId: string, quantity: number) {
    return {
      organizationId: TEST_ORGANIZATION_ID,
      channelSkuId,
      inventorySkuId,
      quantity,
      mappingSource: 'manual',
      createdBy: TEST_USER_ID,
    };
  }

  async function componentState(channelSkuId: string): Promise<Array<[string, number]>> {
    const rows = await prisma.channelSkuComponent.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channelSkuId },
      orderBy: { inventorySkuId: 'asc' },
    });
    return rows.map((row) => [row.inventorySkuId, row.quantity]);
  }
});
