import { sendToExtension } from "@/lib/extension-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelWingSalesRankCheck,
  isRankExtensionVersionAtLeast,
  RANK_EXTENSION_MIN_VERSION,
} from "./rank-extension";

vi.mock("@/lib/extension-bridge", () => ({
  detectExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
}));

describe("rank extension version gate", () => {
  beforeEach(() => {
    vi.mocked(sendToExtension).mockReset();
  });

  it("requires the cooperative Wing cancellation capability", () => {
    expect(RANK_EXTENSION_MIN_VERSION).toBe("1.2.31");
    expect(
      isRankExtensionVersionAtLeast("1.2.30", RANK_EXTENSION_MIN_VERSION),
    ).toBe(false);
    expect(
      isRankExtensionVersionAtLeast("1.2.31", RANK_EXTENSION_MIN_VERSION),
    ).toBe(true);
  });

  it("reports a stop only when the extension accepted cancellation", async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      cancelled: false,
      status: "done",
    });

    await expect(
      cancelWingSalesRankCheck("coupang-extension", "wing-run-1"),
    ).rejects.toThrow("이미 종료");
  });
});
