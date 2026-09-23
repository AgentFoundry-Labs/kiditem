import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { SalesProductRepositoryAdapter } from '../adapter/out/persistence/sales-product.repository.adapter';
import { RegistrationTargetRepositoryAdapter } from '../adapter/out/persistence/registration-target.repository.adapter';
import { SalesProductUseCase } from '../application/service/sales-product/sales-product.usecase';
import { productTransactionalRead } from './product-transactional-read.fake';
import { realDraftDeletionPorts } from '../../test-helpers/sales-product-draft-port';
import { realRegistrationContentWorkspace } from '../../test-helpers/registration-content-workspace';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';

/**
 * 직접 만든 판매상품(`POST /api/products/sales-products`)은 만드는 순간이 판매 결정이다 — 삽입과 KID
 * 발급이 한 트랜잭션이다(KID-313). KID 시퀀스가 없으면 아무것도 남기지 않고 503 으로 답한다.
 */
describe('sales product creation issues its KID in the same transaction (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let useCase: SalesProductUseCase;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const service = prisma as unknown as PrismaService;
    useCase = new SalesProductUseCase(new SalesProductRepositoryAdapter(
      service,
      productTransactionalRead(),
      new RegistrationTargetRepositoryAdapter(service, productTransactionalRead(), realRegistrationContentWorkspace(prisma)),
      realRegistrationContentWorkspace(prisma),
    ), ...realDraftDeletionPorts(prisma));
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  const input = (name: string) => ({
    name,
    optionAxes: ['색상'],
    options: [{ values: ['빨강'], salePrice: 4_000 }, { values: ['파랑'], salePrice: 4_500 }],
  });

  it('creates an active selling product with its KID and option codes', async () => {
    const created = await useCase.create(TEST_ORGANIZATION_ID, input('직접 만든 상품'));

    expect(created).toMatchObject({ status: 'active', code: expect.stringMatching(/^KID\d{8}$/) });
    expect(created.options.every((option) => /^KID\d{8}$/.test(option.optionCode ?? ''))).toBe(true);
  });

  it('leaves no row and answers 503 when the KID sequence is missing', async () => {
    await prisma.$executeRawUnsafe('ALTER SEQUENCE kid_item_code_seq RENAME TO kid_item_code_seq_hidden');
    try {
      await expect(useCase.create(TEST_ORGANIZATION_ID, input('코드 없이 남으면 안 되는 상품'))).rejects.toMatchObject({
        status: 503,
        message: 'kid_item_code_sequence_missing',
      });
    } finally {
      await prisma.$executeRawUnsafe('ALTER SEQUENCE kid_item_code_seq_hidden RENAME TO kid_item_code_seq');
    }

    expect(await prisma.salesProduct.count()).toBe(0);
    expect(await prisma.salesProductOption.count()).toBe(0);
  });

  it('gives concurrent creations distinct KIDs', async () => {
    const created = await Promise.all([1, 2, 3, 4].map((index) => useCase.create(TEST_ORGANIZATION_ID, input(`동시 ${index}`))));

    expect(new Set(created.map((product) => product.code)).size).toBe(4);
    expect(created.every((product) => product.status === 'active')).toBe(true);
  });

  it('opens exactly one active content workspace with every selling product it creates — direct or collected', async () => {
    const direct = await useCase.create(TEST_ORGANIZATION_ID, input('직접 만든 상품'));
    const collected = await useCase.createDraft(TEST_ORGANIZATION_ID, {
      name: '수집한 상품', optionNames: [], imageUrls: [], sourceRecordId: null, sourcePlatform: null,
    });

    for (const salesProductId of [direct.id, collected]) {
      await expect(prisma.contentWorkspace.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID, salesProductId, status: 'active', isDeleted: false },
        select: { ownerType: true, displayName: true },
      })).resolves.toEqual([expect.objectContaining({ ownerType: 'sales_product' })]);
    }
  });
});
