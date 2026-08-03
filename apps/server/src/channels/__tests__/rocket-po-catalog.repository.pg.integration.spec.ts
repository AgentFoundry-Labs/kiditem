import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { RocketPoCatalogRepositoryAdapter } from '../adapter/out/repository/rocket-po-catalog.repository.adapter';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const VENDOR_ID = 'ROCKET-VENDOR-1';

describe('RocketPoCatalogRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: RocketPoCatalogRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new RocketPoCatalogRepositoryAdapter(
      prisma as unknown as PrismaService,
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

  it('reuses a server artifact hash and preserves identities/recipes absent later', async () => {
    const first = await repository.publish(publishInput('a'.repeat(64), row('P-1')));
    const firstOption = await prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOptionId: 'P-1' },
    });
    const inventorySku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-1',
        name: 'Sellpia component',
        currentStock: 5,
        isActive: true,
      },
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KI-1',
        name: 'KidItem product',
      },
    });
    await prisma.channelListing.update({
      where: { id: firstOption.listingId },
      data: { masterProductId: master.id },
    });
    const component = await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: firstOption.id,
        sellpiaInventorySkuId: inventorySku.id,
        quantity: 1,
      },
    });

    await repository.publish(publishInput('b'.repeat(64), row('P-2')));
    const duplicate = await repository.publish(
      publishInput('a'.repeat(64), row('P-1')),
    );

    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.run.id).toBe(first.run.id);
    expect(await prisma.sourceImportRun.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_rocket_po_catalog',
        channelAccountId: ACCOUNT_ID,
      },
    })).toBe(2);
    expect(await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, externalId: 'P-1' },
    })).toMatchObject({ isActive: true, masterProductId: master.id });
    expect(await prisma.channelListingOption.findUniqueOrThrow({
      where: { id: firstOption.id },
    })).toMatchObject({ isActive: true });
    expect(await prisma.channelListingOptionInventoryComponent.findUniqueOrThrow({
      where: { id: component.id },
    })).toMatchObject({
      channelListingOptionId: firstOption.id,
      sellpiaInventorySkuId: inventorySku.id,
      quantity: 1,
    });
  });

  it('rechecks the active organization/account/vendor boundary in publication', async () => {
    await expect(repository.findActiveRocketAccount({
      organizationId: randomUUID(),
      channelAccountId: ACCOUNT_ID,
    })).resolves.toBeNull();

    await expect(repository.publish({
      ...publishInput('c'.repeat(64), row('P-1')),
      vendorId: 'OTHER-VENDOR',
    })).rejects.toBeInstanceOf(ConflictException);

    await prisma.channelAccount.update({
      where: { id: ACCOUNT_ID },
      data: { vendorId: null },
    });
    await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Shared Wing account',
        vendorId: 'OTHER-VENDOR',
        status: 'active',
        isPrimary: true,
      },
    });
    await expect(repository.publish(
      publishInput('7'.repeat(64), row('P-SHARED-CONFLICT')),
    )).rejects.toBeInstanceOf(ConflictException);

    await prisma.channelAccount.update({
      where: { id: ACCOUNT_ID },
      data: { status: 'inactive' },
    });
    await expect(repository.publish(
      publishInput('d'.repeat(64), row('P-1')),
    )).rejects.toThrow(/active Rocket/i);
    expect(await prisma.sourceImportRun.count()).toBe(0);
  });

  it('claims a missing Rocket vendor from complete evidence exactly once', async () => {
    await prisma.channelAccount.update({
      where: { id: ACCOUNT_ID },
      data: { vendorId: null },
    });
    const wingAccount = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Shared Wing account',
        vendorId: null,
        status: 'active',
        isPrimary: true,
      },
    });

    const published = await repository.publish(
      publishInput('9'.repeat(64), row('P-FIRST-CLAIM')),
    );

    await expect(prisma.channelAccount.findUniqueOrThrow({
      where: { id: ACCOUNT_ID },
      select: { vendorId: true },
    })).resolves.toEqual({ vendorId: VENDOR_ID });
    await expect(prisma.channelAccount.findUniqueOrThrow({
      where: { id: wingAccount.id },
      select: { vendorId: true },
    })).resolves.toEqual({ vendorId: VENDOR_ID });
    await expect(prisma.rocketPoCatalogSnapshot.count({
      where: { sourceImportRunId: published.run.id },
    })).resolves.toBe(1);
    await expect(repository.publish({
      ...publishInput('8'.repeat(64), row('P-CONFLICT')),
      vendorId: 'OTHER-VENDOR',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores, lists, and reloads exact completed collection evidence inside the account boundary', async () => {
    const published = await repository.publish(
      publishInput('e'.repeat(64), row('P-SAVED')),
    );

    await expect(repository.listSavedPos({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      from: '2026-07-01',
      to: '2026-07-31',
    })).resolves.toEqual([expect.objectContaining({
      sourceImportRunId: published.run.id,
      poNumber: '1001',
      plannedDeliveryDate: '2026-07-20',
      orderQuantity: 4,
    })]);
    await expect(repository.loadSavedCollection({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      sourceImportRunId: published.run.id,
    })).resolves.toMatchObject({
      sourceImportRunId: published.run.id,
      channelAccountId: ACCOUNT_ID,
      rows: [{ productNo: 'P-SAVED', orderQty: 4 }],
    });
    await expect(repository.loadSavedCollection({
      organizationId: randomUUID(),
      channelAccountId: ACCOUNT_ID,
      sourceImportRunId: published.run.id,
    })).resolves.toBeNull();
  });

  it('replaces the previous raw snapshot after a later complete collection succeeds', async () => {
    const olderRow = {
      ...row('P-OLDER'),
      poNumber: '9001',
      plannedDeliveryDate: '2026-06-20',
    };
    const currentRow = {
      ...row('P-CURRENT'),
      poNumber: '9002',
      plannedDeliveryDate: '2026-07-20',
    };
    const older = await repository.publish(publishInput('2'.repeat(64), olderRow));
    const current = await repository.publish(publishInput('3'.repeat(64), currentRow));

    const saved = await repository.listSavedPos({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      from: '2026-06-01',
      to: '2026-07-31',
    });

    expect(saved).toEqual([
      expect.objectContaining({
        sourceImportRunId: current.run.id,
        poNumber: '9002',
        plannedDeliveryDate: '2026-07-20',
      }),
    ]);
    await expect(prisma.rocketPoCatalogSnapshot.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
      },
    })).resolves.toBe(1);
    await expect(repository.loadSavedCollection({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      sourceImportRunId: older.run.id,
    })).resolves.toBeNull();
    await expect(prisma.sourceImportRun.findUnique({
      where: { id: older.run.id },
      select: { id: true },
    })).resolves.toEqual({ id: older.run.id });
  });

  it('does not expose superseded raw snapshots through the repeated-run profile', async () => {
    const older = await repository.publish(
      publishInput('4'.repeat(64), row('P-REPEATED-OLDER')),
    );
    const current = await repository.publish(
      publishInput('5'.repeat(64), row('P-REPEATED-CURRENT')),
    );
    const scope = {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      from: '2026-07-01',
      to: '2026-07-31',
    };

    await expect(repository.listSavedPos(scope)).resolves.toEqual([
      expect.objectContaining({ sourceImportRunId: current.run.id, poNumber: '1001' }),
    ]);
    await expect(repository.listSavedPos({
      ...scope,
      includeRepeatedSnapshots: true,
    })).resolves.toEqual([
      expect.objectContaining({ sourceImportRunId: current.run.id, poNumber: '1001' }),
    ]);
    await expect(prisma.rocketPoCatalogSnapshot.findFirst({
      where: { sourceImportRunId: older.run.id },
      select: { id: true },
    })).resolves.toBeNull();
  });

  it('preserves confirmed direct mappings but never provisions products from Rocket evidence', async () => {
    const inventorySku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-BARCODE',
        name: 'Exact barcode item',
        barcode: '8801234567890',
        currentStock: 5,
        isActive: true,
      },
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KI-BARCODE',
        name: 'Exact barcode item',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        masterProductId: master.id,
        externalId: 'P-EXACT',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'P-EXACT',
        barcode: '8801234567890',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        sellpiaInventorySkuId: inventorySku.id,
        quantity: 1,
      },
    });

    await repository.publish(publishInput(
      'f'.repeat(64),
      { ...row('P-EXACT'), barcode: '8801234567890' },
    ));
    await repository.publish(publishInput('1'.repeat(64), row('P-ORIGIN')));

    await expect(prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOptionId: 'P-EXACT' },
      select: {
        listing: { select: { masterProductId: true } },
        inventoryComponents: {
          select: { sellpiaInventorySkuId: true, quantity: true },
        },
      },
    })).resolves.toEqual({
      listing: { masterProductId: master.id },
      inventoryComponents: [{ sellpiaInventorySkuId: inventorySku.id, quantity: 1 }],
    });
    const fallback = await prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOptionId: 'P-ORIGIN' },
      select: {
        listing: { select: { masterProductId: true } },
        inventoryComponents: { select: { id: true } },
      },
    });
    expect(fallback).toEqual({
      listing: { masterProductId: null },
      inventoryComponents: [],
    });
    expect(await prisma.masterProduct.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(1);
  });

  function publishInput(hash: string, catalogRow: ReturnType<typeof row>) {
    return {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      vendorId: VENDOR_ID,
      fileName: 'rocket-po-catalog.json' as const,
      artifactHash: hash,
      collection: {
        collectionRunId: randomUUID(),
        vendorId: VENDOR_ID,
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [catalogRow],
    };
  }

  function row(productNo: string) {
    return {
      poLineId: `${randomUUID()}:${productNo}:1`,
      poNumber: '1001',
      vendorId: VENDOR_ID,
      productNo,
      barcode: '',
      productName: `${productNo} item`,
      orderQty: 4,
      plannedDeliveryDate: '2026-07-20',
      confirmation: {
        center: '덕평1센터',
        inboundType: '택배',
        poStatus: '거래처확인요청',
        returnManager: '담당자',
        returnContact: '010-0000-0000',
        returnAddress: '서울시',
        purchasePrice: 1_000,
        supplyPrice: 900,
        vat: 90,
        totalPurchase: 3_960,
        poRegisteredAt: '2026-07-17 09:00:00',
        xdock: 'N',
      },
    };
  }
});
