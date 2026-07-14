import { sendToExtension } from "@/lib/extension-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPETITOR_EXTENSION_MIN_VERSION,
  isVersionAtLeast,
  runCompetitorCollection,
  runCompetitorSellerCollection,
} from "./competitor-extension";

vi.mock("@/lib/extension-bridge", () => ({
  detectExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
}));

describe("competitor extension version gate", () => {
  beforeEach(() => {
    vi.mocked(sendToExtension).mockReset();
  });
  it("requires the browser collection session extension version", () => {
    expect(COMPETITOR_EXTENSION_MIN_VERSION).toBe("1.2.33");
    expect(isVersionAtLeast("1.2.23", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.25", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.27", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.28", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.29", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.30", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.31", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.32", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.2.33", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      true,
    );
    expect(isVersionAtLeast("1.3.0", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      true,
    );
  });

  it("passes the current run id through all and seller same-run restarts", async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      started: true,
      runId: "11111111-1111-4111-8111-111111111111",
    });

    await runCompetitorCollection(
      "coupang-extension",
      "11111111-1111-4111-8111-111111111111",
    );
    await runCompetitorSellerCollection(
      "coupang-extension",
      "seller-a",
      "22222222-2222-4222-8222-222222222222",
    );

    expect(sendToExtension).toHaveBeenNthCalledWith(1, "coupang-extension", {
      action: "runCoupangKeywordRankCheck",
      runId: "11111111-1111-4111-8111-111111111111",
    });
    expect(sendToExtension).toHaveBeenNthCalledWith(
      2,
      "coupang-extension",
      {
        action: "runCoupangCompetitorSellerCatalog",
        sellerId: "seller-a",
        runId: "22222222-2222-4222-8222-222222222222",
      },
      30_000,
    );
  });
});
