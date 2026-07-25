import { describe, expect, it } from "vitest";
import type { AdTrendsData } from "@kiditem/shared/advertising";
import {
  buildCollectionChartPoints,
  enumerateDateKeys,
  isCustomRangeInvalid,
  presetDateRange,
  selectableRangeEndDate,
  selectCollectionRows,
} from "./AdCollectionDailyChart";

function metrics(spend: number, revenue: number) {
  return {
    spend,
    revenue,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    roas: spend > 0 ? (revenue / spend) * 100 : 0,
    ctr: 0,
    cvr: 0,
  };
}

function trends(overrides: Partial<AdTrendsData>): AdTrendsData {
  return {
    daily: [],
    accountDaily: [],
    accountSummary: null,
    firstHalf: metrics(0, 0),
    secondHalf: metrics(0, 0),
    gradeBudget: { A: 0, B: 0, C: 0 },
    ...overrides,
  } as AdTrendsData;
}

describe("AdCollectionDailyChart data model", () => {
  it("uses account daily facts even when listing facts contain a positive row", () => {
    const data = trends({
      daily: [{ date: "2026-07-17", metrics: metrics(10, 20) }],
      accountDaily: [
        { date: "2026-07-16", metrics: metrics(100, 500), orders: 1 },
        { date: "2026-07-17", metrics: metrics(200, 900), orders: 2 },
      ],
    });

    const selected = selectCollectionRows(data);
    expect(selected.sourceLabel).toBe("쿠팡 광고센터 계정 일별");
    expect(selected.rows).toHaveLength(2);
  });

  it("does not treat listing facts as completed account-level collection", () => {
    const data = trends({
      daily: [{ date: "2026-07-17", metrics: metrics(10, 20) }],
      accountDaily: [],
    });

    const selected = selectCollectionRows(data);
    expect(selected.sourceLabel).toBe("광고 성과 수집 필요");
    expect(selected.rows).toEqual([]);
  });

  it("counts a zero-metric fact as collected and leaves a missing day as a gap", () => {
    const data = trends({
      accountDaily: [
        { date: "2026-07-16", metrics: metrics(0, 0), orders: 0 },
      ],
    });
    const chart = buildCollectionChartPoints(data, [
      "2026-07-16",
      "2026-07-17",
    ]);

    expect(chart.collectedCount).toBe(1);
    expect(chart.points[0]).toMatchObject({
      collected: true,
      spend: 0,
      revenue: 0,
    });
    expect(chart.points[1]).toMatchObject({
      collected: false,
      spend: null,
      revenue: null,
    });
  });

  it("builds inclusive preset and custom date ranges", () => {
    expect(presetDateRange("7d", "2026-07-23")).toEqual({
      from: "2026-07-17",
      to: "2026-07-23",
    });
    expect(presetDateRange("14d", "2026-07-23")).toEqual({
      from: "2026-07-10",
      to: "2026-07-23",
    });
    expect(presetDateRange("month", "2026-07-23")).toEqual({
      from: "2026-07-01",
      to: "2026-07-23",
    });
    expect(
      presetDateRange("month", "2026-07-31", "2026-08-01"),
    ).toEqual({
      from: "2026-08-01",
      to: "2026-08-01",
    });
    expect(selectableRangeEndDate("2026-08-01")).toBe("2026-08-01");
    expect(selectableRangeEndDate("2026-08-02")).toBe("2026-08-01");
    expect(enumerateDateKeys("2026-07-22", "2026-07-24")).toEqual([
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ]);
    expect(
      isCustomRangeInvalid("2026-07-20", "2026-07-24", "2026-07-23"),
    ).toBe(true);
    expect(
      isCustomRangeInvalid("2026-07-20", "2026-07-23", "2026-07-23"),
    ).toBe(false);
  });
});
