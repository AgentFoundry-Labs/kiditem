import { describe, expect, it, vi } from "vitest";
import { backfillInventoryCommitments } from "../data-migrations/v0.1.21/001_backfill_inventory_commitments";

const confirmedAt = new Date("2026-07-17T00:00:00.000Z");
const releasedAt = new Date("2026-07-18T00:00:00.000Z");

function confirmationLine(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "line-1",
    organizationId: "org-1",
    confirmationId: "confirmation-1",
    poNumber: " PO-1 ",
    productNo: " PRODUCT-1 ",
    confirmedQuantity: 2,
    confirmation: {
      channelAccountId: "account-1",
      freshnessGeneration: 12n,
      status: "active",
      confirmedBy: "user-1",
      confirmedAt,
      releasedBy: null,
      releasedAt: null,
      releaseReason: null,
    },
    allocations: [{
      sellpiaInventorySkuId: "sku-1",
      unitsPerVariant: 2,
      quantity: 4,
    }],
    ...overrides,
  };
}

function migrationTx(lines: ReturnType<typeof confirmationLine>[]) {
  const commitments: Array<Record<string, unknown>> = [];
  const allocations: Array<Record<string, unknown>> = [];

  return {
    state: { commitments, allocations },
    tx: {
      rocketPurchaseConfirmationLine: {
        findMany: vi.fn().mockResolvedValue(lines),
      },
      inventoryCommitment: {
        findMany: vi.fn().mockImplementation(async () => commitments),
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          let count = 0;
          for (const row of data as Array<Record<string, unknown>>) {
            const exists = commitments.some((existing) =>
              existing.organizationId === row.organizationId
              && existing.kind === row.kind
              && existing.sourceId === row.sourceId,
            );
            if (!exists) {
              commitments.push(row);
              count += 1;
            }
          }
          return { count };
        }),
      },
      inventoryCommitmentAllocation: {
        findMany: vi.fn().mockImplementation(async () => allocations),
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          let count = 0;
          for (const row of data as Array<Record<string, unknown>>) {
            const exists = allocations.some((existing) =>
              existing.commitmentId === row.commitmentId
              && existing.sellpiaInventorySkuId === row.sellpiaInventorySkuId,
            );
            if (!exists) {
              allocations.push(row);
              count += 1;
            }
          }
          return { count };
        }),
      },
    },
  };
}

describe("inventory commitment data migration", () => {
  it("uses the durable 0.1.21 migration identity", () => {
    expect(backfillInventoryCommitments).toMatchObject({
      id: "v0.1.21:001_backfill_inventory_commitments",
      releaseVersion: "0.1.21",
    });
  });

  it("maps active and released positive confirmation lines and skips zero quantity", async () => {
    const active = confirmationLine();
    const released = confirmationLine({
      id: "line-2",
      confirmationId: "confirmation-2",
      poNumber: "PO-2",
      confirmation: {
        ...confirmationLine().confirmation,
        status: "released",
        releasedBy: "user-2",
        releasedAt,
        releaseReason: "쿠팡 요청 취소",
      },
    });
    const zero = confirmationLine({
      id: "line-zero",
      confirmationId: "confirmation-zero",
      poNumber: "PO-ZERO",
      confirmedQuantity: 0,
      allocations: [],
    });
    const { tx, state } = migrationTx([active, released, zero]);

    const result = await backfillInventoryCommitments.run(tx as never);

    expect(state.commitments).toHaveLength(2);
    expect(state.commitments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "rocket_request",
        sourceId: "line-1",
        businessKey: "coupang-rocket:account-1:PO-1:PRODUCT-1",
        unitQuantity: 2,
        status: "active",
        inventoryGeneration: 12n,
        createdBy: "user-1",
      }),
      expect.objectContaining({
        sourceId: "line-2",
        status: "released",
        releasedBy: "user-2",
        releasedAt,
        releaseReason: "쿠팡 요청 취소",
      }),
    ]));
    expect(state.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sellpiaInventorySkuId: "sku-1",
        unitsPerItem: 2,
        quantity: 4,
      }),
    ]));
    expect(result.details).toMatchObject({
      confirmationCount: 2,
      lineCount: 2,
      allocationCount: 2,
      conflictCount: 0,
    });
  });

  it("is idempotent on rerun after validating existing rows", async () => {
    const { tx, state } = migrationTx([confirmationLine()]);

    await backfillInventoryCommitments.run(tx as never);
    await expect(backfillInventoryCommitments.run(tx as never)).resolves.toMatchObject({
      affectedRows: 0,
    });

    expect(state.commitments).toHaveLength(1);
    expect(state.allocations).toHaveLength(1);
  });

  it("fails instead of choosing between active lines with the same business key", async () => {
    const duplicate = confirmationLine({
      id: "line-duplicate",
      confirmationId: "confirmation-duplicate",
    });
    const { tx } = migrationTx([confirmationLine(), duplicate]);

    await expect(backfillInventoryCommitments.run(tx as never)).rejects.toThrow(
      /active business key/i,
    );
  });
});
