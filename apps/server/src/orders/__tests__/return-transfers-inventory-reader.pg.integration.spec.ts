import { NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from "../../test-helpers/real-prisma";
import { seedSourceProduct } from "../../test-helpers/inventory-seeds";
import { ProductTransactionalReadRepositoryAdapter } from "../../products/adapter/out/persistence/product-transactional-read.repository.adapter";
import { ReturnTransfersService } from "../application/service/return-transfers/return-transfers.service";
import type { PrismaClient } from "@prisma/client";

const OWN_SKU_ID = "26000000-0000-4000-8000-000000000001";
const FOREIGN_SKU_ID = "26000000-0000-4000-8000-000000000002";

describe("return transfers through the Products reader (PG integration)", () => {
  let prisma: PrismaClient;
  let service: ReturnTransfersService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new ReturnTransfersService(
      prisma as never,
      new ProductTransactionalReadRepositoryAdapter(),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedSourceProduct(prisma, {
      id: OWN_SKU_ID,
      organizationId: TEST_ORGANIZATION_ID,
      code: "RETURN-OWN",
      name: "Owned return SKU",
      optionName: "Blue",
      currentStock: 3,
    });
    await seedSourceProduct(prisma, {
      id: FOREIGN_SKU_ID,
      organizationId: OTHER_ORGANIZATION_ID,
      code: "RETURN-FOREIGN",
      name: "Foreign return SKU",
      currentStock: 5,
    });
  });

  it("validates ownership and hydrates list and update responses from Products identities", async () => {
    await expect(
      service.create(TEST_ORGANIZATION_ID, {
        masterProductId: FOREIGN_SKU_ID,
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const created = await service.create(TEST_ORGANIZATION_ID, {
      masterProductId: OWN_SKU_ID,
      quantity: 2,
      condition: "good",
      notes: "reader boundary",
    });
    expect(created.masterProduct).toMatchObject({
      id: OWN_SKU_ID,
      code: expect.stringMatching(/^KID\d+$/),
      name: "Owned return SKU",
      optionName: "Blue",
    });

    await expect(
      service.findAll(TEST_ORGANIZATION_ID, {}),
    ).resolves.toMatchObject([
      { id: created.id, masterProduct: { id: OWN_SKU_ID } },
    ]);
    await expect(
      service.update(
        created.id,
        {
          status: "completed",
          restockedQty: 2,
        },
        TEST_ORGANIZATION_ID,
      ),
    ).resolves.toMatchObject({
      id: created.id,
      status: "completed",
      masterProduct: { id: OWN_SKU_ID, code: expect.stringMatching(/^KID\d+$/) },
    });
  });

  it("keeps return history readable with a missing current product identity", async () => {
    const created = await service.create(TEST_ORGANIZATION_ID, {
      masterProductId: OWN_SKU_ID,
      quantity: 2,
    });

    await prisma.masterProduct.delete({ where: { id: OWN_SKU_ID } });

    await expect(service.findAll(TEST_ORGANIZATION_ID, {})).resolves.toMatchObject([
      {
        id: created.id,
        masterProductId: OWN_SKU_ID,
        masterProduct: null,
      },
    ]);
    await expect(
      service.update(
        created.id,
        { status: "completed", restockedQty: 2 },
        TEST_ORGANIZATION_ID,
      ),
    ).resolves.toMatchObject({
      id: created.id,
      masterProductId: OWN_SKU_ID,
      masterProduct: null,
    });
  });
});
