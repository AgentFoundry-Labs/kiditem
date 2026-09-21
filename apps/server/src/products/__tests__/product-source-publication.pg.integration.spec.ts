import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ProductSourceCollectionRepositoryAdapter } from '../adapter/out/persistence/product-source-collection.repository.adapter';
import { ProductSourcePublicationRepositoryAdapter } from '../adapter/out/persistence/product-source-publication.repository.adapter';
import { SellpiaPayloadDecoderAdapter } from '../adapter/out/sellpia/sellpia-payload-decoder.adapter';
import { SellpiaPayloadValidator } from '../adapter/out/sellpia/sellpia-payload.validator';
import { SellpiaCollectionUseCase } from '../application/usecase/sellpia-collection.usecase';
import type { SellpiaCollectionAttempt } from '../application/port/in/sellpia-collection.port';

describe('Sellpia product source publication (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let collection: SellpiaCollectionUseCase;
  let alerts: SourceFailureAlerts;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    collection = new SellpiaCollectionUseCase(
      new ProductSourceCollectionRepositoryAdapter(prisma as never, alerts),
      new ProductSourcePublicationRepositoryAdapter(prisma as never, alerts),
      new SellpiaPayloadDecoderAdapter(new SellpiaPayloadValidator()),
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

  it('keeps omitted products at stock zero and accepts a null purchase price', async () => {
    const first = await begin('full-snapshot-1');
    await complete(first, [
      '상품코드,상품명,재고,매입가,바코드',
      'PRODUCT-1-RED,Product 1,7,100,880000000001',
      'PRODUCT-2-BLUE,Product 2,3,,880000000002',
    ].join('\n'));

    const second = await begin('full-snapshot-2');
    await complete(second, [
      '상품코드,상품명,재고,매입가,바코드',
      'PRODUCT-2-BLUE,Product 2 updated,4,,880000000002',
    ].join('\n'));

    const products = await prisma.masterProduct.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { sourceProductCode: 'asc' },
      select: {
        code: true,
        sourceProductCode: true,
        sourceOptionCode: true,
        name: true,
        currentStock: true,
        purchasePrice: true,
      },
    });

    expect(products).toHaveLength(2);
    expect(products).toEqual([
      expect.objectContaining({
        code: expect.stringMatching(/^KID\d{8}$/),
        sourceProductCode: 'PRODUCT-1',
        sourceOptionCode: 'RED',
        currentStock: 0,
        purchasePrice: 100,
      }),
      expect.objectContaining({
        code: expect.stringMatching(/^KID\d{8}$/),
        sourceProductCode: 'PRODUCT-2',
        sourceOptionCode: 'BLUE',
        name: 'Product 2 updated',
        currentStock: 4,
        purchasePrice: null,
      }),
    ]);
    expect(products[0]?.code).not.toBe(products[1]?.code);
  });

  it('fences an invalid terminal attempt and records its source alert atomically', async () => {
    const first = await begin('failure-baseline');
    await complete(first, [
      '상품코드,상품명,재고,매입가,바코드',
      'PRODUCT-1-RED,Product 1,7,100,880000000001',
    ].join('\n'));

    const failed = await begin('failure-invalid');
    await expect(collection.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: failed.attemptId,
      attemptToken: failed.attemptToken,
      file: {
        buffer: Buffer.from('<html>not a source snapshot</html>'),
        fileName: 'invalid.html',
        mimeType: 'text/html',
      },
    })).rejects.toThrow();

    await expect(collection.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: failed.attemptId,
      attemptToken: randomUUID(),
      file: {
        buffer: Buffer.from('상품코드,재고\nPRODUCT-1-RED,8'),
        fileName: 'stale.csv',
        mimeType: 'text/csv',
      },
    })).rejects.toThrow('ATTEMPT_FENCE_LOST');

    await expect(
      prisma.masterProduct.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceProductCode: 'PRODUCT-1',
          sourceOptionCode: 'RED',
        },
      }),
    ).resolves.toMatchObject({ currentStock: 7 });
    await expect(
      prisma.sourceImportRun.findUniqueOrThrow({ where: { id: failed.attemptId } }),
    ).resolves.toMatchObject({ status: 'failed', errorCode: 'sellpia_invalid_workbook' });
    await expect(alerts.list(TEST_ORGANIZATION_ID)).resolves.toMatchObject([
      { attemptId: failed.attemptId, status: 'OPEN', href: '/product-hub' },
    ]);
  });

  async function begin(idempotencyKey: string): Promise<SellpiaCollectionAttempt> {
    return collection.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      idempotencyKey,
      scope: 'inventory',
      trigger: 'initial_snapshot',
    });
  }

  async function complete(
    attempt: SellpiaCollectionAttempt,
    csv: string,
  ): Promise<SellpiaCollectionAttempt> {
    return collection.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      file: {
        buffer: Buffer.from(csv),
        fileName: 'sellpia.csv',
        mimeType: 'text/csv',
      },
    });
  }
});
