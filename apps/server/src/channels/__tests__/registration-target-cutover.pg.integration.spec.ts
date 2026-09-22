import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { linkRegistrationTargetsMigration } from '../../../../../scripts/data-migrations/v0.1.31/021_link_registration_targets';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';

const ACCOUNT_ID = '51000000-0000-4000-8000-000000000001';
const SECOND_ACCOUNT_ID = '51000000-0000-4000-8000-000000000002';
const THIRD_ACCOUNT_ID = '51000000-0000-4000-8000-000000000003';

describe('registration target cutover (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    // Recreate the pre-cutover nullable target and legacy catalog/override shape.
    await prisma.$executeRaw`ALTER TABLE product_preparations ALTER COLUMN sales_product_id DROP NOT NULL`;
    await prisma.$executeRaw`ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS sale_price integer`;
    await prisma.$executeRaw`ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS tag_price integer`;
    await prisma.$executeRaw`ALTER TABLE sales_product_options ADD COLUMN IF NOT EXISTS extra_price integer`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS sales_product_channel_overrides`;
    await prisma.$executeRaw`CREATE TABLE sales_product_channel_overrides (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, sales_product_id uuid NOT NULL,
      channel_account_id uuid NOT NULL, name text, adapter_values jsonb, detail_html text,
      promo_text text, notice_category text, stock_percent integer, sale_price integer, price_rate_bp integer
    )`;
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$executeRaw`DROP TABLE IF EXISTS sales_product_channel_overrides`;
    await prisma.$executeRaw`ALTER TABLE sales_products DROP COLUMN IF EXISTS sale_price`;
    await prisma.$executeRaw`ALTER TABLE sales_products DROP COLUMN IF EXISTS tag_price`;
    await prisma.$executeRaw`ALTER TABLE sales_product_options DROP COLUMN IF EXISTS extra_price`;
    await prisma.$executeRaw`ALTER TABLE product_preparations ALTER COLUMN sales_product_id SET NOT NULL`;
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [ACCOUNT_ID, SECOND_ACCOUNT_ID, THIRD_ACCOUNT_ID].map((id, index) => ({
        id,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'kidkids',
        externalAccountId: `registration-target-${index}`,
        name: `Registration target account ${index}`,
        status: 'active',
      })),
    });
  });

  it('bootstraps a priced candidate target and preserves execution evidence on rerun', async () => {
    const candidateId = await createCandidate(prisma);
    const preparationId = randomUUID();
    const executionId = randomUUID();
    const closedAt = new Date('2026-01-02T03:04:05.000Z');
    const registrationInput = {
      name: '후보 부츠',
      salePrice: 13_000,
      originalPrice: 16_000,
      description: '<p>부츠 상세</p>',
      registrationImages: ['https://test.invalid/boot.png'],
      wingProduct: {
        sellerProductName: '후보 부츠',
        variants: [{
          purchaseOptions: [{ type: '색상', value: '남색' }],
          salePrice: 13_000,
          origPrice: 16_000,
          representativeImageUrl: 'https://test.invalid/boot-variant.png',
        }],
      },
    };
    await insertPreparation(prisma, {
      id: preparationId,
      candidateId,
      registrationInput,
      closedAt,
    });
    await insertExecution(prisma, { id: executionId, preparationId });
    const executionBefore = await readExecution(prisma, executionId);

    const result = await prisma.$transaction((tx) => linkRegistrationTargetsMigration.run(tx));

    expect(result).toMatchObject({
      affectedRows: 1,
      details: { linkedPreparations: 1, migratedOverrides: 0, executionEvidenceChanged: false },
    });
    const product = await prisma.salesProduct.findFirstOrThrow({ where: { organizationId: TEST_ORGANIZATION_ID } });
    expect(product).toMatchObject({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      name: '후보 부츠',
      optionAxes: ['색상'],
      imageUrls: ['https://test.invalid/boot.png', 'https://test.invalid/boot-variant.png'],
      detailHtml: '<p>부츠 상세</p>',
      sourceRaw: { preparationBootstrap: preparationId },
    });
    expect(product.code).toMatch(/^KID\d{8}$/);
    const option = await prisma.salesProductOption.findFirstOrThrow({ where: { salesProductId: product.id } });
    expect(option).toMatchObject({ values: ['남색'], salePrice: 13_000, normalPrice: 16_000 });
    const preparation = await prisma.productPreparation.findUniqueOrThrow({ where: { id: preparationId } });
    expect(preparation).toMatchObject({ salesProductId: product.id, closedAt: null });
    const selection = await prisma.productPreparationOption.findUniqueOrThrow({
      where: { productPreparationId_salesProductOptionId: { productPreparationId: preparationId, salesProductOptionId: option.id } },
    });
    expect(selection).toMatchObject({ salePrice: 13_000, normalPrice: 16_000 });
    expect(await readExecution(prisma, executionId)).toEqual(executionBefore);

    await prisma.$transaction((tx) => linkRegistrationTargetsMigration.run(tx));
    expect(await prisma.salesProduct.count()).toBe(1);
    expect(await prisma.salesProductOption.count()).toBe(1);
    expect(await prisma.productPreparationOption.count()).toBe(1);
    expect(await readExecution(prisma, executionId)).toEqual(executionBefore);
  });

  it('bootstraps absent catalog tables transactionally and rolls the disposable schema back', async () => {
    const candidateId = await createCandidate(prisma);
    const preparationId = randomUUID();
    const executionId = randomUUID();
    await insertPreparation(prisma, {
      id: preparationId,
      candidateId,
      registrationInput: {
        name: 'Schema-less bootstrapped product',
        wingProduct: {
          variants: [{
            purchaseOptions: [{ type: '크기', value: 'M' }],
            salePrice: 6_200,
            origPrice: 7_200,
          }],
        },
      },
    });
    await insertExecution(prisma, { id: executionId, preparationId });
    const executionBefore = await readExecution(prisma, executionId);
    const rollbackSignal = `rollback-registration-schema-${randomUUID()}`;
    let transactionEvidence: {
      result: unknown;
      absentShape: unknown;
      createdShape: unknown;
      linkedRows: unknown;
      execution: unknown;
    } | undefined;

    await expect(prisma.$transaction(async (tx) => {
      // The integration runner supplies an isolated Testcontainers database. DDL and migration
      // run together, then the forced failure restores every dropped relation and fixture row.
      await tx.$executeRaw`DROP TABLE IF EXISTS sales_product_option_components CASCADE`;
      await tx.$executeRaw`DROP TABLE IF EXISTS product_preparation_options CASCADE`;
      await tx.$executeRaw`DROP TABLE IF EXISTS sales_product_options CASCADE`;
      await tx.$executeRaw`DROP TABLE IF EXISTS sales_products CASCADE`;
      const [absentShape] = await tx.$queryRaw<Array<{
        salesProducts: boolean;
        salesProductOptions: boolean;
        productPreparationOptions: boolean;
        salesProductOptionComponents: boolean;
      }>>`
        SELECT to_regclass('public.sales_products') IS NOT NULL AS "salesProducts",
          to_regclass('public.sales_product_options') IS NOT NULL AS "salesProductOptions",
          to_regclass('public.product_preparation_options') IS NOT NULL AS "productPreparationOptions",
          to_regclass('public.sales_product_option_components') IS NOT NULL AS "salesProductOptionComponents"
      `;

      const result = await linkRegistrationTargetsMigration.run(tx);
      const [createdShape] = await tx.$queryRaw<Array<{
        salesProducts: boolean;
        salesProductOptions: boolean;
        productPreparationOptions: boolean;
        salesProductOptionComponents: boolean;
      }>>`
        SELECT to_regclass('public.sales_products') IS NOT NULL AS "salesProducts",
          to_regclass('public.sales_product_options') IS NOT NULL AS "salesProductOptions",
          to_regclass('public.product_preparation_options') IS NOT NULL AS "productPreparationOptions",
          to_regclass('public.sales_product_option_components') IS NOT NULL AS "salesProductOptionComponents"
      `;
      const linkedRows = await tx.$queryRaw<Array<{
        salesProductId: string;
        name: string;
        optionAxes: string[];
        values: string[];
        optionSalePrice: number;
        selectedSalePrice: number | null;
        selectedNormalPrice: number | null;
      }>>`
        SELECT preparation.sales_product_id AS "salesProductId", product.name,
          product.option_axes AS "optionAxes", option."values", option.sale_price AS "optionSalePrice",
          selected.sale_price AS "selectedSalePrice", selected.normal_price AS "selectedNormalPrice"
        FROM product_preparations preparation
        JOIN sales_products product ON product.id = preparation.sales_product_id
          AND product.organization_id = preparation.organization_id
        JOIN sales_product_options option ON option.sales_product_id = product.id
          AND option.organization_id = product.organization_id AND option.supply_status <> 'unused'
        JOIN product_preparation_options selected ON selected.product_preparation_id = preparation.id
          AND selected.sales_product_option_id = option.id
        WHERE preparation.id = ${preparationId}::uuid
      `;
      const [executionRow] = await tx.$queryRaw<Array<{ row: unknown }>>`
        SELECT to_jsonb(execution) AS row FROM product_registration_executions execution
        WHERE id = ${executionId}::uuid
      `;
      const execution = executionRow?.row;
      transactionEvidence = { result, absentShape, createdShape, linkedRows, execution };
      throw new Error(rollbackSignal);
    })).rejects.toThrow(rollbackSignal);

    expect(transactionEvidence).toBeDefined();
    expect(transactionEvidence?.result).toMatchObject({
      affectedRows: 1,
      details: { linkedPreparations: 1, migratedOverrides: 0, executionEvidenceChanged: false },
    });
    expect(transactionEvidence?.absentShape).toEqual({
      salesProducts: false,
      salesProductOptions: false,
      productPreparationOptions: false,
      salesProductOptionComponents: false,
    });
    expect(transactionEvidence?.createdShape).toEqual({
      salesProducts: true,
      salesProductOptions: true,
      productPreparationOptions: true,
      salesProductOptionComponents: false,
    });
    expect(transactionEvidence?.linkedRows).toEqual([{
      salesProductId: expect.any(String),
      name: 'Schema-less bootstrapped product',
      optionAxes: ['크기'],
      values: ['M'],
      optionSalePrice: 6_200,
      selectedSalePrice: 6_200,
      selectedNormalPrice: 7_200,
    }]);
    expect(transactionEvidence?.execution).toEqual(executionBefore);

    const [restoredShape] = await prisma.$queryRaw<Array<{
      salesProducts: boolean;
      salesProductOptions: boolean;
      productPreparationOptions: boolean;
      salesProductOptionComponents: boolean;
    }>>`
      SELECT to_regclass('public.sales_products') IS NOT NULL AS "salesProducts",
        to_regclass('public.sales_product_options') IS NOT NULL AS "salesProductOptions",
        to_regclass('public.product_preparation_options') IS NOT NULL AS "productPreparationOptions",
        to_regclass('public.sales_product_option_components') IS NOT NULL AS "salesProductOptionComponents"
    `;
    expect(restoredShape).toEqual({
      salesProducts: true,
      salesProductOptions: true,
      productPreparationOptions: true,
      salesProductOptionComponents: true,
    });
    expect(await prisma.salesProduct.count()).toBe(0);
    expect(await prisma.salesProductOption.count()).toBe(0);
    expect(await prisma.productPreparationOption.count()).toBe(0);
    const [restoredPreparation] = await prisma.$queryRaw<Array<{ salesProductId: string | null }>>`
      SELECT sales_product_id AS "salesProductId" FROM product_preparations WHERE id = ${preparationId}::uuid
    `;
    expect(restoredPreparation?.salesProductId).toBeNull();
    expect(await readExecution(prisma, executionId)).toEqual(executionBefore);
  });

  it.each([
    {
      name: 'an unpriced variant',
      variants: [{ purchaseOptions: [{ type: '색상', value: '남색' }] }],
      error: 'Invalid registration number blocks cutover.',
    },
    {
      name: 'duplicate options',
      variants: [
        { purchaseOptions: [{ type: '색상', value: '남색' }], salePrice: 10_000 },
        { purchaseOptions: [{ type: '색상', value: '남색' }], salePrice: 11_000 },
      ],
      error: 'Conflicting or duplicate preparation options block cutover.',
    },
  ])('rejects $name without partially bootstrapping the catalog', async ({ variants, error }) => {
    const candidateId = await createCandidate(prisma);
    const preparationId = randomUUID();
    await insertPreparation(prisma, {
      id: preparationId,
      candidateId,
      registrationInput: { wingProduct: { sellerProductName: '불완전 부츠', variants } },
    });

    await expect(prisma.$transaction((tx) => linkRegistrationTargetsMigration.run(tx))).rejects.toThrow(error);

    await expectNoPartialBootstrap(prisma, [preparationId]);
  });

  it('rolls back all candidate bootstrap rows when preparations for one candidate conflict', async () => {
    const candidateId = await createCandidate(prisma);
    const firstId = randomUUID();
    const secondId = randomUUID();
    await insertPreparation(prisma, {
      id: firstId,
      candidateId,
      registrationInput: { wingProduct: { variants: [{ purchaseOptions: [{ type: '색상', value: '남색' }], salePrice: 10_000 }] } },
    });
    await insertPreparation(prisma, {
      id: secondId,
      candidateId,
      registrationInput: { wingProduct: { variants: [{ purchaseOptions: [{ type: '색상', value: '남색' }], salePrice: 11_000 }] } },
    });

    await expect(prisma.$transaction((tx) => linkRegistrationTargetsMigration.run(tx)))
      .rejects.toThrow('Conflicting preparations cannot define one common selling product.');

    await expectNoPartialBootstrap(prisma, [firstId, secondId]);
  });

  it('migrates legacy override prices and leaves an already-linked target untouched on rerun', async () => {
    const productId = randomUUID();
    const optionId = randomUUID();
    const existingTargetId = randomUUID();
    const explicitPriceTargetId = randomUUID();
    const rateTargetId = randomUUID();
    await prisma.salesProduct.create({
      data: {
        id: productId,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'LEGACY-OVERRIDE-TEST',
        name: '기존 판매 상품',
        optionAxes: ['색상'],
      },
    });
    await prisma.salesProductOption.create({
      data: {
        id: optionId,
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: productId,
        optionCode: 'LEGACY-OVERRIDE-TEST-1',
        values: ['남색'],
        optionKey: '남색',
        salePrice: 10_000,
      },
    });
    await prisma.$executeRaw`UPDATE sales_products SET sale_price = 10000, tag_price = 16000 WHERE id = ${productId}::uuid`;
    await prisma.$executeRaw`UPDATE sales_product_options SET extra_price = 2000 WHERE id = ${optionId}::uuid`;
    await prisma.productPreparation.create({
      data: {
        id: existingTargetId,
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: productId,
        channelAccountId: ACCOUNT_ID,
        displayName: '수정된 기존 설정',
        registrationInput: { preserve: 'target' },
      },
    });
    await prisma.productPreparationOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: existingTargetId,
        salesProductOptionId: optionId,
        sortOrder: 9,
        salePrice: 77_777,
        normalPrice: 88_888,
        supplyPrice: 66_666,
      },
    });
    await insertLegacyOverride(prisma, {
      id: existingTargetId, accountId: ACCOUNT_ID, productId, salePrice: 11_000,
    });
    await insertLegacyOverride(prisma, {
      id: explicitPriceTargetId, accountId: SECOND_ACCOUNT_ID, productId, salePrice: 11_000,
    });
    await insertLegacyOverride(prisma, {
      id: rateTargetId, accountId: THIRD_ACCOUNT_ID, productId, priceRateBp: 12_500,
    });

    const result = await prisma.$transaction((tx) => linkRegistrationTargetsMigration.run(tx));
    expect(result).toMatchObject({ affectedRows: 2, details: { linkedPreparations: 0, migratedOverrides: 2 } });
    const preservedTarget = await prisma.productPreparation.findUniqueOrThrow({ where: { id: existingTargetId } });
    expect(preservedTarget).toMatchObject({ displayName: '수정된 기존 설정', registrationInput: { preserve: 'target' } });
    const preservedSelection = await prisma.productPreparationOption.findUniqueOrThrow({
      where: { productPreparationId_salesProductOptionId: { productPreparationId: existingTargetId, salesProductOptionId: optionId } },
    });
    expect(preservedSelection).toMatchObject({ sortOrder: 9, salePrice: 77_777, normalPrice: 88_888, supplyPrice: 66_666 });
    const explicitSelection = await selectionFor(prisma, explicitPriceTargetId, optionId);
    const rateSelection = await selectionFor(prisma, rateTargetId, optionId);
    expect(explicitSelection).toMatchObject({ salePrice: 13_000, normalPrice: null, supplyPrice: null });
    expect(rateSelection).toMatchObject({ salePrice: 14_500, normalPrice: null, supplyPrice: null });

    await prisma.$transaction((tx) => linkRegistrationTargetsMigration.run(tx));
    expect(await prisma.productPreparation.count()).toBe(3);
    expect(await prisma.productPreparationOption.count()).toBe(3);
    expect(await prisma.productPreparation.findUniqueOrThrow({ where: { id: existingTargetId } })).toEqual(preservedTarget);
    expect(await prisma.productPreparationOption.findUniqueOrThrow({
      where: { productPreparationId_salesProductOptionId: { productPreparationId: existingTargetId, salesProductOptionId: optionId } },
    })).toEqual(preservedSelection);
    expect(await selectionFor(prisma, explicitPriceTargetId, optionId)).toEqual(explicitSelection);
    expect(await selectionFor(prisma, rateTargetId, optionId)).toEqual(rateSelection);
  });
});

async function createCandidate(prisma: PrismaClient): Promise<string> {
  const candidate = await prisma.sourcingCandidate.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceUrl: `https://test.invalid/candidate/${randomUUID()}`,
      sourcePlatform: 'test',
      name: 'Registration bootstrap candidate',
      status: 'sourced',
    },
  });
  return candidate.id;
}

