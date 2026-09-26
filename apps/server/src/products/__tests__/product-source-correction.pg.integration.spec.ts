import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductOperationsRepositoryAdapter } from '../adapter/out/persistence/product-operations.repository.adapter';
import { CorrectProductSourceBindingUseCase } from '../application/service/correct-product-source-binding.usecase';
import type { ProductQueryPort } from '../application/port/in/product-query.port';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../channels/adapter/out/credentials/channel-credentials.adapter';
import { ChannelsProductMappingGenerationAdapter } from "../../channels/adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../adapter/out/persistence/product-mapping-generation.repository.adapter";

describe('product source correction (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: ProductOperationsRepositoryAdapter;
  let usecase: CorrectProductSourceBindingUseCase;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new ProductOperationsRepositoryAdapter(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      new ChannelAccountService(
        new ChannelAccountPersistenceAdapter(prisma as unknown as PrismaService, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
        new ChannelCredentialsAdapter(),
      ),
    );
    const query = {
      getProduct: (organizationId: string, id: string) => prisma.masterProduct.findFirstOrThrow({ where: { id, organizationId } }),
    } as unknown as ProductQueryPort;
    usecase = new CorrectProductSourceBindingUseCase(repository, query);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  async function seed(code: string, sourceProductCode: string) {
    return prisma.masterProduct.create({ data: {
      id: randomUUID(), organizationId: TEST_ORGANIZATION_ID, code,
      sourceAccountKey: 'fixture-account', sourceProductCode, sourceOptionCode: '',
      name: 'Fixture source product', currentStock: 3, purchasePrice: null,
      imageUrls: ['https://example.test/fixture.png'],
    } });
  }

  it('changes external identity while preserving internal identity, stock and images', async () => {
    const before = await seed('KID00000001', 'original');
    await usecase.correctSourceBinding(TEST_ORGANIZATION_ID, before.id, { sourceProductCode: 'corrected', sourceOptionCode: 'blue' });
    const after = await prisma.masterProduct.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toMatchObject({ ...before, sourceProductCode: 'corrected', sourceOptionCode: 'blue', updatedAt: expect.any(Date) });
  });

  it('rejects an occupied source identity and rolls back', async () => {
    const before = await seed('KID00000001', 'first');
    await seed('KID00000002', 'occupied');
    await expect(usecase.correctSourceBinding(TEST_ORGANIZATION_ID, before.id, { sourceProductCode: 'occupied', sourceOptionCode: '' })).rejects.toMatchObject({ code: 'SOURCE_CONFLICT' });
    expect(await prisma.masterProduct.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  });

  it('셀피아 재고 실행이 도는(prepared·executing) 동안 원천 코드를 바꾸지 않는다 — 끝나면 바꾼다', async () => {
    const before = await seed('KID00000001', 'original');
    const running = await prisma.operation.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, kind: 'products.sellpia_inventory', status: 'executing', token: randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 60_000), plan: {}, attempts: 1,
    } });
    await expect(usecase.correctSourceBinding(TEST_ORGANIZATION_ID, before.id, { sourceProductCode: 'corrected', sourceOptionCode: '' }))
      .rejects.toMatchObject({ code: 'PRODUCTS_STATE_CONFLICT', details: { reason: 'sellpia_inventory_running', operationId: running.id } });
    await prisma.operation.update({ where: { id: running.id }, data: { status: 'prepared' } });
    await expect(usecase.correctSourceBinding(TEST_ORGANIZATION_ID, before.id, { sourceProductCode: 'corrected', sourceOptionCode: '' }))
      .rejects.toMatchObject({ code: 'PRODUCTS_STATE_CONFLICT' });
    expect(await prisma.masterProduct.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);

    await prisma.operation.update({ where: { id: running.id }, data: { status: 'succeeded', finishedAt: new Date() } });
    await usecase.correctSourceBinding(TEST_ORGANIZATION_ID, before.id, { sourceProductCode: 'corrected', sourceOptionCode: '' });
    expect(await prisma.masterProduct.findUniqueOrThrow({ where: { id: before.id } })).toMatchObject({ sourceProductCode: 'corrected' });
  });

  it('다른 조직의 도는 셀피아 재고 실행은 이 조직의 교정을 막지 않는다', async () => {
    const before = await seed('KID00000001', 'original');
    await prisma.operation.create({ data: {
      organizationId: OTHER_ORGANIZATION_ID, kind: 'products.sellpia_inventory', status: 'executing', token: randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 60_000), plan: {}, attempts: 1,
    } });
    await usecase.correctSourceBinding(TEST_ORGANIZATION_ID, before.id, { sourceProductCode: 'corrected', sourceOptionCode: '' });
    expect(await prisma.masterProduct.findUniqueOrThrow({ where: { id: before.id } })).toMatchObject({ sourceProductCode: 'corrected' });
  });

  it('cannot correct a product in another organization', async () => {
    const before = await seed('KID00000001', 'first');
    await expect(usecase.correctSourceBinding(OTHER_ORGANIZATION_ID, before.id, { sourceProductCode: 'other', sourceOptionCode: '' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await prisma.masterProduct.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  });
});
