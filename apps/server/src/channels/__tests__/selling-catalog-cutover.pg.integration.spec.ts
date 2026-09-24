import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { prepareSellingCatalogSourcesMigration } from '../../../../../scripts/data-migrations/v0.1.31/019_prepare_selling_catalog_sources';
import { sellingCatalogCutoverMigration } from '../../../../../scripts/data-migrations/v0.1.31/020_selling_catalog_cutover';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';

describe('selling catalog cutover (PostgreSQL)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await prisma.$executeRaw`ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS sale_price integer`;
    await prisma.$executeRaw`ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS tag_price integer`;
    await prisma.$executeRaw`ALTER TABLE sales_product_options ADD COLUMN IF NOT EXISTS extra_price integer`;
    await prisma.$executeRaw`ALTER TABLE sales_product_options ALTER COLUMN sale_price DROP NOT NULL`;
    await prisma.$executeRaw`CREATE TABLE sellpia_inventory_skus (id uuid PRIMARY KEY, organization_id uuid NOT NULL, master_product_id uuid)`;
    await prisma.$executeRaw`ALTER TABLE sales_product_option_components ADD COLUMN sellpia_inventory_sku_id uuid`;
    await prisma.$executeRaw`ALTER TABLE sales_product_option_components ALTER COLUMN master_product_id DROP NOT NULL`;
  });
  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$executeRaw`ALTER TABLE sales_products DROP COLUMN IF EXISTS sale_price`;
    await prisma.$executeRaw`ALTER TABLE sales_products DROP COLUMN IF EXISTS tag_price`;
    await prisma.$executeRaw`ALTER TABLE sales_product_options DROP COLUMN IF EXISTS extra_price`;
    // 되돌릴 것은 이 spec 이 흉내 낸 옛 모양이지 그 시절의 NOT NULL 이 아니다. 지금 스키마의
    // 판매가는 비어 있을 수 있다(초안) — 여기서 NOT NULL 로 세우면 같은 컨테이너에서 뒤에
    // 도는 spec 의 초안 단품 저장이 전부 깨진다.
    await prisma.$executeRaw`DROP TABLE sellpia_inventory_skus`;
    await prisma.$executeRaw`ALTER TABLE sales_product_option_components DROP COLUMN sellpia_inventory_sku_id`;
    await prisma.$executeRaw`ALTER TABLE sales_product_option_components ALTER COLUMN master_product_id SET NOT NULL`;
    await prisma.$disconnect();
  });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  it('retains identities and bootstrap codes while materializing the old final price exactly once', async () => {
    const productId = randomUUID();
    const optionId = randomUUID();
    await prisma.salesProduct.create({ data: { id: productId, organizationId: TEST_ORGANIZATION_ID,
      code: '731', sabangnetGoodsNo: '731', name: '테스트 상품' } });
    await prisma.salesProductOption.create({ data: { id: optionId, organizationId: TEST_ORGANIZATION_ID,
      salesProductId: productId, optionCode: '731-0001', optionKey: '', salePrice: 0 } });
    await prisma.$executeRaw`UPDATE sales_products SET sale_price = 10000, tag_price = 15000 WHERE id = ${productId}::uuid`;
    await prisma.$executeRaw`UPDATE sales_product_options SET sale_price = NULL, extra_price = 2000 WHERE id = ${optionId}::uuid`;
    await prisma.$transaction(tx => sellingCatalogCutoverMigration.run(tx));
    const product = await prisma.salesProduct.findUniqueOrThrow({ where: { id: productId } });
    const option = await prisma.salesProductOption.findUniqueOrThrow({ where: { id: optionId } });
    expect(product).toMatchObject({ id: productId, sabangnetGoodsNo: '731', code: expect.stringMatching(/^KID\d{8}$/) });
    expect(option).toMatchObject({ id: optionId, salePrice: 12000, normalPrice: 15000,
      sabangnetOptionCode: '731-0001', optionCode: expect.stringMatching(/^KID\d{8}$/) });
    expect(option.optionCode).not.toBe(product.code);
    await prisma.$transaction(tx => sellingCatalogCutoverMigration.run(tx));
    expect(await prisma.salesProduct.findUniqueOrThrow({ where: { id: productId } })).toEqual(product);
    expect(await prisma.salesProductOption.findUniqueOrThrow({ where: { id: optionId } })).toEqual(option);
  });

  it('maps a legacy component through its exact same-organization source identity and reuses the singleton KID', async () => {
    const productId = randomUUID(), optionId = randomUUID(), masterId = randomUUID(), skuId = randomUUID(), componentId = randomUUID();
    await prisma.masterProduct.create({ data: { id: masterId, organizationId: TEST_ORGANIZATION_ID,
      code: 'KID00000200', name: '원천 테스트', sourceAccountKey: 'test-source', sourceProductCode: 'test-product', sourceOptionCode: 'test-option' } });
    await prisma.salesProduct.create({ data: { id: productId, organizationId: TEST_ORGANIZATION_ID, code: '732', name: '등록 테스트' } });
    await prisma.salesProductOption.create({ data: { id: optionId, organizationId: TEST_ORGANIZATION_ID,
      salesProductId: productId, optionCode: '732-0001', optionKey: '', salePrice: 12000 } });
    await prisma.$executeRaw`INSERT INTO sellpia_inventory_skus VALUES (${skuId}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${masterId}::uuid)`;
    await prisma.$executeRaw`INSERT INTO sales_product_option_components
      (id, organization_id, sales_product_option_id, sellpia_inventory_sku_id, quantity, created_at, updated_at)
      VALUES (${componentId}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${optionId}::uuid, ${skuId}::uuid, 1, now(), now())`;
    await prisma.$transaction(async (tx) => {
      await prepareSellingCatalogSourcesMigration.run(tx);
      // Simulate immutable 016 removing the legacy source after preparation.
      await tx.$executeRaw`ALTER TABLE sellpia_inventory_skus RENAME TO retired_test_source`;
      await sellingCatalogCutoverMigration.run(tx);
      await tx.$executeRaw`ALTER TABLE retired_test_source RENAME TO sellpia_inventory_skus`;
    });
    expect(await prisma.salesProductOptionComponent.findUniqueOrThrow({ where: { id: componentId } })).toMatchObject({ masterProductId: masterId, quantity: 1 });
    expect(await prisma.salesProductOption.findUniqueOrThrow({ where: { id: optionId } })).toMatchObject({ optionCode: 'KID00000200', sabangnetOptionCode: '732-0001' });
  });
  it('rejects unresolvable legacy components without partially changing catalog prices or codes', async () => {
    const productId = randomUUID(), optionId = randomUUID(), componentId = randomUUID();
    await prisma.salesProduct.create({ data: { id: productId, organizationId: TEST_ORGANIZATION_ID, code: '733', name: '불완전 원천 테스트' } });
    await prisma.salesProductOption.create({ data: { id: optionId, organizationId: TEST_ORGANIZATION_ID,
      salesProductId: productId, optionCode: '733-0001', optionKey: '', salePrice: 12000 } });
    await prisma.$executeRaw`INSERT INTO sales_product_option_components
      (id, organization_id, sales_product_option_id, sellpia_inventory_sku_id, quantity, created_at, updated_at)
      VALUES (${componentId}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${optionId}::uuid, ${randomUUID()}::uuid, 1, now(), now())`;
    await expect(prisma.$transaction(tx => prepareSellingCatalogSourcesMigration.run(tx))).rejects.toThrow('cannot be mapped');
    expect(await prisma.salesProduct.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({ code: '733' });
    expect(await prisma.salesProductOption.findUniqueOrThrow({ where: { id: optionId } })).toMatchObject({ optionCode: '733-0001', salePrice: 12000 });
  });

});
