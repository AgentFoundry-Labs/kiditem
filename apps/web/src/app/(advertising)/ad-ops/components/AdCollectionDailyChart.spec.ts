import { describe, expect, it } from "vitest";
import type { AdMeasuredMetrics, AdTrendsData } from "@kiditem/shared/advertising";
import {
  buildCollectionChartPoints,
  enumerateDateKeys,
  isCustomRangeInvalid,
  presetDateRange,
  selectableRangeEndDate,
} from "./AdCollectionDailyChart";

function metrics(spend: number, revenue: number): AdMeasuredMetrics {
  return {
    spend,
    revenue,
    impressions: 0,
    clicks: 0,
    conversions: null,
    roas: spend > 0 ? (revenue / spend) * 100 : null,
    ctr: null,
    cvr: null,
  };
}

function trends(overrides: Partial<AdTrendsData> = {}): AdTrendsData {
  return {
    knownThrough: "2026-07-23",
    from: "2026-07-16",
    to: "2026-07-18",
    daily: [],
    summary: {
      source: "coupang_ads",
      periodDayCount: 1,
      latestBusinessDate: "2026-07-16",
      observedAt: "2026-07-17T00:00:00.000Z",
      metrics: metrics(0, 0),
      orders: null,
    },
    ...overrides,
  };
}

describe("AdCollectionDailyChart data model", () => {
  it("counts a measured zero day as collected and keeps an unmeasured day as a hole", () => {
    const chart = buildCollectionChartPoints(
      trends({
        daily: [
          { date: "2026-07-16", metrics: metrics(0, 0), orders: 0 },
          { date: "2026-07-17", metrics: null, orders: null },
        ],
      }),
      ["2026-07-16", "2026-07-17", "2026-07-18"],
    );

    expect(chart.collectedCount).toBe(1);
    expect(chart.points).toEqual([
      { date: "2026-07-16", label: "07-16", spend: 0, revenue: 0, roas: null, collected: true },
      { date: "2026-07-17", label: "07-17", spend: null, revenue: null, roas: null, collected: false },
      { date: "2026-07-18", label: "07-18", spend: null, revenue: null, roas: null, collected: false },
    ]);
  });

  it("labels the chart source only from the server summary", () => {
    expect(buildCollectionChartPoints(trends(), []).sourceLabel).toBe(
      "쿠팡 광고 캠페인 합산 · 2026-07-16까지",
    );
    expect(
      buildCollectionChartPoints(
        trends({
          summary: {
            source: "unavailable",
            periodDayCount: 0,
            latestBusinessDate: null,
            observedAt: null,
            metrics: null,
            orders: null,
          },
        }),
        [],
      ).sourceLabel,
    ).toBe("미수집");
    expect(buildCollectionChartPoints(null, []).sourceLabel).toBe("-");
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
      presetDateRange("month", "2026-07-31"),
    ).toBeNull();
    expect(presetDateRange("month", "2026-08-01")).toEqual({
      from: "2026-08-01", to: "2026-08-01",
    });
    expect(selectableRangeEndDate("2026-08-01")).toBe("2026-07-31");
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
