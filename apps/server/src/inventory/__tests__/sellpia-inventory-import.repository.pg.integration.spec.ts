import { createHash, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { ConfirmedChannelComponentReferenceRepositoryAdapter } from '../adapter/out/repository/confirmed-channel-component-reference.repository.adapter';
import { SellpiaInventoryFreshnessRepositoryAdapter } from '../adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import { SellpiaImportRunRepositoryAdapter } from '../adapter/out/repository/sellpia-import-run.repository.adapter';
import { SellpiaSnapshotPublicationRepositoryAdapter } from '../adapter/out/repository/sellpia-snapshot-publication.repository.adapter';
import { SellpiaInventoryFileValidator } from '../application/service/sellpia-inventory-file.validator';
import { SellpiaInventoryFreshnessService } from '../application/service/sellpia-inventory-freshness.service';
import { SellpiaInventoryImportService } from '../application/service/sellpia-inventory-import.service';
import { parseSellpiaInventoryWorkbook } from '../application/service/sellpia-inventory-workbook.parser';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { SellpiaImportExecution } from '../application/port/in/stock/sellpia-inventory-import.port';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

describe('Sellpia unified import repositories (PG integration)', () => {
  let prisma: PrismaClient;
  let runRepository: SellpiaImportRunRepositoryAdapter;
  let publication: SellpiaSnapshotPublicationRepositoryAdapter;
  let service: SellpiaInventoryImportService;
  let freshnessService: SellpiaInventoryFreshnessService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const alerts = new SourceFailureAlerts(new AlertsRepository(prisma as never));
    runRepository = new SellpiaImportRunRepositoryAdapter(prismaService, alerts);
    publication = new SellpiaSnapshotPublicationRepositoryAdapter(prismaService, alerts);
    freshnessService = new SellpiaInventoryFreshnessService(
      new SellpiaInventoryFreshnessRepositoryAdapter(prismaService, alerts),
    );
    service = new SellpiaInventoryImportService(
      runRepository,
      publication,
      new ConfirmedChannelComponentReferenceRepositoryAdapter(prismaService),
      new SellpiaInventoryFileValidator(),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('atomically publishes physical SKUs with one canonical inventory product each', async () => {
    const execution = await activateGeneration(1n, 'initial_snapshot');

    const result = await service.importInventory(browserInput(workbook([
      row('SP-001', 7),
      row('SP-002', 3),
    ]), execution));

    const [skus, state, run, masterProducts] = await Promise.all([
      prisma.sellpiaInventorySku.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: { code: 'asc' },
        include: { masterProduct: true },
      }),
      prisma.sellpiaInventoryState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.sourceImportRun.findUniqueOrThrow({ where: { id: result.run.id } }),
      prisma.masterProduct.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: { code: 'asc' },
      }),
    ]);
    expect(skus.map(({ code, currentStock }) => [code, currentStock])).toEqual([
      ['SP-001', 7],
      ['SP-002', 3],
    ]);
    expect(masterProducts).toHaveLength(2);
    expect(skus.every((sku) => sku.masterProductId !== null)).toBe(true);
    expect(skus.map((sku) => sku.masterProduct?.code)).toEqual(
      skus.map((sku) => `INV-SELLPIA-${sku.id}`),
    );
    expect(masterProducts.every(({ isActive }) => isActive)).toBe(true);
    expect(run).toMatchObject({
      status: 'completed',
      verificationCount: 1,
      freshnessGeneration: 1n,
      publicationSequence: 1n,
    });
    expect(state).toMatchObject({
      verifiedGeneration: 1n,
      activeGeneration: null,
      activeSyncToken: null,
      lastCompletedImportRunId: result.run.id,
      lastAttemptStatus: 'completed',
    });
    expect(await prisma.operationRun.count()).toBe(0);
    expect(await prisma.alert.count({ where: { kind: 'operation' } })).toBe(0);
  });

  it('advances mapping generation once when inventory ownership and a derived listing summary change', async () => {
    const ownSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-MAPPING-ISOLATION',
        name: 'Own mapping SKU',
      },
    });
    const foreignSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'SP-MAPPING-ISOLATION',
        name: 'Foreign mapping SKU',
      },
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Mapping account',
        externalAccountId: 'SELLPIA-MAPPING',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'SELLPIA-MAPPING-LISTING',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'SELLPIA-MAPPING-OPTION',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        sellpiaInventorySkuId: ownSku.id,
        quantity: 1,
      },
    });

    await service.importInventory(browserInput(
      workbook([row('SP-MAPPING-ISOLATION', 4)]),
      await activateGeneration(1n, 'initial_snapshot'),
    ));

    const [mappingGeneration, state, ownAfter, foreignAfter, listingAfter] = await Promise.all([
      readMappingGeneration(TEST_ORGANIZATION_ID),
      prisma.masterProductAbcFormulaState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: ownSku.id } }),
      prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: foreignSku.id } }),
      prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }),
    ]);
    expect(mappingGeneration).toBe(1n);
    expect(state).toMatchObject({
      activeFormulaVersionId: null,
      formulaRevision: 0,
      publicationRevision: 0,
      mappingGeneration: 1n,
    });
    expect(ownAfter.masterProductId).not.toBeNull();
    expect(listingAfter.masterProductId).toBe(ownAfter.masterProductId);
    expect(foreignAfter.masterProductId).toBeNull();
    expect(await readMappingGeneration(OTHER_ORGANIZATION_ID)).toBeNull();
  });

  it('does not advance mapping generation when a later inventory snapshot changes stock only', async () => {
    const first = await service.importInventory(browserInput(
      workbook([row('SP-MAPPING-NOOP', 4)]),
      await activateGeneration(1n, 'initial_snapshot'),
    ));
    expect(first.outcome).toBe('published');
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);

    await service.importInventory(browserInput(
      workbook([rowWithDetails(
        'SP-MAPPING-NOOP',
        9,
        'Updated name only',
        barcodeFor('SP-MAPPING-NOOP'),
        777,
        888,
      )]),
      await activateGeneration(2n, 'manual_request'),
    ));

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
  });

  it('treats a derived listing summary correction as a canonical mapping change', async () => {
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-MAPPING-SUMMARY-ONLY',
        name: 'Summary SKU',
        barcode: barcodeFor('SP-MAPPING-SUMMARY-ONLY'),
      },
    });
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: `INV-SELLPIA-${sku.id}`,
        name: 'Summary owner',
      },
    });
    await prisma.sellpiaInventorySku.update({
      where: { id: sku.id },
      data: { masterProductId: product.id },
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Summary account',
        externalAccountId: 'SELLPIA-SUMMARY-ONLY',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'SELLPIA-SUMMARY-ONLY-LISTING',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'SELLPIA-SUMMARY-ONLY-OPTION',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        sellpiaInventorySkuId: sku.id,
        quantity: 1,
      },
    });

    await service.importInventory(browserInput(
      workbook([row('SP-MAPPING-SUMMARY-ONLY', 4)]),
      await activateGeneration(1n, 'initial_snapshot'),
    ));

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
    expect(await prisma.channelListing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { masterProductId: true },
    })).toMatchObject({ masterProductId: product.id });
  });

  it('advances mapping generation when an existing SKU is deactivated and reactivated', async () => {
    const codes = [
      'SP-MAPPING-ACTIVE-1',
      'SP-MAPPING-ACTIVE-2',
      'SP-MAPPING-ACTIVE-3',
      'SP-MAPPING-ACTIVE-4',
    ];
    for (const code of codes) {
      await seedCanonicalSku(code);
    }

    await service.importInventory(browserInput(
      workbook(codes.slice(0, 3).map((code) => row(code, 4))),
      await activateGeneration(1n, 'initial_snapshot'),
    ));
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
    await expect(prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: codes[3] },
    })).resolves.toMatchObject({ isActive: false, currentStock: 0 });

    await service.importInventory(browserInput(
      workbook(codes.map((code) => row(code, 4))),
      await activateGeneration(2n, 'manual_request'),
    ));
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(2n);
    await expect(prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: codes[3] },
    })).resolves.toMatchObject({ isActive: true, currentStock: 4 });
  });

  it('advances mapping generation when a mapped SKU barcode identity changes', async () => {
    const code = 'SP-MAPPING-BARCODE';
    await service.importInventory(browserInput(
      workbook([rowWithBarcode(code, 4, '8801234567890')]),
      await activateGeneration(1n, 'initial_snapshot'),
    ));
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);

    await service.importInventory(browserInput(
      workbook([rowWithBarcode(code, 4, '8800987654321')]),
      await activateGeneration(2n, 'manual_request'),
    ));
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(2n);
  });

  it('rolls back inventory mapping and leaves the generation unchanged when increment overflows', async () => {
    const maximum = 9_223_372_036_854_775_807n;
    await prisma.masterProductAbcFormulaState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        mappingGeneration: maximum,
      },
    });
    const execution = await activateGeneration(1n, 'initial_snapshot');

    await expect(service.importInventory(browserInput(
      workbook([row('SP-MAPPING-ROLLBACK', 4)]),
      execution,
    ))).rejects.toThrow();

    const [skuCount, masterProductCount, state] = await Promise.all([
      prisma.sellpiaInventorySku.count({ where: { organizationId: TEST_ORGANIZATION_ID } }),
      prisma.masterProduct.count({ where: { organizationId: TEST_ORGANIZATION_ID } }),
      prisma.masterProductAbcFormulaState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ]);
    expect(skuCount).toBe(0);
    expect(masterProductCount).toBe(0);
    expect(state).toMatchObject({
      activeFormulaVersionId: null,
      formulaRevision: 0,
      publicationRevision: 0,
      mappingGeneration: maximum,
    });
  });

  it('inactivates an absent code with zero stock only after successful publication', async () => {
    await service.importInventory(browserInput(
      workbook(Array.from({ length: 5 }, (_, index) => row(`SP-${index}`, 10))),
      await activateGeneration(1n, 'initial_snapshot'),
    ));

    const replacement = await service.importInventory(browserInput(
      workbook(Array.from({ length: 4 }, (_, index) => row(`SP-${index}`, 20))),
      await activateGeneration(2n, 'manual_request'),
    ));

    const absent = await prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: 'SP-4' },
      include: { masterProduct: true },
    });
    expect(replacement).toMatchObject({
      outcome: 'published',
      changes: { inactivatedMasterProductCount: 1 },
    });
    expect(absent).toMatchObject({
      currentStock: 0,
      isActive: false,
      lastImportRunId: replacement.run.id,
      masterProduct: { isActive: false },
    });
  });

  it('reactivates the same canonical inventory product when stock returns', async () => {
    await service.importInventory(browserInput(
      workbook([row('SP-RESTOCK', 0)]),
      await activateGeneration(1n, 'initial_snapshot'),
    ));
    const before = await prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: 'SP-RESTOCK' },
      include: { masterProduct: true },
    });
    expect(before.masterProduct).toMatchObject({ isActive: false });

    await service.importInventory(browserInput(
      workbook([row('SP-RESTOCK', 8)]),
      await activateGeneration(2n, 'manual_request'),
    ));
    const after = await prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: 'SP-RESTOCK' },
      include: { masterProduct: true },
    });
    expect(after.masterProductId).toBe(before.masterProductId);
    expect(after.masterProduct).toMatchObject({ isActive: true });
  });

  it('never writes stock for the first or second completed same-hash execution', async () => {
    const bytes = workbook([row('SP-001', 7)]);
    const firstExecution = await activateGeneration(1n, 'initial_snapshot');
    const first = await service.importInventory(browserInput(bytes, firstExecution));
    const before = await prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });

    const orderExecution = await activateGeneration(2n, 'order_transmission_requested');
    const scheduled = await service.importInventory(browserInput(bytes, orderExecution));
    expect(scheduled.outcome).toBe('same_hash_confirmation_scheduled');
    expect(scheduled.run.verificationCount).toBe(1);

    const confirmationExecution = await activateGeneration(3n, 'same_hash_confirmation');
    const verified = await service.importInventory(browserInput(bytes, confirmationExecution));
    const after = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { id: before.id },
    });
    const state = await prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });

    expect(verified).toMatchObject({
      outcome: 'same_hash_verified',
      duplicate: true,
      changes: {
        createdMasterProductCount: 0,
        updatedMasterProductCount: 0,
        inactivatedMasterProductCount: 0,
      },
    });
    expect(verified.run.id).toBe(first.run.id);
    expect(verified.run.verificationCount).toBe(2);
    expect(after).toEqual(before);
    expect(await prisma.sourceImportRun.count()).toBe(1);
    expect(state).toMatchObject({ verifiedGeneration: 3n, requestedGeneration: 3n });
  });

  it('reapplies a historical completed hash when it becomes the current workbook again', async () => {
    const workbookB = workbook([row('SP-CYCLE', 20)]);
    const workbookA = workbook([row('SP-CYCLE', 5)]);
    const firstB = await service.importInventory(browserInput(
      workbookB,
      await activateGeneration(1n, 'initial_snapshot'),
    ));
    const currentA = await service.importInventory(browserInput(
      workbookA,
      await activateGeneration(2n, 'manual_request'),
    ));

    const thirdExecution = await activateGeneration(3n, 'manual_request');
    await expect(publication.verifySameHash({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      runId: firstB.run.id,
      fileHash: sha256(workbookB),
      execution: thirdExecution,
    })).rejects.toBeInstanceOf(ConflictException);

    const reappliedB = await service.importInventory(browserInput(
      workbookB,
      thirdExecution,
    ));

    const [sku, state, runs] = await Promise.all([
      prisma.sellpiaInventorySku.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-CYCLE',
        },
      }),
      prisma.sellpiaInventoryState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.sourceImportRun.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceType: 'sellpia_inventory',
        },
        orderBy: { publicationSequence: 'asc' },
      }),
    ]);

    expect(currentA.run.id).not.toBe(firstB.run.id);
    expect(reappliedB).toMatchObject({
      outcome: 'published',
      duplicate: false,
      run: {
        id: firstB.run.id,
        freshnessGeneration: '3',
      },
      changes: {
        createdMasterProductCount: 0,
        updatedMasterProductCount: 1,
        inactivatedMasterProductCount: 0,
      },
    });
    expect(sku).toMatchObject({
      currentStock: 20,
      lastImportRunId: firstB.run.id,
    });
    expect(state).toMatchObject({
      verifiedGeneration: 3n,
      lastCompletedImportRunId: firstB.run.id,
    });
    expect(runs).toHaveLength(2);
    expect(runs.map(({ publicationSequence }) => publicationSequence))
      .toEqual([2n, 3n]);
  });

  it('keeps a scheduled confirmation authoritative when an order arrives before execution', async () => {
    const bytes = workbook([row('SP-BOUNDED', 7)]);
    await service.importInventory(browserInput(
      bytes,
      await activateGeneration(1n, 'initial_snapshot'),
    ));
    await service.importInventory(browserInput(
      bytes,
      await activateGeneration(2n, 'order_transmission_requested'),
    ));
    const scheduled = await prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });

    await freshnessService.requestRefresh({
      organizationId: TEST_ORGANIZATION_ID,
      reason: 'order_transmission_requested',
    });
    const coalesced = await prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });
    expect(coalesced).toMatchObject({
      requestedGeneration: 3n,
      refreshRequestedAt: scheduled.refreshRequestedAt,
      refreshReason: 'same_hash_confirmation',
      syncNotBefore: scheduled.syncNotBefore,
    });

    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { syncNotBefore: new Date(Date.now() - 1) },
    });
    const claim = await freshnessService.claimDue({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });
    if (!claim.claimed) throw new Error('Expected confirmation generation claim');

    const verified = await service.importInventory(browserInput(bytes, {
      kind: 'browser',
      claimToken: claim.claimToken,
      activeGeneration: claim.activeGeneration,
      trigger: 'order_transmission_requested',
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
    }));
    const finalState = await prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });

    expect(verified.outcome).toBe('same_hash_verified');
    expect(finalState).toMatchObject({
      requestedGeneration: 3n,
      verifiedGeneration: 3n,
      activeGeneration: null,
    });
    expect(await prisma.sourceImportRun.count()).toBe(1);
  });

  it('preserves a newer pending generation when an active order sees the same hash', async () => {
    const bytes = workbook([row('SP-PENDING-META', 4)]);
    await service.importInventory(browserInput(
      bytes,
      await activateGeneration(1n, 'initial_snapshot'),
    ));
    const orderExecution = await activateGeneration(2n, 'order_transmission_requested');
    const pendingRequestedAt = new Date('2026-07-15T03:00:00.000Z');
    const pendingNotBefore = new Date('2026-07-15T03:05:00.000Z');
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: {
        requestedGeneration: 3n,
        refreshRequestedAt: pendingRequestedAt,
        refreshReason: 'purchase_preflight',
        syncNotBefore: pendingNotBefore,
      },
    });

    await service.importInventory(browserInput(bytes, orderExecution));

    expect(await prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toMatchObject({
      requestedGeneration: 3n,
      refreshRequestedAt: pendingRequestedAt,
      refreshReason: 'purchase_preflight',
      syncNotBefore: pendingNotBefore,
      activeGeneration: null,
    });
  });

  it('reverifies ordinary browser and manual same-hash files without stock writes', async () => {
    const bytes = workbook([row('SP-STABLE', 5)]);
    const initial = await activateGeneration(1n, 'initial_snapshot');
    await service.importInventory(browserInput(bytes, initial));
    const before = await prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });

    const ttl = await activateGeneration(2n, 'ttl_expired');
    const ttlResult = await service.importInventory(browserInput(bytes, ttl));
    const manualResult = await service.importInventory(manualInput(bytes));
    const after = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { id: before.id },
    });

    expect(ttlResult).toMatchObject({
      outcome: 'same_hash_verified',
      duplicate: true,
      run: { verificationCount: 2 },
    });
    expect(manualResult).toMatchObject({
      outcome: 'same_hash_verified',
      duplicate: true,
      run: {
        verificationCount: 3,
        manualFreshExportConfirmedBy: TEST_USER_ID,
      },
    });
    expect(manualResult.run.manualFreshExportConfirmedAt).not.toBeNull();
    expect(after).toEqual(before);
  });

  it('hard-blocks 30 percent row/code loss and preserves the completed snapshot', async () => {
    const firstExecution = await activateGeneration(1n, 'initial_snapshot');
    await service.importInventory(browserInput(
      workbook(Array.from({ length: 10 }, (_, index) => row(`SP-${index}`, index))),
      firstExecution,
    ));
    const before = await prisma.sellpiaInventorySku.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { code: 'asc' },
    });

    const secondExecution = await activateGeneration(2n, 'manual_request');
    await expect(service.importInventory(browserInput(
      workbook(Array.from({ length: 7 }, (_, index) => row(`SP-${index}`, 999))),
      secondExecution,
    ))).rejects.toThrow('quality thresholds');

    const [after, runs, state, alert] = await Promise.all([
      prisma.sellpiaInventorySku.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: { code: 'asc' },
      }),
      prisma.sourceImportRun.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.sellpiaInventoryState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.alert.findUniqueOrThrow({
        where: {
          organizationId_dedupeKey: {
            organizationId: TEST_ORGANIZATION_ID,
            dedupeKey: 'source:sellpia-inventory',
          },
        },
      }),
    ]);
    expect(after).toEqual(before);
    expect(runs.map(({ status }) => status)).toEqual(['completed', 'failed']);
    expect(runs[1]?.qualityReport).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'row_loss_threshold_exceeded' }),
        expect.objectContaining({ code: 'active_code_loss_threshold_exceeded' }),
      ]),
    });
    expect(state).toMatchObject({
      verifiedGeneration: 1n,
      failedGeneration: 2n,
      lastCompletedImportRunId: runs[0]?.id,
    });
    expect(alert).toMatchObject({
      attemptId: runs[1]?.id,
      sourceType: 'sellpia_inventory',
      status: 'OPEN',
      isRead: false,
    });
  });

  it('stores stable warning identities derived from the file hash and warning code', async () => {
    const bytes = Buffer.from([
      '상품코드,상품명,재고,바코드,매입가,판매가',
      'SP-WARN,,1,,,',
    ].join('\n'));
    const execution = await activateGeneration(1n, 'initial_snapshot');

    const result = await service.importInventory(browserInput(bytes, execution));

    const codes = result.run.qualityReport?.issues.map(({ code }) => code);
    expect(codes).toEqual([
      `${sha256(bytes)}:missing_name`,
      `${sha256(bytes)}:missing_barcode`,
      `${sha256(bytes)}:missing_price`,
    ]);
  });

  it('fences a stale generation after its file run was claimed', async () => {
    const bytes = workbook([row('SP-STALE', 1)]);
    const staleExecution = await activateGeneration(1n, 'initial_snapshot');
    const fileHash = await sha256(bytes);
    const claim = await runRepository.claimFileRun({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      fileName: 'sellpia.csv',
      fileHash,
      execution: staleExecution,
    });
    if (claim.kind !== 'started') throw new Error('Expected a started file run');
    await activateGeneration(2n, 'manual_request');
    const parsed = parseSellpiaInventoryWorkbook(bytes);

    await expect(publication.publishSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      runId: claim.runId,
      attemptToken: claim.attemptToken,
      fileHash,
      execution: staleExecution,
      rows: parsed.rows,
      qualityFacts: parsed.qualityFacts,
      confirmedReferencedProductCodes: [],
    })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.sellpiaInventorySku.count()).toBe(0);
  });

  it('verifies only the claimed generation and leaves a higher request pending', async () => {
    const execution = await activateGeneration(1n, 'initial_snapshot');
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: {
        requestedGeneration: 2n,
        refreshRequestedAt: new Date(),
        refreshReason: 'manual_request',
        syncNotBefore: new Date(),
      },
    });

    await service.importInventory(browserInput(
      workbook([row('SP-PENDING', 3)]),
      execution,
    ));

    expect(await prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toMatchObject({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: null,
      refreshReason: 'manual_request',
    });
  });

  it('rejects manual/browser collision and browser source mismatch before creating a run', async () => {
    const liveBrowser = await activateGeneration(1n, 'initial_snapshot');
    await expect(service.importInventory(manualInput(workbook([row('SP-1', 1)]))))
      .rejects.toBeInstanceOf(ConflictException);

    await expect(runRepository.claimFileRun({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      fileName: 'sellpia.csv',
      fileHash: await sha256(workbook([row('SP-2', 2)])),
      execution: {
        ...liveBrowser,
        sourceOrigin: 'https://wrong.example',
      } as never,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.sourceImportRun.count()).toBe(0);
  });

  it('lets an attested manual file reclaim an expired lease without creating source binding', async () => {
    await activateGeneration(1n, 'initial_snapshot');
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { activeSyncLeaseExpiresAt: new Date(Date.now() - 1) },
    });

    const result = await service.importInventory(manualInput(workbook([row('SP-1', 4)])));
    const [run, state] = await Promise.all([
      prisma.sourceImportRun.findUniqueOrThrow({ where: { id: result.run.id } }),
      prisma.sellpiaInventoryState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ]);
    expect(run).toMatchObject({
      manualFreshExportConfirmedBy: TEST_USER_ID,
      freshnessGeneration: 1n,
      verificationCount: 1,
    });
    expect(run.manualFreshExportConfirmedAt).not.toBeNull();
    expect(state).toMatchObject({
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      verifiedGeneration: 1n,
      activeSyncToken: null,
    });

    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await expect(service.importInventory(manualInput(workbook([row('SP-2', 2)]))))
      .rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.sellpiaInventoryState.count()).toBe(0);
  });

  it('reclaims the same running file immediately after its browser lease expires', async () => {
    const bytes = workbook([row('SP-RECLAIM', 6)]);
    const browserExecution = await activateGeneration(1n, 'initial_snapshot');
    const browserClaim = await runRepository.claimFileRun({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      fileName: 'sellpia.csv',
      fileHash: sha256(bytes),
      execution: browserExecution,
    });
    expect(browserClaim.kind).toBe('started');
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { activeSyncLeaseExpiresAt: new Date(Date.now() - 1) },
    });

    const reclaimed = await service.importInventory(manualInput(bytes));

    expect(reclaimed.outcome).toBe('published');
    expect(reclaimed.run.id).toBe(
      browserClaim.kind === 'started' ? browserClaim.runId : undefined,
    );
    expect(await prisma.sourceImportRun.count()).toBe(1);
  });

  it('records invalid downloaded bytes while preserving the previous completed basis', async () => {
    const firstExecution = await activateGeneration(1n, 'initial_snapshot');
    const first = await service.importInventory(browserInput(
      workbook([row('SP-KEEP', 8)]),
      firstExecution,
    ));
    const before = await prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });
    const invalidExecution = await activateGeneration(2n, 'manual_request');

    await expect(service.importInventory(browserInput(
      Buffer.from('<html><body>Sellpia login secret</body></html>'),
      invalidExecution,
    ))).rejects.toThrow();

    const [after, state, failed] = await Promise.all([
      prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: before.id } }),
      prisma.sellpiaInventoryState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.sourceImportRun.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          status: 'failed',
        },
      }),
    ]);
    expect(after).toEqual(before);
    expect(state).toMatchObject({
      lastCompletedImportRunId: first.run.id,
      verifiedGeneration: 1n,
      failedGeneration: 2n,
    });
    expect(failed).toMatchObject({
      errorCode: 'sellpia_invalid_workbook',
      errorMessage: 'Sellpia inventory artifact validation failed',
    });
    expect(failed.errorMessage).not.toContain('secret');
  });

  it('rolls back partial publication writes and permits reclaim after an infrastructure failure', async () => {
    const initialBytes = workbook([row('SP-ROLLBACK', 8)]);
    const replacementBytes = workbook([row('SP-ROLLBACK', 9)]);
    const initial = await service.importInventory(browserInput(
      initialBytes,
      await activateGeneration(1n, 'initial_snapshot'),
    ));
    const before = await prisma.sellpiaInventorySku.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { code: 'asc' },
    });
    const execution = await activateGeneration(2n, 'manual_request');
    const fileHash = sha256(replacementBytes);
    const claim = await runRepository.claimFileRun({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      fileName: 'sellpia.csv',
      fileHash,
      execution,
    });
    if (claim.kind !== 'started') throw new Error('Expected replacement run claim');
    const parsed = parseSellpiaInventoryWorkbook(replacementBytes);
    const rows = Array.from({ length: 501 }, (_, index) => ({
      ...parsed.rows[0]!,
      sellpiaProductCode: index === 0 ? 'SP-ROLLBACK' : `SP-ROLLBACK-${index}`,
      currentStock: index === 500 ? 2_147_483_648 : 9,
    }));

    await expect(publication.publishSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      runId: claim.runId,
      attemptToken: claim.attemptToken,
      fileHash,
      execution,
      rows,
      qualityFacts: parsed.qualityFacts,
      confirmedReferencedProductCodes: [],
    })).rejects.toThrow();

    const [afterFailure, stateAfterFailure, runAfterFailure] = await Promise.all([
      prisma.sellpiaInventorySku.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: { code: 'asc' },
      }),
      prisma.sellpiaInventoryState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.sourceImportRun.findUniqueOrThrow({ where: { id: claim.runId } }),
    ]);
    expect(afterFailure).toEqual(before);
    expect(stateAfterFailure).toMatchObject({
      lastCompletedImportRunId: initial.run.id,
      verifiedGeneration: 1n,
      activeGeneration: 2n,
      activeSyncToken: execution.claimToken,
    });
    expect(runAfterFailure.status).toBe('running');

    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { activeSyncLeaseExpiresAt: new Date(Date.now() - 1) },
    });
    const retried = await service.importInventory(manualInput(replacementBytes));
    expect(retried.outcome).toBe('published');
    expect(retried.run.id).toBe(claim.runId);
    expect((await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { id: before[0]!.id },
    })).currentStock).toBe(9);
  });

  async function activateGeneration(
    generation: bigint,
    trigger:
      | 'initial_snapshot'
      | 'ttl_expired'
      | 'manual_request'
      | 'order_transmission_requested'
      | 'same_hash_confirmation',
  ) {
    const claimToken = randomUUID();
    await prisma.sellpiaInventoryState.upsert({
      where: { organizationId: TEST_ORGANIZATION_ID },
      create: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        requestedGeneration: generation,
        verifiedGeneration: generation - 1n,
        refreshRequestedAt: new Date(),
        refreshReason: trigger,
        syncNotBefore: new Date(),
        activeSyncToken: claimToken,
        activeSyncOwnerUserId: TEST_USER_ID,
        activeSyncStartedAt: new Date(),
        activeSyncLeaseExpiresAt: new Date(Date.now() + 90_000),
        activeGeneration: generation,
        freshnessFence: randomUUID(),
      },
      update: {
        requestedGeneration: generation,
        refreshRequestedAt: new Date(),
        refreshReason: trigger,
        syncNotBefore: new Date(),
        activeSyncToken: claimToken,
        activeSyncOwnerUserId: TEST_USER_ID,
        activeSyncStartedAt: new Date(),
        activeSyncLeaseExpiresAt: new Date(Date.now() + 90_000),
        activeGeneration: generation,
        freshnessFence: randomUUID(),
      },
    });
    return {
      kind: 'browser' as const,
      claimToken,
      activeGeneration: generation.toString(),
      trigger,
      sourceOrigin: 'https://kiditem.sellpia.com' as const,
      sourceAccountKey: 'kiditem' as const,
    };
  }

  async function readMappingGeneration(organizationId: string): Promise<bigint | null> {
    const state = await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      select: { mappingGeneration: true },
    });
    return state?.mappingGeneration ?? null;
  }

  async function seedCanonicalSku(code: string) {
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code,
        name: code,
        barcode: `880${code.replace(/\D/g, '').padStart(10, '0').slice(-10)}`,
        currentStock: 5,
        isActive: true,
      },
    });
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: `INV-SELLPIA-${sku.id}`,
        name: code,
      },
    });
    return prisma.sellpiaInventorySku.update({
      where: { id: sku.id },
      data: { masterProductId: product.id },
    });
  }
});

