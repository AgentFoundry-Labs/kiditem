import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from "@/lib/extension-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPETITOR_EXTENSION_MIN_VERSION,
  detectCompetitorExtensionGate,
  isVersionAtLeast,
} from "./competitor-extension";

vi.mock("@/lib/extension-bridge", () => ({
  detectExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
}));

describe("competitor extension version gate", () => {
  beforeEach(() => {
    vi.mocked(sendToExtension).mockReset();
    vi.mocked(detectExtensionId).mockResolvedValue('coupang-extension');
    vi.mocked(isChromeExtensionRuntimeAvailable).mockReturnValue(true);
  });
  it("requires the browser collection session extension version", () => {
    expect(COMPETITOR_EXTENSION_MIN_VERSION).toBe("1.0.0");
    expect(isVersionAtLeast("0.9.9", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("0.9.9", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("0.9.9", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("0.9.9", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("0.9.9", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("0.9.9", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("0.9.9", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("0.9.9", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      false,
    );
    expect(isVersionAtLeast("1.0.2", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      true,
    );
    expect(isVersionAtLeast("1.3.0", COMPETITOR_EXTENSION_MIN_VERSION)).toBe(
      true,
    );
  });

  it("reports a ready extension only when the safe capability gate passes", async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      version: '1.0.2',
      capabilities: {
        coupangKeywordRank: true,
        coupangCompetitorSeller: true,
        coupangCompetitorSellerCatalog: true,
        coupangCompetitorSellerCatalogOnDemand: true,
        browserCollectionSessions: true,
      },
    });

    await expect(detectCompetitorExtensionGate()).resolves.toEqual({
      status: 'ready',
      extensionId: 'coupang-extension',
      version: '1.0.2',
    });
  });
});
