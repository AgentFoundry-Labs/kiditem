import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductKeywordRankOverviewResponseSchema } from "@kiditem/shared/advertising";

const { api } = vi.hoisted(() => ({ api: { getParsed: vi.fn() } }));

vi.mock("@/lib/api-client", () => ({ apiClient: api }));

import { fetchProductKeywordRanks } from "./rank-api";

const emptyOverview = {
  periodDays: 7,
  summary: {
    productCount: 0,
    optionCount: 0,
    duplicateOptionCount: 0,
    representativeKeywordCount: 0,
    rankedCount: 0,
    top20Count: 0,
    risingCount: 0,
    fallingCount: 0,
    outOfRangeCount: 0,
    notCollectedCount: 0,
  },
  rows: [],
};

describe("fetchProductKeywordRanks", () => {
  beforeEach(() => {
    api.getParsed.mockReset();
  });

  it("parses the shared rank overview response contract", async () => {
    api.getParsed.mockResolvedValue(emptyOverview);

    await expect(fetchProductKeywordRanks(7)).resolves.toEqual(emptyOverview);
    expect(api.getParsed).toHaveBeenCalledWith(
      "/api/ads/keyword-rank/products?days=7",
      ProductKeywordRankOverviewResponseSchema,
    );
  });

  it("rejects a response that drifts from the shared contract", async () => {
    api.getParsed.mockImplementation(async (_path, schema) =>
      schema.parse({ ...emptyOverview, periodDays: "7" }),
    );

    await expect(fetchProductKeywordRanks(7)).rejects.toThrow();
  });
});
