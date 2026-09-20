import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SellpiaImportRunRepositoryAdapter } from '../adapter/out/persistence/sellpia-import-run.repository.adapter';
import { SellpiaSnapshotPublicationRepositoryAdapter } from '../adapter/out/persistence/sellpia-snapshot-publication.repository.adapter';
import { SELLPIA_INVENTORY_ALERT_DEDUPE_KEY } from '../adapter/out/persistence/sellpia-inventory-source-failure-alert';
import { SellpiaInventoryFileValidator } from '../application/usecase/sellpia-inventory-file.validator';
import { SellpiaInventoryImportService } from '../application/usecase/sellpia-inventory-import.service';
import { parseSellpiaInventoryWorkbook } from '../application/usecase/sellpia-inventory-workbook.parser';
import type { PrismaClient } from '@prisma/client';

describe('Sellpia manual inventory import (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SellpiaInventoryImportService;
  let runRepository: SellpiaImportRunRepositoryAdapter;
  let publication: SellpiaSnapshotPublicationRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as never;
    const alerts = new SourceFailureAlerts(prisma as never);
    runRepository = new SellpiaImportRunRepositoryAdapter(prismaService, alerts);
    publication = new SellpiaSnapshotPublicationRepositoryAdapter(prismaService, alerts);
    service = new SellpiaInventoryImportService(
      runRepository,
      publication,
      new SellpiaInventoryFileValidator(),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        requestedGeneration: 0n,
        verifiedGeneration: 0n,
        freshnessFence: randomUUID(),
      },
    });
  });

  it('publishes an attested manual file and replays its file hash without a second run', async () => {
    const bytes = workbook(7);
    const first = await service.importInventory(manualInput(bytes));

    expect(first).toMatchObject({
      outcome: 'published',
      duplicate: false,
      run: { verificationCount: 1 },
    });
    expect(await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: first.run.id } }))
      .toMatchObject({
        status: 'completed',
        manualFreshExportConfirmedBy: TEST_USER_ID,
      });
    const beforeReplay = await prisma.sellpiaInventorySku.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { code: 'asc' },
    });

    const replay = await service.importInventory(manualInput(bytes));
    expect(replay).toMatchObject({
      outcome: 'same_hash_verified',
      duplicate: true,
      run: { id: first.run.id, verificationCount: 2 },
    });
    expect(await prisma.sourceImportRun.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceType: 'sellpia_inventory' },
    })).toBe(1);
    expect(await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: {
        organizationId_code: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-001',
        },
      },
    })).toMatchObject({ currentStock: 7, isActive: true });
    expect(await prisma.sellpiaInventorySku.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { code: 'asc' },
    })).toEqual(beforeReplay);

    expect((await prisma.$queryRaw<Array<{ absent: boolean }>>`
      SELECT to_regclass('public.operation_runs') IS NULL AS absent
    `)[0]?.absent).toBe(true);
  });

  it('publishes physical SKUs with one canonical inventory product per source identity', async () => {
    const result = await service.importInventory(manualInput(workbook([
      row('SP-001', 7),
      row('SP-002', 3),
    ])));

    const [skus, run, masterProducts, state] = await Promise.all([
      prisma.sellpiaInventorySku.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: { code: 'asc' },
        include: { masterProduct: true },
      }),
      prisma.sourceImportRun.findUniqueOrThrow({ where: { id: result.run.id } }),
      prisma.masterProduct.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: { code: 'asc' },
      }),
      prisma.sellpiaInventoryState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
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
      failedGeneration: null,
    });
  });

  it('advances mapping generation once when a source SKU gains a confirmed listing mapping', async () => {
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

    await service.importInventory(manualInput(workbook([row('SP-MAPPING-ISOLATION', 4)])));

    const [mappingGeneration, formulaState, ownAfter, foreignAfter, listingAfter] =
      await Promise.all([
        readMappingGeneration(TEST_ORGANIZATION_ID),
        prisma.masterProductAbcFormulaState.findUniqueOrThrow({
          where: { organizationId: TEST_ORGANIZATION_ID },
        }),
        prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: ownSku.id } }),
        prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: foreignSku.id } }),
        prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }),
      ]);
    expect(mappingGeneration).toBe(1n);
    expect(formulaState).toMatchObject({
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

    await service.importInventory(manualInput(workbook([
      row('SP-MAPPING-SUMMARY-ONLY', 4),
    ])));

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
    expect(await prisma.channelListing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { masterProductId: true },
    })).toMatchObject({ masterProductId: product.id });
  });

  it('preserves mapping identity when a SKU disappears and returns', async () => {
    const codes = [
      'SP-MAPPING-ACTIVE-1',
      'SP-MAPPING-ACTIVE-2',
      'SP-MAPPING-ACTIVE-3',
      'SP-MAPPING-ACTIVE-4',
    ];
    for (const code of codes) await seedCanonicalSku(code);

    await service.importInventory(manualInput(workbook(
      codes.slice(0, 3).map((code) => row(code, 4)),
    )));
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBeNull();
    await expect(prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: codes[3] },
    })).resolves.toMatchObject({ isActive: true, currentStock: 0 });

    await service.importInventory(manualInput(workbook(codes.map((code) => row(code, 4)))));
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBeNull();
    await expect(prisma.sellpiaInventorySku.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, code: codes[3] },
    })).resolves.toMatchObject({ isActive: true, currentStock: 4 });
  });

  it('does not advance mapping generation when a later manual snapshot changes stock only', async () => {
    await service.importInventory(manualInput(workbook([
      rowWithDetails(
        'SP-MAPPING-NOOP',
        4,
        'Stable name',
        barcodeFor('SP-MAPPING-NOOP'),
        100,
        200,
      ),
    ])));
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);

    await service.importInventory(manualInput(workbook([
      rowWithDetails(
        'SP-MAPPING-NOOP',
        9,
        'Stable name',
        barcodeFor('SP-MAPPING-NOOP'),
        100,
        200,
      ),
    ])));

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
  });

  it('advances mapping generation when an existing SKU barcode identity changes', async () => {
    const code = 'SP-MAPPING-BARCODE';
    await service.importInventory(manualInput(workbook([
      rowWithBarcode(code, 4, '8801234567890'),
    ])));
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);

    await service.importInventory(manualInput(workbook([
      rowWithBarcode(code, 4, '8800987654321'),
    ])));
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(2n);
  });

  it('rolls back inventory mapping when mapping-generation overflow is detected', async () => {
    const maximum = 9_223_372_036_854_775_807n;
    await prisma.masterProductAbcFormulaState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        mappingGeneration: maximum,
      },
    });

    await expect(service.importInventory(manualInput(workbook([
      row('SP-MAPPING-ROLLBACK', 4),
    ])))).rejects.toThrow();

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

  it('keeps an absent source code with zero stock after successful publication', async () => {
    await service.importInventory(manualInput(workbook(
      Array.from({ length: 5 }, (_, index) => row(`SP-${index}`, 10)),
    )));

    const replacement = await service.importInventory(manualInput(workbook(
      Array.from({ length: 4 }, (_, index) => row(`SP-${index}`, 20)),
    )));
    const absent = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: {
        organizationId_code: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-4',
        },
      },
      include: { masterProduct: true },
    });

    expect(replacement).toMatchObject({
      outcome: 'published',
      changes: { inactivatedMasterProductCount: 0 },
    });
    expect(absent).toMatchObject({
      currentStock: 0,
      isActive: true,
      lastImportRunId: replacement.run.id,
      masterProduct: { isActive: true },
    });
  });

  it('preserves the canonical inventory product when stock returns', async () => {
    await service.importInventory(manualInput(workbook([row('SP-RESTOCK', 0)])));
    const before = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: {
        organizationId_code: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-RESTOCK',
        },
      },
      include: { masterProduct: true },
    });
    expect(before.masterProduct).toMatchObject({ isActive: true });

    await service.importInventory(manualInput(workbook([row('SP-RESTOCK', 8)])));
    const after = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { id: before.id },
      include: { masterProduct: true },
    });
    expect(after.masterProductId).toBe(before.masterProductId);
    expect(after.masterProduct).toMatchObject({ isActive: true });
  });

  it('lets an attested manual file reclaim an expired manual import lease', async () => {
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: {
        requestedGeneration: 1n,
        verifiedGeneration: 0n,
        refreshRequestedAt: new Date(Date.now() - 5 * 60_000),
        refreshReason: 'initial_snapshot',
        syncNotBefore: new Date(Date.now() - 5 * 60_000),
        activeSyncToken: randomUUID(),
        activeSyncOwnerUserId: TEST_USER_ID,
        activeSyncStartedAt: new Date(Date.now() - 5 * 60_000),
        activeSyncLeaseExpiresAt: new Date(Date.now() - 1),
        activeSyncScope: 'inventory',
        activeGeneration: 1n,
      },
    });

    const result = await service.importInventory(manualInput(workbook([
      row('SP-EXPIRED-MANUAL', 4),
    ])));
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
      verifiedGeneration: 1n,
      activeSyncToken: null,
      activeGeneration: null,
    });
  });

  it('reapplies a historical completed hash when it becomes the current snapshot again', async () => {
    const workbookB = workbook([row('SP-CYCLE', 20)]);
    const workbookA = workbook([row('SP-CYCLE', 5)]);
    const firstB = await service.importInventory(manualInput(workbookB));
    const currentA = await service.importInventory(manualInput(workbookA));

    const reappliedB = await service.importInventory(manualInput(workbookB));
    const [sku, state, runs] = await Promise.all([
      prisma.sellpiaInventorySku.findUniqueOrThrow({
        where: {
          organizationId_code: {
            organizationId: TEST_ORGANIZATION_ID,
            code: 'SP-CYCLE',
          },
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

  it('applies a complete collection despite a 30 percent decrease, retaining missing identities at zero', async () => {
    await service.importInventory(manualInput(workbook(
      Array.from({ length: 10 }, (_, index) => row(`SP-${index}`, index)),
    )));
    const before = await prisma.sellpiaInventorySku.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID }, orderBy: { code: 'asc' },
    });
    await service.importInventory(manualInput(workbook(
      Array.from({ length: 7 }, (_, index) => row(`SP-${index}`, 999)),
    )));
    const after = await prisma.sellpiaInventorySku.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID }, orderBy: { code: 'asc' },
    });
    expect(after.map(item => item.id)).toEqual(before.map(item => item.id));
    expect(after.map(item => item.currentStock)).toEqual([999,999,999,999,999,999,999,0,0,0]);
    expect(after.every(item => item.isActive)).toBe(true);
    expect(await prisma.alert.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).toBe(0);
  });

  it('applies a valid empty full collection as zero stock without deleting identities', async () => {
    await service.importInventory(manualInput(workbook([row('SP-EMPTY', 9)])));
    const before = await prisma.sellpiaInventorySku.findFirstOrThrow({ where: { organizationId: TEST_ORGANIZATION_ID } });
    const attempt = await service.beginAttempt({ organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID,
      idempotencyKey: 'empty-full-collection', scope: 'inventory', trigger: 'manual_request' });
    const completed = await service.completeAttempt({ organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID,
      attemptId: attempt.attemptId, attemptToken: attempt.attemptToken,
      file: { buffer: Buffer.from(JSON.stringify({ source: 'sellpia_product_search', version: 1, rowCount: 0, rows: [] })),
        fileName: 'empty.json', mimeType: 'application/json' } });
    expect(completed.state).toBe('COMPLETE');
    expect(await prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: before.id } }))
      .toMatchObject({ currentStock: 0, masterProductId: before.masterProductId });
  });

  it('stores stable warning identities derived from file hash and warning code', async () => {
    const bytes = workbook(['SP-WARN,,1,,,']);
    const result = await service.importInventory(manualInput(bytes));
    const codes = result.run.qualityReport?.issues.map(({ code }) => code);

    expect(codes).toEqual([
      `${sha256(bytes)}:missing_name`,
      `${sha256(bytes)}:missing_barcode`,
      `${sha256(bytes)}:missing_price`,
    ]);
  });

  it('rolls back partial publication writes and permits a manual reclaim after infrastructure failure', async () => {
    const initialBytes = workbook([row('SP-ROLLBACK', 8)]);
    const replacementBytes = workbook([row('SP-ROLLBACK', 9)]);
    const initial = await service.importInventory(manualInput(initialBytes));
    const before = await prisma.sellpiaInventorySku.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { code: 'asc' },
    });
    const fileHash = sha256(replacementBytes);
    const claim = await runRepository.claimFileRun({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      fileName: 'sellpia.csv',
      fileHash,
      execution: manualInput(replacementBytes).execution,
    });
    if (claim.kind !== 'started' || !claim.claimedExecution) {
      throw new Error('Expected a started manual file run');
    }
    const parsed = parseSellpiaInventoryWorkbook(replacementBytes);
    const rows = Array.from({ length: 501 }, (_, index) => ({
      ...parsed.rows[0]!,
      sellpiaProductCode: index === 0 ? 'SP-ROLLBACK' : `SP-ROLLBACK-${index}`,
      currentStock: index === 500 ? 2_147_483_648 : 9,
    }));
    const execution = {
      ...manualInput(replacementBytes).execution,
      ...claim.claimedExecution,
    };

    await expect(publication.publishSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      runId: claim.runId,
      attemptToken: claim.attemptToken,
      fileHash,
      execution,
      rows,
      qualityFacts: parsed.qualityFacts,
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
      activeSyncToken: claim.claimedExecution.claimToken,
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

  it('records invalid manual bytes as failed and preserves the prior completed snapshot', async () => {
    const first = await service.importInventory(manualInput(workbook(8)));
    const priorSku = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: {
        organizationId_code: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-001',
        },
      },
    });

    await expect(service.importInventory({
      ...manualInput(Buffer.from('<html>not an inventory export</html>')),
      file: {
        ...manualInput(Buffer.from('<html>not an inventory export</html>')).file,
        fileName: 'sellpia.html',
        mimeType: 'text/html',
      },
    })).rejects.toThrow();

    const failed = await prisma.sourceImportRun.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        status: 'failed',
      },
    });
    expect(failed).toMatchObject({
      errorCode: 'sellpia_invalid_workbook',
      errorMessage: 'Sellpia inventory artifact validation failed',
    });
    expect(await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { id: priorSku.id },
    })).toMatchObject({ currentStock: 8 });
    expect(await prisma.alert.findUniqueOrThrow({
      where: {
        organizationId_dedupeKey: {
          organizationId: TEST_ORGANIZATION_ID,
          dedupeKey: SELLPIA_INVENTORY_ALERT_DEDUPE_KEY,
        },
      },
    })).toMatchObject({ attemptId: failed.id, status: 'OPEN' });

    const retry = await service.importInventory(manualInput(workbook(9)));
    expect(retry.outcome).toBe('published');
    expect(await prisma.alert.findUniqueOrThrow({
      where: {
        organizationId_dedupeKey: {
          organizationId: TEST_ORGANIZATION_ID,
          dedupeKey: SELLPIA_INVENTORY_ALERT_DEDUPE_KEY,
        },
      },
    })).toMatchObject({ attemptId: retry.run.id, status: 'RESOLVED' });
    expect(await prisma.alert.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).toBe(1);
    expect(first.run.id).not.toBe(failed.id);
  });

  async function seedCanonicalSku(code: string) {
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code,
        name: code,
        barcode: barcodeFor(code),
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

  async function readMappingGeneration(organizationId: string): Promise<bigint | null> {
    const state = await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      select: { mappingGeneration: true },
    });
    return state?.mappingGeneration ?? null;
  }
});

function manualInput(buffer: Buffer) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    file: { buffer, fileName: 'sellpia.csv', mimeType: 'text/csv' },
    execution: { kind: 'manual' as const, manualFreshExportConfirmed: true as const },
  };
}

function workbook(rows: string[] | number): Buffer {
  const body = typeof rows === 'number' ? [row('SP-001', rows)] : rows;
  return Buffer.from([
    '상품코드,상품명,재고,바코드,매입가,판매가',
    ...body,
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
