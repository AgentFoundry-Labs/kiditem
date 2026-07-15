import { describe, expect, it } from "vitest";
import {
  buildOrderCollectionPipelineSummary,
  buildOrderCollectionSummary,
} from "./order-collection-stats";
import type { StoredOrderCollectionFile } from "./order-generated-file-store";

function historyItem(
  overrides: Partial<StoredOrderCollectionFile>,
): StoredOrderCollectionFile {
  return {
    id: overrides.id ?? "item",
    sourceName: overrides.sourceName ?? "source.xlsx",
    fileName: overrides.fileName ?? "source.xlsx",
    blob:
      overrides.blob ??
      new Blob(["test"], { type: "application/vnd.ms-excel" }),
    previewRows: overrides.previewRows ?? [],
    sourceRows: overrides.sourceRows ?? 0,
    outputRows: overrides.outputRows ?? 0,
    productRows: overrides.productRows ?? 0,
    skippedRows: overrides.skippedRows ?? 0,
    convertedAt: overrides.convertedAt ?? Date.UTC(2026, 5, 26, 2, 30),
    collectionDate: overrides.collectionDate,
    collectionMode: overrides.collectionMode,
    collectedRows: overrides.collectedRows,
    mallKey: overrides.mallKey,
    mallName: overrides.mallName,
    orderNumbers: overrides.orderNumbers,
    transmissionRequestedAt: overrides.transmissionRequestedAt,
  };
}

describe("buildOrderCollectionSummary", () => {
  it("aggregates totals, daily rows, and mall lookup in one summary", () => {
    const summary = buildOrderCollectionSummary(
      [
        historyItem({
          id: "browser-icecream",
          mallKey: "icecream-mall",
          mallName: "아이스크림몰",
          outputRows: 15,
          productRows: 5,
          convertedAt: Date.UTC(2026, 5, 26, 8, 0),
          collectionDate: "2026-06-26",
          collectionMode: "browser",
        }),
        historyItem({
          id: "legacy-icecream",
          sourceName: "아이스크림몰_legacy.xlsx",
          fileName: "아이스크림몰_legacy.xlsx",
          outputRows: 9,
          productRows: 4,
          convertedAt: Date.UTC(2026, 5, 25, 8, 0),
          collectionDate: "2026-06-25",
          collectionMode: "manual-upload",
        }),
      ],
      "2026-06-26",
    );

    expect(summary.latestAt).toBe(Date.UTC(2026, 5, 26, 8, 0));
    expect(summary.totals).toEqual({ orders: 15, products: 9 });
    expect(summary.dailyStats.map((stat) => stat.key)).toEqual([
      "2026-06-26",
      "2026-06-25",
    ]);
    expect(summary.dailyStats[0]).toMatchObject({
      orderRows: 10,
      productRows: 5,
      browserFiles: 1,
      manualFiles: 0,
      malls: ["아이스크림몰"],
    });
    expect(summary.mallStats).toHaveLength(1);
    expect(summary.mallStatsByKey.get("icecream-mall")).toMatchObject({
      name: "아이스크림몰",
      files: 1,
      orderRows: 10,
      newRows: 10,
      productRows: 5,
    });
  });

  it("deduplicates today orders by order number and excludes transmission requests from 신규", () => {
    const summary = buildOrderCollectionSummary(
      [
        historyItem({
          id: "first",
          mallKey: "kidkids",
          mallName: "키드키즈",
          collectionDate: "2026-07-14",
          orderNumbers: ["ORDER-1", "ORDER-2"],
          outputRows: 4,
          productRows: 2,
          convertedAt: Date.UTC(2026, 6, 14, 1, 0),
        }),
        historyItem({
          id: "second",
          mallKey: "kidkids",
          mallName: "키드키즈",
          collectionDate: "2026-07-14",
          orderNumbers: ["ORDER-2", "ORDER-3"],
          outputRows: 4,
          productRows: 2,
          transmissionRequestedAt: Date.UTC(2026, 6, 14, 2, 0),
          convertedAt: Date.UTC(2026, 6, 14, 2, 0),
        }),
        historyItem({
          id: "yesterday",
          mallKey: "kidkids",
          mallName: "키드키즈",
          collectionDate: "2026-07-13",
          orderNumbers: ["ORDER-OLD"],
          outputRows: 2,
          productRows: 1,
        }),
      ],
      "2026-07-14",
    );

    expect(summary.mallStatsByKey.get("kidkids")).toMatchObject({
      files: 2,
      orderRows: 3,
      newRows: 1,
      productRows: 2,
      latestAt: Date.UTC(2026, 6, 14, 2, 0),
    });
  });

  it("uses the largest same-day collection when order numbers are unavailable", () => {
    const summary = buildOrderCollectionSummary(
      [
        historyItem({
          id: "smaller-collection",
          mallKey: "onch",
          mallName: "온채널",
          collectionDate: "2026-07-14",
          outputRows: 12,
          productRows: 4,
          convertedAt: Date.UTC(2026, 6, 14, 1, 0),
        }),
        historyItem({
          id: "larger-collection",
          mallKey: "onch",
          mallName: "온채널",
          collectionDate: "2026-07-14",
          outputRows: 19,
          productRows: 6,
          convertedAt: Date.UTC(2026, 6, 14, 2, 0),
        }),
      ],
      "2026-07-14",
    );

    expect(summary.mallStatsByKey.get("onch")).toMatchObject({
      files: 2,
      orderRows: 13,
      newRows: 13,
      productRows: 6,
    });
  });

  it("uses zero order count when output rows are smaller than product rows", () => {
    const summary = buildOrderCollectionSummary(
      [
        historyItem({
          mallKey: "kidkids",
          outputRows: 2,
          productRows: 5,
        }),
      ],
      dayKeyForTest(),
    );

    expect(summary.totals.orders).toBe(0);
    expect(summary.mallStatsByKey.get("kidkids")?.orderRows).toBe(0);
  });
});

describe("buildOrderCollectionPipelineSummary", () => {
  it("counts extension submissions as transmission requests rather than completed orders", () => {
    const summary = buildOrderCollectionPipelineSummary(
      [
        historyItem({
          collectionDate: "2026-07-14",
          outputRows: 4,
          productRows: 2,
          transmissionRequestedAt: Date.UTC(2026, 6, 14, 2, 0),
        }),
        historyItem({
          id: "waiting",
          collectionDate: "2026-07-14",
          outputRows: 3,
          productRows: 1,
        }),
      ],
      "2026-07-14",
    );

    expect(summary).toEqual({
      todayOrders: 4,
      waiting: 2,
      transmissionRequested: 2,
      trackingSent: 0,
      done: 0,
    });
  });
});

function dayKeyForTest(): string {
  const value = new Date(Date.UTC(2026, 5, 26, 2, 30));
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