async function insertPreparation(prisma: PrismaClient, input: {
  id: string;
  candidateId: string;
  registrationInput: Record<string, unknown>;
  closedAt?: Date;
}): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO product_preparations
      (id, organization_id, sales_product_id, source_candidate_id, channel_account_id, display_name,
       registration_input, closed_at, is_deleted, created_at, updated_at)
    VALUES
      (${input.id}::uuid, ${TEST_ORGANIZATION_ID}::uuid, NULL, ${input.candidateId}::uuid, ${ACCOUNT_ID}::uuid,
       'Legacy preparation', ${JSON.stringify(input.registrationInput)}::jsonb, ${input.closedAt ?? null}, false, now(), now())
  `;
}

async function insertExecution(prisma: PrismaClient, input: { id: string; preparationId: string }): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO product_registration_executions
      (id, organization_id, product_preparation_id, channel_account_id, idempotency_key, request_hash,
       submission_payload_json, submission_payload_hash, status, provider_outcome, created_at, updated_at)
    VALUES
      (${input.id}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${input.preparationId}::uuid, ${ACCOUNT_ID}::uuid,
       ${`bootstrap-${input.id}`}, ${'a'.repeat(64)}, ${JSON.stringify({ immutable: true, listings: ['x-1'] })}::jsonb,
       ${'b'.repeat(64)}, 'succeeded', 'succeeded', now(), now())
  `;
}

