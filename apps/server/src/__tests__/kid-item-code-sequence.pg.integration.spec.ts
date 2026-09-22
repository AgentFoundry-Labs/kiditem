import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { kidItemCodeSequenceStep } from '../../../../scripts/data-migrations/ensure/kid-item-code-sequence';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../test-helpers/real-prisma';
import type { PrismaClient } from '@prisma/client';

describe('kid item code sequence ensure (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows two mall listings to reuse one bundled common option code when both link that option', async () => {
    const masterIds = [randomUUID(), randomUUID()];
    for (const [index, masterId] of masterIds.entries()) {
      await prisma.masterProduct.create({
        data: {
          id: masterId,
          organizationId: TEST_ORGANIZATION_ID,
          code: `KID0001000${index + 1}`,
          sourceAccountKey: 'test-source',
          sourceProductCode: `product-${index + 1}`,
          sourceOptionCode: `option-${index + 1}`,
          name: `원천 상품 ${index + 1}`,
        },
      });
    }
    const salesProduct = await prisma.salesProduct.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KID00010003',
        name: '공통 상품',
      },
    });
    const salesProductOption = await prisma.salesProductOption.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: salesProduct.id,
        optionCode: 'KID00010004',
        optionKey: 'bundle',
        salePrice: 12_000,
        normalPrice: 15_000,
      },
    });
    for (const masterProductId of masterIds) {
      await prisma.salesProductOptionComponent.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          salesProductOptionId: salesProductOption.id,
          masterProductId,
          quantity: 1,
        },
      });
    }

    const listingOptionIds: string[] = [];
    for (const [index, channel] of ['coupang', 'naver'].entries()) {
      const account = await prisma.channelAccount.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          channel,
          name: `${channel} account`,
          externalAccountId: `${channel}-test`,
        },
      });
      const listing = await prisma.channelListing.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: account.id,
          salesProductId: salesProduct.id,
          externalId: `listing-${index + 1}`,
        },
      });
      const listingOption = await prisma.channelListingOption.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.id,
          externalOptionId: `option-${index + 1}`,
          salesProductOptionId: salesProductOption.id,
          kidItemCode: salesProductOption.optionCode,
        },
      });
      listingOptionIds.push(listingOption.id);
      // The channel has a confirmed recipe of its own. It is intentionally
      // different from the common option template above.
      const confirmedComponents = index === 0
        ? [{ masterProductId: masterIds[0]!, quantity: 2 }]
        : [{ masterProductId: masterIds[1]!, quantity: 3 }];
      for (const component of confirmedComponents) {
        await prisma.channelListingOptionInventoryComponent.create({
          data: {
            id: randomUUID(),
            organizationId: TEST_ORGANIZATION_ID,
            channelListingOptionId: listingOption.id,
            masterProductId: component.masterProductId,
            quantity: component.quantity,
          },
        });
      }
    }

    const result = await runEnsure();

    expect(result).toMatchObject({
      details: {
        maxExistingSuffix: 10004,
        sequence: 'kid_item_code_seq',
      },
    });
    await expect(prisma.channelListingOption.findMany({
      where: { id: { in: listingOptionIds } },
      select: { kidItemCode: true, salesProductOptionId: true },
      orderBy: { id: 'asc' },
    })).resolves.toHaveLength(2);
  });

  it('preserves singleton reuse for a deleted source when options and unlinked listings retain the same UUID', async () => {
    const masterId = randomUUID();
    const sharedCode = 'KID00060001';
    await prisma.masterProduct.create({
      data: {
        id: masterId,
        organizationId: TEST_ORGANIZATION_ID,
        code: sharedCode,
        sourceAccountKey: 'deleted-source',
        sourceProductCode: 'deleted-product',
        sourceOptionCode: 'deleted-option',
        name: '삭제된 원천 상품',
      },
    });
    const products = await Promise.all([
      prisma.salesProduct.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00060002',
          name: '공통 상품 1',
        },
      }),
      prisma.salesProduct.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00060003',
          name: '공통 상품 2',
        },
      }),
    ]);
    const options = await Promise.all(products.map((product) => prisma.salesProductOption.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: product.id,
        optionCode: sharedCode,
        optionKey: '',
        salePrice: 100,
      },
    })));
    for (const option of options) {
      await prisma.salesProductOptionComponent.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          salesProductOptionId: option.id,
          masterProductId: masterId,
          quantity: 1,
        },
      });
    }
    for (const [index, channel] of ['coupang', 'naver'].entries()) {
      const account = await prisma.channelAccount.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          channel,
          name: `${channel} account`,
          externalAccountId: `${channel}-deleted-source-test`,
        },
      });
      const listing = await prisma.channelListing.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: account.id,
          externalId: `deleted-source-listing-${index + 1}`,
        },
      });
      const listingOption = await prisma.channelListingOption.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.id,
          externalOptionId: `deleted-source-option-${index + 1}`,
          kidItemCode: sharedCode,
        },
      });
      await prisma.channelListingOptionInventoryComponent.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: listingOption.id,
          masterProductId: masterId,
          quantity: 1,
        },
      });
    }

    await prisma.masterProduct.delete({ where: { id: masterId } });

    await expect(runEnsure()).resolves.toMatchObject({
      details: { maxExistingSuffix: 60_003 },
    });
    await expect(prisma.salesProductOptionComponent.count({ where: { masterProductId: masterId } })).resolves.toBe(2);
    await expect(prisma.channelListingOptionInventoryComponent.count({ where: { masterProductId: masterId } })).resolves.toBe(2);
  });

  it('rejects deleted-source reuse when retained singleton UUIDs differ', async () => {
    const sharedCode = 'KID00061001';
    const products = await Promise.all([
      prisma.salesProduct.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00061002',
          name: '공통 상품 1',
        },
      }),
      prisma.salesProduct.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00061003',
          name: '공통 상품 2',
        },
      }),
    ]);
    const options = await Promise.all(products.map((product) => prisma.salesProductOption.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: product.id,
        optionCode: sharedCode,
        optionKey: '',
        salePrice: 100,
      },
    })));
    for (const option of options) {
      await prisma.salesProductOptionComponent.create({
        data: {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          salesProductOptionId: option.id,
          masterProductId: randomUUID(),
          quantity: 1,
        },
      });
    }

    await expect(runEnsure()).rejects.toThrow(/sales_product_options/);
  });

  it('rejects a KID independently issued by products in two organizations', async () => {
    await prisma.salesProduct.createMany({
      data: [
        {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00020001',
          name: '상품 1',
        },
        {
          id: randomUUID(),
          organizationId: OTHER_ORGANIZATION_ID,
          code: 'KID00020001',
          name: '상품 2',
        },
      ],
    });

    await expect(runEnsure()).rejects.toThrow(/duplicate independently issued KID codes/);
  });

  it('rejects equal common option codes when neither option proves a singleton source reuse', async () => {
    const products = await prisma.salesProduct.createMany({
      data: [
        {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00021001',
          name: '상품 1',
        },
        {
          id: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00021002',
          name: '상품 2',
        },
      ],
    });
    expect(products.count).toBe(2);
    const salesProducts = await prisma.salesProduct.findMany({ orderBy: { code: 'asc' } });
    await prisma.salesProductOption.createMany({
      data: salesProducts.map((product) => ({
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: product.id,
        optionCode: 'KID00021003',
        optionKey: 'same-code',
        salePrice: 100,
      })),
    });

    await expect(runEnsure()).rejects.toThrow(/sales_product_options/);
  });

  it('aligns the sequence to the highest SalesProduct and SalesProductOption code', async () => {
    const salesProduct = await prisma.salesProduct.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KID00030001',
        name: '상품',
      },
    });
    await prisma.salesProductOption.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: salesProduct.id,
        optionCode: 'KID00030002',
        optionKey: '',
        salePrice: 100,
      },
    });

    const result = await runEnsure();
    expect(result).toMatchObject({
      details: {
        maxExistingSuffix: 30002,
        sequence: 'kid_item_code_seq',
      },
    });
    const [state] = await prisma.$queryRaw<Array<{ last_value: bigint | number | string }>>`
      SELECT last_value FROM kid_item_code_seq
    `;
    expect(Number(state?.last_value)).toBeGreaterThanOrEqual(30_002);
  });

  it('accepts legacy selling identifiers before sabangnet_option_code exists while counting valid KIDs', async () => {
    const productId = randomUUID();
    const optionId = randomUUID();
    await prisma.$executeRaw`ALTER TABLE sales_product_options DROP COLUMN IF EXISTS sabangnet_option_code`;
    try {
      await prisma.$executeRaw`
        INSERT INTO sales_products (id, organization_id, code, name)
        VALUES (${productId}::uuid, ${TEST_ORGANIZATION_ID}::uuid, 'legacy-goods-1', 'legacy product')
      `;
      await prisma.$executeRaw`
        INSERT INTO sales_product_options (
          id, organization_id, sales_product_id, option_code, option_key, sale_price
        ) VALUES (
          ${optionId}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${productId}::uuid,
          'legacy-option-1', '', 100
        )
      `;
      const validProductId = randomUUID();
      const validOptionId = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO sales_products (id, organization_id, code, name)
        VALUES (${validProductId}::uuid, ${TEST_ORGANIZATION_ID}::uuid, 'KID00050001', 'issued product')
      `;
      await prisma.$executeRaw`
        INSERT INTO sales_product_options (
          id, organization_id, sales_product_id, option_code, option_key, sale_price
        ) VALUES (
          ${validOptionId}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${validProductId}::uuid,
          'KID00050002', '', 100
        )
      `;

      await expect(runEnsure()).resolves.toMatchObject({
        details: { maxExistingSuffix: 50_002 },
      });
    } finally {
      await prisma.$executeRaw`ALTER TABLE sales_product_options ADD COLUMN IF NOT EXISTS sabangnet_option_code varchar(80)`;
    }
  });

  it('requires KID format for final SalesProduct and SalesProductOption identities', async () => {
    await prisma.salesProduct.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        code: 'legacy-goods-after-cutover',
        name: '상품',
      },
    });
    await expect(runEnsure()).rejects.toThrow(/sales_products/);

    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const validProduct = await prisma.salesProduct.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KID00051001',
        name: '상품',
      },
    });
    await prisma.salesProductOption.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: validProduct.id,
        optionCode: 'legacy-option-after-cutover',
        optionKey: '',
        salePrice: 100,
      },
    });
    await expect(runEnsure()).rejects.toThrow(/sales_product_options/);
  });

  it('is idempotent when re-run against the same final rows', async () => {
    const salesProduct = await prisma.salesProduct.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KID00040001',
        name: '상품',
      },
    });
    await prisma.salesProductOption.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: salesProduct.id,
        optionCode: 'KID00040002',
        optionKey: '',
        salePrice: 100,
      },
    });

    await runEnsure();
    const second = await runEnsure();

    expect(second).toMatchObject({
      changedRows: 0,
      details: {
        maxExistingSuffix: 40002,
        outcome: 'unchanged',
        sequenceWasCreated: false,
        sequenceWasAdvanced: false,
      },
    });
  });

  async function runEnsure() {
    return prisma.$transaction((tx) => kidItemCodeSequenceStep.run(tx, { target: 'local' }));
  }
});
