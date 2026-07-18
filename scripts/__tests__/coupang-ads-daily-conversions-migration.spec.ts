import { describe, expect, it, vi } from "vitest";
import {
  hasExactCoupangAdsDailyRawProvenance,
  recoverExactCoupangAdsDailyConversions,
  repairCoupangAdsDailyConversions,
  repairCoupangAdsDailyNormalizedJson,
  type CoupangAdsDailyCampaignEvidenceRun,
  type CoupangAdsDailyCandidate,
} from "../data-migrations/v0.1.21/002_repair_coupang_ads_daily_conversions";

const businessDate = new Date("2026-07-17T00:00:00.000Z");
const updatedAt = new Date("2026-07-18T00:00:00.000Z");

function dailyRawRow(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-07-17",
    adSpend: 40_215,
    adRevenue: 216_470,
    impressions: 2_000,
    clicks: 40,
    conversions: 216_470,
    orders: 3,
    providerConversionRate: 7.5,
    ...overrides,
  };
}

function candidate(
  overrides: Partial<CoupangAdsDailyCandidate> = {},
): CoupangAdsDailyCandidate {
  const rawJson = dailyRawRow();
  return {
    id: "kpi-1",
    organizationId: "org-1",
    channelAccountId: "account-1",
    businessDate,
    normalizedJson: {
      adSpend: 40_215,
      adRevenue: 216_470,
      impressions: 2_000,
      clicks: 40,
      conversions: 216_470,
      orders: 3,
      providerConversionRate: 7.5,
      providerRoas: 538.28,
    },
    rawJson,
    rawSnapshotId: "snapshot-1",
    updatedAt,
    rawSnapshot: {
      id: "snapshot-1",
      organizationId: "org-1",
      channel: "coupang",
      source: "coupang_ads",
      pageType: "dashboard_daily",
      businessDate,
      rawJson,
      normalizedJson: null,
      scrapeRun: {
        id: "daily-run-1",
        organizationId: "org-1",
        channelAccountId: "account-1",
        channel: "coupang",
        source: "coupang_ads",
        pageType: "dashboard_daily",
        businessDate,
        periodStart: businessDate,
        periodEnd: businessDate,
        status: "complete",
      },
    },
    ...overrides,
  };
}

function campaignRun(
  overrides: Partial<CoupangAdsDailyCampaignEvidenceRun> = {},
): CoupangAdsDailyCampaignEvidenceRun {
  return {
    id: "campaign-run-1",
    organizationId: "org-1",
    channelAccountId: "account-1",
    channel: "coupang",
    source: "advertising",
    pageType: "campaign",
    businessDate,
    periodStart: businessDate,
    periodEnd: businessDate,
    status: "complete",
    metaJson: {
      campaignName: "_전체",
      kpis: {
        "광고 전환 판매수": { value: "4", unit: "건" },
        "광고 전환 주문수": { value: "3", unit: "건" },
        전환율: { value: "7.5", unit: "%" },
      },
    },
    ...overrides,
  };
}

