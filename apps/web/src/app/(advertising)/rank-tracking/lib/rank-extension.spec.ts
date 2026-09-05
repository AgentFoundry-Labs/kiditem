import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KIDITEM_EXTENSION_ID_KEY } from "@/lib/extension-bridge";
import {
  detectRankExtensionGate,
  isRankExtensionVersionAtLeast,
  RANK_EXTENSION_MIN_VERSION,
  runWingSalesRankCheck,
} from "./rank-extension";

function extensionReply(reply: unknown, messages: unknown[] = []) {
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: (
        _id: string,
        message: unknown,
        callback: (value: unknown) => void,
      ) => {
        messages.push(message);
        callback(reply);
      },
    },
  });
}

describe("rank extension version gate", () => {
  beforeEach(() => {
    window.localStorage.setItem(KIDITEM_EXTENSION_ID_KEY, "coupang-extension");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
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
    extensionReply({
      success: true,
      version: "1.0.2",
      capabilities: {
        kiditemEnvironmentProfilesV1: true,
        wingRankSourceOwnerV1: true,
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

  it("rejects a legacy rank collector even when the older rank and session capabilities are present", async () => {
    extensionReply({
      success: true,
      version: "1.0.2",
      capabilities: {
        kiditemEnvironmentProfilesV1: true,
        browserCollectionSessions: true,
        wingCatalogSalesRank: true,
        wingCatalogSalesRankCancel: true,
      },
    });
    await expect(detectRankExtensionGate()).resolves.toMatchObject({
      status: "outdated",
    });
  });

  it("accepts the source-owner transport without requiring retired rank capabilities", async () => {
    extensionReply({
      success: true,
      version: "1.0.2",
      capabilities: {
        kiditemEnvironmentProfilesV1: true,
        browserCollectionSessions: true,
        wingRankSourceOwnerV1: true,
      },
    });
    await expect(detectRankExtensionGate()).resolves.toEqual({
      status: "ready",
      extensionId: "coupang-extension",
      version: "1.0.2",
    });
  });

  it("sends only the frozen batch receipt key, without a page-owned plan", async () => {
    const messages: unknown[] = [];
    extensionReply(
      {
        success: true,
        started: true,
      },
      messages,
    );

    await runWingSalesRankCheck(
      "coupang-extension",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(messages).toEqual([
      {
        action: "collectAdvertisingWingRankBatch",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      },
    ]);
  });
});