async function readExecution(prisma: PrismaClient, id: string): Promise<unknown> {
  const [execution] = await prisma.$queryRaw<Array<{ row: unknown }>>`
    SELECT to_jsonb(execution) AS row FROM product_registration_executions execution WHERE id = ${id}::uuid
  `;
  return execution?.row;
}

async function expectNoPartialBootstrap(prisma: PrismaClient, preparationIds: string[]): Promise<void> {
  expect(await prisma.salesProduct.count()).toBe(0);
  expect(await prisma.salesProductOption.count()).toBe(0);
  expect(await prisma.productPreparationOption.count()).toBe(0);
  const preparations = await prisma.productPreparation.findMany({ where: { id: { in: preparationIds } } });
  expect(preparations).toHaveLength(preparationIds.length);
  expect(preparations.every((preparation) => preparation.salesProductId === null)).toBe(true);
}

async function insertLegacyOverride(prisma: PrismaClient, input: {
  id: string;
  accountId: string;
  productId: string;
  salePrice?: number;
  priceRateBp?: number;
}): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO sales_product_channel_overrides
      (id, organization_id, sales_product_id, channel_account_id, name, adapter_values,
       sale_price, price_rate_bp, detail_html, promo_text, notice_category, stock_percent)
    VALUES
      (${input.id}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${input.productId}::uuid, ${input.accountId}::uuid,
       'Legacy override', ${JSON.stringify({ title: 'Preserve adapter values' })}::jsonb,
       ${input.salePrice ?? null}, ${input.priceRateBp ?? null}, '<p>legacy detail</p>', 'legacy promo', '01', 80)
  `;
}

async function selectionFor(prisma: PrismaClient, preparationId: string, optionId: string) {
  return prisma.productPreparationOption.findUniqueOrThrow({
    where: { productPreparationId_salesProductOptionId: { productPreparationId: preparationId, salesProductOptionId: optionId } },
  });
}
