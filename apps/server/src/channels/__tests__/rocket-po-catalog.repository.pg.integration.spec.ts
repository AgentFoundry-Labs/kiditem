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
    const variant = await prisma.productVariant.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: master.id,
        code: 'KI-1-DEFAULT',
        name: 'Default variant',
        isDefault: true,
      },
    });
    const component = await prisma.productVariantComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        productVariantId: variant.id,
        sellpiaInventorySkuId: inventorySku.id,
        quantity: 1,
        source: 'manual',
        confirmedBy: TEST_USER_ID,
      },
    });
    await prisma.channelListing.update({
      where: { id: firstOption.listingId },
      data: { masterProductId: master.id },
    });
    await prisma.channelListingOption.update({
      where: { id: firstOption.id },
      data: { productVariantId: variant.id },
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
    })).toMatchObject({ isActive: true, productVariantId: variant.id });
    expect(await prisma.productVariantComponent.findUniqueOrThrow({
      where: { id: component.id },
    })).toMatchObject({ productVariantId: variant.id, quantity: 1 });
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
      data: { status: 'inactive' },
    });
    await expect(repository.publish(
      publishInput('d'.repeat(64), row('P-1')),
    )).rejects.toThrow(/active Rocket/i);
    expect(await prisma.sourceImportRun.count()).toBe(0);
  });

  function publishInput(hash: string, catalogRow: ReturnType<typeof row>) {
    return {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      vendorId: VENDOR_ID,
      fileName: 'rocket-po-catalog.json' as const,
      artifactHash: hash,
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
    };
  }
});
