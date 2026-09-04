import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from "@/lib/extension-bridge";
import {
  COMPETITOR_EXTENSION_MIN_VERSION,
  collectCompetitorCatalogFromExtension,
  detectCompetitorExtensionGate,
  isVersionAtLeast,
  requireCompetitorCatalogExtension,
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

  it('uses the direct, allowlisted competitor source action without a server-selected target payload', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      attemptId: '10000000-0000-4000-8000-000000000001',
      terminalState: 'COMPLETE',
    });

    await expect(collectCompetitorCatalogFromExtension({
      extensionId: 'coupang-extension',
      idempotencyKey: 'stable-retry-key',
      input: { target: 'seller_id', sellerId: 'seller_123' },
    })).resolves.toMatchObject({ terminalState: 'COMPLETE' });

    expect(sendToExtension).toHaveBeenCalledWith(
      'coupang-extension',
      {
        action: 'collectAdvertisingCompetitorCatalog',
        idempotencyKey: 'stable-retry-key',
        target: 'seller_id',
        sellerId: 'seller_123',
      },
      null,
    );
  });

  it('requires a current direct-source capable extension before starting collection', async () => {
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

    await expect(requireCompetitorCatalogExtension()).resolves.toBe('coupang-extension');
  });
});