function browserInput(
  buffer: Buffer,
  execution: Extract<SellpiaImportExecution, { kind: 'browser' }>,
) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    file: { buffer, fileName: 'sellpia.csv', mimeType: 'text/csv' },
    execution,
  };
}

function manualInput(buffer: Buffer) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    file: { buffer, fileName: 'sellpia.csv', mimeType: 'text/csv' },
    execution: { kind: 'manual' as const, manualFreshExportConfirmed: true as const },
  };
}

function workbook(rows: string[]): Buffer {
  return Buffer.from([
    '상품코드,상품명,재고,바코드,매입가,판매가',
    ...rows,
  ].join('\n'));
}

function row(code: string, stock: number): string {
  return rowWithDetails(code, stock, `상품 ${code}`, barcodeFor(code), 100, 200);
}

function rowWithBarcode(code: string, stock: number, barcode: string): string {
  return `${code},상품 ${code},${stock},${barcode},100,200`;
}

function rowWithDetails(
  code: string,
  stock: number,
  name: string,
  barcode: string,
  purchasePrice: number,
  salePrice: number,
): string {
  return `${code},${name},${stock},${barcode},${purchasePrice},${salePrice}`;
}

function barcodeFor(code: string): string {
  const digits = code.replace(/\D/g, '').padStart(10, '0').slice(-10);
  return `880${digits}`;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
