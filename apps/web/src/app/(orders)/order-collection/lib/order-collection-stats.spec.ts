import { describe, expect, it } from "vitest";
import {
  buildOrderCollectionPipelineSummary,
  buildOrderCollectionSummary,
  mergeServerTodayOrders,
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
    fileKind: overrides.fileKind,
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
    expect(summary.mallStatsByKey.get("icecream-mall")).toEqual({
      key: "icecream-mall",
      name: "아이스크림몰",
      files: 1,
      productRows: 5,
      latestAt: Date.UTC(2026, 5, 26, 8, 0),
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
  });

  it("excludes tracking artifacts from order collection totals", () => {
    const tracking = historyItem({
      id: "tracking",
      fileKind: "tracking",
      collectionMode: "tracking",
      collectionDate: "2026-07-27",
      mallKey: "art09",
      mallName: "아트공구",
      orderNumbers: ["ORDER-1"],
      outputRows: 1,
      productRows: 0,
    });

    const summary = buildOrderCollectionSummary([tracking], "2026-07-27");
    expect(summary.totals).toEqual({ orders: 0, products: 0 });
    expect(summary.dailyStats).toEqual([]);
    expect(summary.mallStats).toEqual([]);
  });
});

describe("mergeServerTodayOrders (KID-234)", () => {
  const local = buildOrderCollectionSummary(
    [
      historyItem({
        id: "kidkids-local",
        mallKey: "kidkids",
        mallName: "키드키즈",
        collectionDate: "2026-07-14",
        orderNumbers: ["ORDER-1", "ORDER-2", "ORDER-3"],
        outputRows: 6,
        productRows: 3,
        convertedAt: Date.UTC(2026, 6, 14, 1, 0),
      }),
      historyItem({
        id: "onch-local",
        mallKey: "onch",
        mallName: "온채널",
        collectionDate: "2026-07-14",
        orderNumbers: ["OC-1"],
        outputRows: 2,
        productRows: 1,
        convertedAt: Date.UTC(2026, 6, 14, 2, 0),
      }),
    ],
    "2026-07-14",
  ).mallStatsByKey;

  it("takes 당일 and 신규 only from the Orders server reader — the browser's files and send records never change them", () => {
    const cards = mergeServerTodayOrders(local, {
      kidkids: { orderCount: 5, newCount: 2 },
      art09: { orderCount: 4, newCount: 4 },
    });

    // 이 브라우저는 3건·미전송 3건으로 기억하지만 카드는 서버의 5건·2건이다.
    expect(cards.get("kidkids")).toEqual({
      key: "kidkids", name: "키드키즈", files: 1, productRows: 3, latestAt: Date.UTC(2026, 6, 14, 1, 0),
      orderRows: 5, newRows: 2,
    });
    // 다른 PC에서 걷은 몰도 서버 값으로 보인다.
    expect(cards.get("art09")).toMatchObject({ files: 0, orderRows: 4, newRows: 4 });
    // 서버가 오늘 성공 수집을 모르는 몰은 로컬 파일이 있어도 0 — 파일 목록·수집 시각만 로컬이다.
    expect(cards.get("onch")).toMatchObject({ files: 1, orderRows: 0, newRows: 0, latestAt: Date.UTC(2026, 6, 14, 2, 0) });
  });

  it("shows zeros until the server answers", () => {
    expect(mergeServerTodayOrders(local, undefined).get("kidkids")).toMatchObject({ orderRows: 0, newRows: 0 });
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
      todayOrders: null,
      waiting: 2,
      transmissionRequested: 2,
      inventoryPending: 2,
      trackingSent: 0,
      done: 0,
    });
  });

  it("does not treat generated tracking files as collected or sent orders", () => {
    expect(buildOrderCollectionPipelineSummary([
      historyItem({
        fileKind: "tracking",
        collectionMode: "tracking",
        collectionDate: "2026-07-27",
        orderNumbers: ["ORDER-1"],
        outputRows: 1,
        productRows: 0,
      }),
    ], "2026-07-27")).toEqual({
      todayOrders: null,
      waiting: 0,
      transmissionRequested: 0,
      inventoryPending: 0,
      trackingSent: 0,
      done: 0,
    });
  });
});

function dayKeyForTest(): string {
  const value = new Date(Date.UTC(2026, 5, 26, 2, 30));
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
