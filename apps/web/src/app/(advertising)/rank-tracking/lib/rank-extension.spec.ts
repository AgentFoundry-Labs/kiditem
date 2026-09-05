import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from "@/lib/extension-bridge";
import {
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

  it("accepts the merged extension and rejects a pre-merge install", () => {
    // The three extensions merged into one and restarted at 1.0.0, so every
    // pre-merge line (0.1.x order-collector, 1.2.x ads, 2.x sourcing) is below
    // the floor even where its number looks larger.
    expect(RANK_EXTENSION_MIN_VERSION).toBe("1.0.0");
    expect(
      isRankExtensionVersionAtLeast("0.9.9", RANK_EXTENSION_MIN_VERSION),
    ).toBe(false);
    expect(
      isRankExtensionVersionAtLeast("0.1.95", RANK_EXTENSION_MIN_VERSION),
    ).toBe(false);
    expect(
      isRankExtensionVersionAtLeast("1.0.0", RANK_EXTENSION_MIN_VERSION),
    ).toBe(true);
    expect(
      isRankExtensionVersionAtLeast("1.0.2", RANK_EXTENSION_MIN_VERSION),
    ).toBe(true);
    expect(
      isRankExtensionVersionAtLeast("2.0.0", RANK_EXTENSION_MIN_VERSION),
    ).toBe(true);
  });

  it("rejects an extension without browserCollectionSessions", async () => {
    vi.mocked(isChromeExtensionRuntimeAvailable).mockReturnValue(true);
    vi.mocked(detectExtensionId).mockResolvedValue("coupang-extension");
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      version: "1.0.2",
      capabilities: {
        wingCatalogSalesRank: true,
        wingCatalogSalesRankCancel: true,
        browserCollectionSessions: false,
      },
    });

    await expect(detectRankExtensionGate()).resolves.toEqual({
      status: "outdated",
      extensionId: "coupang-extension",
      version: "1.0.2",
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
