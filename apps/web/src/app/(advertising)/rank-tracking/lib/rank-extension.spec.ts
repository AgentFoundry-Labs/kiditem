import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from "@/lib/extension-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCoupangKeywordRank,
  detectRankExtensionGate,
  isRankExtensionVersionAtLeast,
  RANK_EXTENSION_MIN_VERSION,
  runWingSalesRankCheck,
} from "./rank-extension";

vi.mock("@/lib/extension-bridge", () => ({
  detectExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
}));

describe("rank extension version gate", () => {
  beforeEach(() => {
    vi.mocked(sendToExtension).mockReset();
    vi.mocked(detectExtensionId).mockReset();
    vi.mocked(isChromeExtensionRuntimeAvailable).mockReset();
  });

  it("requires the generic collection-session extension release", () => {
    expect(RANK_EXTENSION_MIN_VERSION).toBe("1.2.33");
    expect(
      isRankExtensionVersionAtLeast("1.2.31", RANK_EXTENSION_MIN_VERSION),
    ).toBe(false);
    expect(
      isRankExtensionVersionAtLeast("1.2.32", RANK_EXTENSION_MIN_VERSION),
    ).toBe(false);
    expect(
      isRankExtensionVersionAtLeast("1.2.33", RANK_EXTENSION_MIN_VERSION),
    ).toBe(true);
  });

  it("rejects an extension without browserCollectionSessions", async () => {
    vi.mocked(isChromeExtensionRuntimeAvailable).mockReturnValue(true);
    vi.mocked(detectExtensionId).mockResolvedValue("coupang-extension");
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      version: "1.2.33",
      capabilities: {
        wingCatalogSalesRank: true,
        wingCatalogSalesRankCancel: true,
        browserCollectionSessions: false,
      },
    });

    await expect(detectRankExtensionGate()).resolves.toEqual({
      status: "outdated",
      extensionId: "coupang-extension",
      version: "1.2.33",
    });
  });

  it("preserves an attention run so the generic controls can recover it", async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: false,
      attentionRequired: true,
      runId: "11111111-1111-4111-8111-111111111111",
      error: "쿠팡 로그인이 필요합니다.",
    });

    await expect(
      checkCoupangKeywordRank("coupang-extension", {
        keyword: "문구세트",
      }),
    ).resolves.toMatchObject({
      attentionRequired: true,
      runId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("returns a cancelled single-rank run without turning it into a collection error", async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: false,
      cancelled: true,
      runId: "11111111-1111-4111-8111-111111111111",
    });

    await expect(
      checkCoupangKeywordRank("coupang-extension", {
        keyword: "문구세트",
      }),
    ).resolves.toMatchObject({
      cancelled: true,
      runId: "11111111-1111-4111-8111-111111111111",
      items: [],
    });
  });

  it("passes the current run id through a Wing same-run restart", async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      started: true,
      runId: "11111111-1111-4111-8111-111111111111",
    });

    await runWingSalesRankCheck(
      "coupang-extension",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(sendToExtension).toHaveBeenCalledWith("coupang-extension", {
      action: "runWingSalesRankCheck",
      runId: "11111111-1111-4111-8111-111111111111",
    });
  });
});
