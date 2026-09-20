import { NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from "../../test-helpers/real-prisma";
import { seedActiveSellpiaInventorySku } from "../../test-helpers/inventory-seeds";
import { InventoryTransactionalReadRepositoryAdapter } from "../../inventory/adapter/out/persistence/inventory-transactional-read.repository.adapter";
import { ReturnTransfersService } from "../return-transfers/return-transfers.service";
import type { PrismaClient } from "@prisma/client";

const OWN_SKU_ID = "26000000-0000-4000-8000-000000000001";
const FOREIGN_SKU_ID = "26000000-0000-4000-8000-000000000002";

describe("return transfers through the Inventory reader (PG integration)", () => {
  let prisma: PrismaClient;
  let service: ReturnTransfersService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new ReturnTransfersService(
      prisma as never,
      new InventoryTransactionalReadRepositoryAdapter(),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedActiveSellpiaInventorySku(prisma, {
      id: OWN_SKU_ID,
      organizationId: TEST_ORGANIZATION_ID,
      code: "RETURN-OWN",
      name: "Owned return SKU",
      optionName: "Blue",
      currentStock: 3,
    });
    await seedActiveSellpiaInventorySku(prisma, {
      id: FOREIGN_SKU_ID,
      organizationId: OTHER_ORGANIZATION_ID,
      code: "RETURN-FOREIGN",
      name: "Foreign return SKU",
      currentStock: 5,
    });
  });

  it("validates ownership and hydrates list and update responses from Inventory identities", async () => {
    await expect(
      service.create(TEST_ORGANIZATION_ID, {
        sellpiaInventorySkuId: FOREIGN_SKU_ID,
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const created = await service.create(TEST_ORGANIZATION_ID, {
      sellpiaInventorySkuId: OWN_SKU_ID,
      quantity: 2,
      condition: "good",
      notes: "reader boundary",
    });
    expect(created.sellpiaInventorySku).toMatchObject({
      id: OWN_SKU_ID,
      code: "RETURN-OWN",
      name: "Owned return SKU",
      optionName: "Blue",
    });

    await expect(
      service.findAll(TEST_ORGANIZATION_ID, {}),
    ).resolves.toMatchObject([
      { id: created.id, sellpiaInventorySku: { id: OWN_SKU_ID } },
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
      sellpiaInventorySku: { id: OWN_SKU_ID, code: "RETURN-OWN" },
    });
  });

  it("keeps return history readable with a missing inventory identity", async () => {
    const created = await service.create(TEST_ORGANIZATION_ID, {
      sellpiaInventorySkuId: OWN_SKU_ID,
      quantity: 2,
    });

    await prisma.sellpiaInventorySku.delete({ where: { id: OWN_SKU_ID } });

    await expect(service.findAll(TEST_ORGANIZATION_ID, {})).resolves.toMatchObject([
      {
        id: created.id,
        sellpiaInventorySkuId: OWN_SKU_ID,
        sellpiaInventorySku: null,
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
      sellpiaInventorySkuId: OWN_SKU_ID,
      sellpiaInventorySku: null,
    });
  });
});
