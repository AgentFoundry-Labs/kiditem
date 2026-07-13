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
import { SellpiaMasterProductReadRepositoryAdapter } from '../../inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter';
import { SellpiaMasterProductReadService } from '../../inventory/application/service/sellpia-master-product-read.service';
import { SellpiaMasterImportRepositoryAdapter } from '../../inventory/adapter/out/repository/sellpia-master-import.repository.adapter';
import { SellpiaInventoryImportService } from '../../inventory/application/service/sellpia-inventory-import.service';
import { ChannelsSellpiaMasterProductReadAdapter } from '../adapter/out/inventory/sellpia-master-product-read.adapter';
import { ChannelSkuMappingRepositoryAdapter } from '../adapter/out/repository/channel-sku-mapping.repository.adapter';
import { ChannelSkuMappingService } from '../application/service/channel-sku-mapping.service';
import { ChannelSkuAvailabilityService } from '../application/service/channel-sku-availability.service';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const OTHER_ACCOUNT = '33333333-3333-4333-8333-333333333333';

describe('ChannelSkuMappingRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ChannelSkuMappingRepositoryAdapter;
  let service: ChannelSkuMappingService;
  let availability: ChannelSkuAvailabilityService;
  let inventoryImport: SellpiaInventoryImportService;
  let runA: string;
  let runB: string;
  let otherRun: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    repository = new ChannelSkuMappingRepositoryAdapter(prismaService);
    const inventoryOwner = new SellpiaMasterProductReadService(
      new SellpiaMasterProductReadRepositoryAdapter(prismaService),
    );
    service = new ChannelSkuMappingService(
      repository,
      new ChannelsSellpiaMasterProductReadAdapter(inventoryOwner),
    );
    availability = new ChannelSkuAvailabilityService(
      repository,
      new ChannelsSellpiaMasterProductReadAdapter(inventoryOwner),
    );
    inventoryImport = new SellpiaInventoryImportService(
      new SellpiaMasterImportRepositoryAdapter(prismaService),
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
    const byId = new Map(result.items.map((item) => [item.masterProductId, item]));

    expect(result.items.slice(0, 3).map((item) => item.masterProductId)).toEqual([
      seller.id,
      model.id,
      option.id,
    ]);
    expect(byId.get(ambiguousA.id)?.reason).toBe('ambiguous_identifier');
    expect(byId.get(ambiguousB.id)?.reason).toBe('ambiguous_identifier');
    expect(result.items.some((item) => item.code === 'ordinary')).toBe(false);
    expect(result.items.some((item) =>
      item.code === 'SP-EXTERNAL-MUST-NOT-MATCH')).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/rawJson|externalProductId|externalSkuId/);

    const refreshed = await service.refreshStatuses(TEST_ORGANIZATION_ID, {
      channelAccountId: ACCOUNT_A,
    });
    expect(refreshed).toEqual({ all: 1, unmatched: 0, needsReview: 0, matched: 1 });
    expect(await componentState(target.sku.id)).toEqual([[seller.id, 1]]);
  });

  it('persists 1:1, multipack, mixed recipes, full replacement, and explicit unmapping without stock writes', async () => {
    const target = await createQueueSku({ sellerSku: 'SP-X' });
    const x = await createInventorySku('SP-X', '8801234567890', 13);
    const y = await createInventorySku('SP-Y', '8801234567891', 29);
    const stockBefore = new Map((await prisma.inventorySku.findMany()).map((row) => [
      row.id,
      row.currentStock,
    ]));

    await service.replaceComponents(TEST_ORGANIZATION_ID, TEST_USER_ID, target.sku.id, {
      components: [{ masterProductId: x.id, quantity: 1 }],
    });
    expect(await componentState(target.sku.id)).toEqual([[x.id, 1]]);

    await service.replaceComponents(TEST_ORGANIZATION_ID, TEST_USER_ID, target.sku.id, {
      components: [{ masterProductId: x.id, quantity: 4 }],
    });
    expect(await componentState(target.sku.id)).toEqual([[x.id, 4]]);

    await service.replaceComponents(TEST_ORGANIZATION_ID, TEST_USER_ID, target.sku.id, {
      components: [
        { masterProductId: x.id, quantity: 1 },
        { masterProductId: y.id, quantity: 2 },
      ],
    });
    expect(await componentState(target.sku.id)).toEqual(sortedRecipe([
      [x.id, 1],
      [y.id, 2],
    ]));

    await service.replaceComponents(TEST_ORGANIZATION_ID, TEST_USER_ID, target.sku.id, {
      components: [{ masterProductId: y.id, quantity: 3 }],
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
      row.currentStock,
    ]));
    expect(stockAfter).toEqual(stockBefore);
  });

  it('projects tenant-scoped sellable capacity for list, SKU IDs, and listing IDs without stock writes', async () => {
    const mixed = await createQueueSku({ externalSkuId: 'S-MIXED' });
    const outOfStock = await createQueueSku({ externalSkuId: 'S-OUT' });
    const unmatched = await createQueueSku({ externalSkuId: 'S-UNMATCHED' });
    const foreign = await createQueueSku({
      organizationId: OTHER_ORGANIZATION_ID,
      channelAccountId: OTHER_ACCOUNT,
      runId: otherRun,
      externalSkuId: 'S-FOREIGN',
    });
    const x = await createInventorySku(
      'SP-CAP-X',
      null,
      12,
      TEST_ORGANIZATION_ID,
      1_000,
    );
    const y = await createInventorySku(
      'SP-CAP-Y',
      null,
      9,
      TEST_ORGANIZATION_ID,
      2_000,
    );
    const z = await createInventorySku('SP-CAP-Z', null, 0);
    await prisma.channelSkuComponent.createMany({
      data: [
        component(mixed.sku.id, x.id, 1),
        component(mixed.sku.id, y.id, 2),
        component(outOfStock.sku.id, z.id, 8),
      ],
    });
    const stockBefore = new Map((await prisma.inventorySku.findMany()).map((row) => [
      row.id,
      row.currentStock,
    ]));

    const inStock = await availability.list(TEST_ORGANIZATION_ID, {
      status: 'in_stock',
      page: 1,
      limit: 50,
    });
    const out = await availability.list(TEST_ORGANIZATION_ID, {
      status: 'out_of_stock',
      page: 1,
      limit: 50,
    });
    const bottleneckPageOne = await availability.list(TEST_ORGANIZATION_ID, {
      channelAccountId: ACCOUNT_A,
      status: 'all',
      hasBottleneck: true,
      search: 'S-',
      page: 1,
      limit: 1,
    });
    const bottleneckPageTwo = await availability.list(TEST_ORGANIZATION_ID, {
      channelAccountId: ACCOUNT_A,
      status: 'all',
      hasBottleneck: true,
      search: 'S-',
      page: 2,
      limit: 1,
    });
    const emptyBottleneckPage = await availability.list(TEST_ORGANIZATION_ID, {
      channelAccountId: ACCOUNT_A,
      status: 'all',
      hasBottleneck: true,
      search: 'S-',
      page: 3,
      limit: 1,
    });
    const bySku = await availability.findByChannelSkuIds(TEST_ORGANIZATION_ID, [
      mixed.sku.id,
      foreign.sku.id,
    ]);
    const byListing = await availability.findByListingIds(TEST_ORGANIZATION_ID, [
      mixed.listing.id,
      foreign.listing.id,
    ]);

    expect(inStock.items).toHaveLength(1);
    expect(inStock.items[0]?.sku).toMatchObject({
      id: mixed.sku.id,
      sellableStock: 4,
    });
    expect(inStock.items[0]?.components).toEqual([
      expect.objectContaining({
        masterProductId: x.id,
        purchasePrice: 1_000,
        componentCapacity: 12,
        isBottleneck: false,
      }),
      expect.objectContaining({
        masterProductId: y.id,
        purchasePrice: 2_000,
        componentCapacity: 4,
        isBottleneck: true,
      }),
    ]);
    expect(inStock.summary).toMatchObject({
      inStock: 1,
      outOfStock: 1,
      unmatched: 1,
    });
    expect(out.items.map((item) => item.sku.id)).toEqual([outOfStock.sku.id]);
    expect([
      ...bottleneckPageOne.items,
      ...bottleneckPageTwo.items,
    ].map((item) => item.sku.id).sort()).toEqual([
      mixed.sku.id,
      outOfStock.sku.id,
    ].sort());
    expect(bottleneckPageOne).toMatchObject({
      total: 2,
      page: 1,
      limit: 1,
      summary: {
        total: 2,
        inStock: 1,
        outOfStock: 1,
        unmatched: 0,
        needsReview: 0,
      },
    });
    expect(emptyBottleneckPage).toMatchObject({
      items: [],
      total: 2,
      page: 3,
      limit: 1,
      summary: bottleneckPageOne.summary,
    });
    expect(bySku.map((item) => item.sku.id)).toEqual([mixed.sku.id]);
    expect(byListing.map((item) => item.product.id)).toEqual([mixed.listing.id]);
    expect((await availability.findByChannelSkuIds(
      OTHER_ORGANIZATION_ID,
      [mixed.sku.id],
    ))).toEqual([]);
    expect(new Map((await prisma.inventorySku.findMany()).map((row) => [
      row.id,
      row.currentStock,
    ]))).toEqual(stockBefore);
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
        { masterProductId: local.id, quantity: 1 },
        { masterProductId: local.id, quantity: 2 },
      ] },
      { components: [{ masterProductId: local.id, quantity: -1 }] },
      { components: [{ masterProductId: foreign.id, quantity: 1 }] },
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
      components: [{ masterProductId: foreign.id, quantity: 1 }],
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
    const replace = (components: Array<{ masterProductId: string; quantity: number }>) =>
      repository.replaceComponents({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        channelSkuId: target.sku.id,
        components,
        mappingSource: 'manual',
        nextStatus: 'matched',
      });

    await Promise.all([
      replace([{ masterProductId: a.id, quantity: 1 }]),
      replace([
        { masterProductId: b.id, quantity: 2 },
        { masterProductId: c.id, quantity: 3 },
      ]),
    ]);

    const final = await componentState(target.sku.id);
    expect([
      JSON.stringify([[a.id, 1]]),
      JSON.stringify(sortedRecipe([[b.id, 2], [c.id, 3]])),
    ]).toContain(JSON.stringify(final));
  });

  it('does not let automatic refresh overwrite a newly confirmed mapping', async () => {
    const target = await createQueueSku({ sellerSku: 'SP-EVIDENCE' });
    const inventory = await createInventorySku('SP-EVIDENCE');
    await prisma.channelSkuComponent.create({ data: component(target.sku.id, inventory.id, 1) });
    await prisma.channelListingOption.update({
      where: { id: target.sku.id },
      data: { mappingStatus: 'matched' },
    });

    await expect(repository.applyAutomaticMatches(TEST_ORGANIZATION_ID, [{
      channelSkuId: target.sku.id,
      mappingStatus: 'unmatched',
    }])).resolves.toEqual({ applied: 0, skippedConfirmed: 1 });

    expect(await prisma.channelListingOption.findUniqueOrThrow({
      where: { id: target.sku.id },
    })).toMatchObject({ mappingStatus: 'matched' });
  });

  it('does not rewrite already-correct advisory rows during grouped refresh', async () => {
    const alreadyUnmatched = await createQueueSku({ mappingStatus: 'unmatched' });
    const alreadyReview = await createQueueSku({ mappingStatus: 'needs_review' });
    const changing = await createQueueSku({ mappingStatus: 'unmatched' });
    const sentinel = new Date('2020-01-01T00:00:00.000Z');
    await prisma.channelListingOption.updateMany({
      where: {
        id: { in: [alreadyUnmatched.sku.id, alreadyReview.sku.id, changing.sku.id] },
      },
      data: { updatedAt: sentinel },
    });

    await repository.updateUnmappedStatuses(TEST_ORGANIZATION_ID, [
      { channelSkuId: alreadyUnmatched.sku.id, mappingStatus: 'unmatched' },
      { channelSkuId: alreadyReview.sku.id, mappingStatus: 'needs_review' },
      { channelSkuId: changing.sku.id, mappingStatus: 'needs_review' },
    ]);

    const rows = await prisma.channelListingOption.findMany({
      where: {
        id: { in: [alreadyUnmatched.sku.id, alreadyReview.sku.id, changing.sku.id] },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(alreadyUnmatched.sku.id)).toMatchObject({
      mappingStatus: 'unmatched',
      updatedAt: sentinel,
    });
    expect(byId.get(alreadyReview.sku.id)).toMatchObject({
      mappingStatus: 'needs_review',
      updatedAt: sentinel,
    });
    expect(byId.get(changing.sku.id)?.mappingStatus).toBe('needs_review');
    expect(byId.get(changing.sku.id)?.updatedAt.getTime()).toBeGreaterThan(sentinel.getTime());
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
        currentStock: 99,
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
      masterProductId: inventory.id,
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
    currentStock = 1,
    organizationId = TEST_ORGANIZATION_ID,
    purchasePrice: number | null = null,
  ) {
    return prisma.$transaction(async (tx) => {
      const id = randomUUID();
      const inventory = await tx.inventorySku.create({
        data: {
          id,
          organizationId,
          sellpiaProductCode,
          name: `${sellpiaProductCode} item`,
          optionName: null,
          barcode,
          currentStock,
          purchasePrice,
        },
      });
      await tx.masterProduct.create({
        data: {
          id,
          organizationId,
          code: `SELLPIA-TEST-${randomUUID()}`,
          name: `${sellpiaProductCode} item`,
          sellpiaProductCode,
          sellpiaName: `${sellpiaProductCode} item`,
          sellpiaBarcode: barcode,
          currentStock,
          purchasePrice,
          isActive: true,
          isTemporary: true,
          temporaryReason: 'sellpia_master_cutover',
          lifecycleState: 'inventory_staged',
        },
      });
      await tx.inventorySkuMasterProductMap.create({
        data: {
          organizationId,
          inventorySkuId: id,
          masterProductId: id,
          resolution: 'shared_uuid',
        },
      });
      return inventory;
    });
  }

  function component(channelSkuId: string, inventorySkuId: string, quantity: number) {
    return {
      organizationId: TEST_ORGANIZATION_ID,
      channelSkuId,
      inventorySkuId,
      masterProductId: inventorySkuId,
      quantity,
      mappingSource: 'manual',
      createdBy: TEST_USER_ID,
    };
  }

  async function componentState(channelSkuId: string): Promise<Array<[string, number]>> {
    const rows = await prisma.channelSkuComponent.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channelSkuId },
      orderBy: { masterProductId: 'asc' },
    });
    return rows.map((row) => [row.masterProductId!, row.quantity]);
  }

  function sortedRecipe(rows: Array<[string, number]>): Array<[string, number]> {
    return [...rows].sort(([left], [right]) => left.localeCompare(right));
  }
});