function txFor(
  rows: CoupangAdsDailyCandidate[],
  runs: CoupangAdsDailyCampaignEvidenceRun[],
) {
  return {
    channelAccountDailyKpiSnapshot: {
      findMany: vi.fn().mockResolvedValue(rows),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    channelScrapeRun: {
      findMany: vi.fn().mockResolvedValue(runs),
    },
  };
}

describe("Coupang ads daily conversions migration", () => {
  it("uses the durable v0.1.21 migration identity", () => {
    expect(repairCoupangAdsDailyConversions).toMatchObject({
      id: "v0.1.21:002_repair_coupang_ads_daily_conversions",
      releaseVersion: "0.1.21",
    });
  });

  it("anchors the corrupted raw row to its exact account and day", () => {
    expect(hasExactCoupangAdsDailyRawProvenance(candidate())).toBe(true);
    expect(
      hasExactCoupangAdsDailyRawProvenance(
        candidate({
          rawSnapshot: {
            ...candidate().rawSnapshot!,
            scrapeRun: {
              ...candidate().rawSnapshot!.scrapeRun!,
              channelAccountId: "another-account",
            },
          },
        }),
      ),
    ).toBe(false);
  });

  it("recovers sales quantity 4, never the order count 3", () => {
    expect(
      recoverExactCoupangAdsDailyConversions({
        candidate: candidate(),
        campaignRuns: [campaignRun()],
      }),
    ).toBe(4);

    const source = candidate().normalizedJson as Record<string, unknown>;
    const result = repairCoupangAdsDailyNormalizedJson(source, 4);
    expect(result).toEqual({
      changed: true,
      normalizedJson: {
        ...source,
        conversions: 4,
        providerConversionRate: 7.5,
      },
    });
    expect((source as { conversions: number }).conversions).toBe(216_470);
  });

  it("preserves Coupang's order-based provider conversion rate", () => {
    const result = repairCoupangAdsDailyNormalizedJson(
      {
        adRevenue: 216_470,
        conversions: 3,
        orders: 3,
        clicks: 40,
        providerConversionRate: 7.5,
      },
      4,
    );

    expect(result?.normalizedJson).toMatchObject({
      conversions: 4,
      orders: 3,
      providerConversionRate: 7.5,
    });
  });

  it("accepts identical duplicate evidence runs", () => {
    expect(
      recoverExactCoupangAdsDailyConversions({
        candidate: candidate(),
        campaignRuns: [
          campaignRun(),
          campaignRun({ id: "campaign-run-2" }),
        ],
      }),
    ).toBe(4);
  });

  it("rejects missing or conflicting exact sales evidence", () => {
    expect(
      recoverExactCoupangAdsDailyConversions({
        candidate: candidate(),
        campaignRuns: [
          campaignRun({
            metaJson: {
              campaignName: "_전체",
              kpis: { "광고 전환 주문수": "3" },
            },
          }),
        ],
      }),
    ).toBeNull();
    expect(
      recoverExactCoupangAdsDailyConversions({
        candidate: candidate(),
        campaignRuns: [
          campaignRun(),
          campaignRun({
            id: "campaign-run-2",
            metaJson: {
              campaignName: "_전체",
              kpis: {
                "광고 전환 판매수": "5",
                "광고 전환 주문수": "3",
                전환율: "7.5%",
              },
            },
          }),
        ],
      }),
    ).toBeNull();
  });

  it("rejects evidence from a different account or business date", () => {
    expect(
      recoverExactCoupangAdsDailyConversions({
        candidate: candidate(),
        campaignRuns: [campaignRun({ channelAccountId: "account-2" })],
      }),
    ).toBeNull();
    expect(
      recoverExactCoupangAdsDailyConversions({
        candidate: candidate(),
        campaignRuns: [
          campaignRun({
            businessDate: new Date("2026-07-16T00:00:00.000Z"),
          }),
        ],
      }),
    ).toBeNull();
  });

  it("updates only conversions with account/date/CAS guards", async () => {
    const row = candidate();
    const tx = txFor([row], [campaignRun()]);

    const result = await repairCoupangAdsDailyConversions.run(tx as never);

    expect(tx.channelScrapeRun.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        channel: "coupang",
        source: "advertising",
        pageType: "campaign",
        status: "complete",
        OR: [
          {
            organizationId: "org-1",
            channelAccountId: "account-1",
            businessDate,
          },
        ],
      }),
      orderBy: expect.any(Array),
      select: expect.objectContaining({ metaJson: true }),
    });
    expect(tx.channelAccountDailyKpiSnapshot.updateMany).toHaveBeenCalledWith({
      where: {
        id: "kpi-1",
        organizationId: "org-1",
        channelAccountId: "account-1",
        channel: "coupang",
        source: "coupang_ads",
        kpiType: "coupang_ads_daily",
        businessDate,
        rawSnapshotId: "snapshot-1",
        updatedAt,
      },
      data: {
        normalizedJson: expect.objectContaining({
          conversions: 4,
          orders: 3,
          providerConversionRate: 7.5,
        }),
      },
    });
    expect(result).toEqual({
      affectedRows: 1,
      details: {
        scannedCount: 1,
        evidenceRunCount: 1,
        updatedCount: 1,
        alreadyExactCount: 0,
        unresolvedEvidenceCount: 0,
        rawJsonUpdatedCount: 0,
      },
    });
  });

  it("fails before every write when one corrupted day lacks evidence", async () => {
    const first = candidate();
    const secondDate = new Date("2026-04-19T00:00:00.000Z");
    const second = candidate({
      id: "kpi-2",
      businessDate: secondDate,
      rawJson: dailyRawRow({ date: "2026-04-19" }),
      rawSnapshotId: null,
      rawSnapshot: null,
      normalizedJson: {
        ...(candidate().normalizedJson as Record<string, unknown>),
        conversions: 3,
      },
    });
    const tx = txFor([first, second], [campaignRun()]);

    await expect(
      repairCoupangAdsDailyConversions.run(tx as never),
    ).rejects.toThrow(/evidence is missing or ambiguous.*kpi-2/);
    expect(tx.channelAccountDailyKpiSnapshot.updateMany).not.toHaveBeenCalled();
  });

  it("fails before every write when duplicate runs conflict", async () => {
    const tx = txFor(
      [candidate()],
      [
        campaignRun(),
        campaignRun({
          id: "campaign-run-2",
          metaJson: {
            campaignName: "_전체",
            kpis: {
              "광고 전환 판매수": "5",
              "광고 전환 주문수": "3",
              전환율: "7.5%",
            },
          },
        }),
      ],
    );

    await expect(
      repairCoupangAdsDailyConversions.run(tx as never),
    ).rejects.toThrow(/evidence is missing or ambiguous/);
    expect(tx.channelAccountDailyKpiSnapshot.updateMany).not.toHaveBeenCalled();
  });

  it("is a no-op when no daily KPI rows exist", async () => {
    const tx = txFor([], []);

    await expect(
      repairCoupangAdsDailyConversions.run(tx as never),
    ).resolves.toMatchObject({ affectedRows: 0 });
    expect(tx.channelScrapeRun.findMany).not.toHaveBeenCalled();
    expect(tx.channelAccountDailyKpiSnapshot.updateMany).not.toHaveBeenCalled();
  });

  it("fails when a candidate changes after preflight", async () => {
    const tx = txFor([candidate()], [campaignRun()]);
    tx.channelAccountDailyKpiSnapshot.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repairCoupangAdsDailyConversions.run(tx as never),
    ).rejects.toThrow(/changed during repair/);
  });
});
