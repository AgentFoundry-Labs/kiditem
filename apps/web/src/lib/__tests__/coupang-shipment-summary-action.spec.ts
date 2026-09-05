import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectAndPersistCoupangShipmentSummary } from "../coupang-shipment-summary-action";

const attemptId = "11111111-1111-4111-8111-111111111111";
const entry = {
  date: "2026-09-01",
  count: 2,
  boxes: 4,
  capturedAt: "2026-09-06T00:00:00Z",
  verified: true,
};
const attempt = {
  attemptId,
  state: "RUNNING",
  generation: "1",
  attemptToken: "server-token",
  plan: {
    sourceType: "coupang_shipment_summary",
    parserVersion: "shipment-summary-v1",
    maxPages: 40,
  },
  expiresAt: "2099-01-01T00:00:00Z",
  actualCutoffAt: null,
  errorCode: null,
  errorMessage: null,
};

describe("shipment action at HTTP and Chrome boundaries", () => {
  const messages: Record<string, unknown>[] = [];
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  let complete: Record<string, unknown>;
  beforeEach(() => {
    messages.length = 0;
    calls.length = 0;
    complete = {
      ...attempt,
      state: "COMPLETE",
      actualCutoffAt: entry.capturedAt,
      capturedItems: [entry],
      items: [entry],
    };
    localStorage.setItem("kiditem-order-ext-id", "test-extension");
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: (
          _id: string,
          message: Record<string, unknown>,
          callback: (reply: unknown) => void,
        ) => {
          messages.push(message);
          callback(
            message.action === "ping"
              ? {
                  success: true,
                  version: "test",
                  capabilities: {
                    kiditemEnvironmentProfilesV1: true,
                    coupangShipmentSummarySourceOwnerV1: true,
                    collectCoupangShipmentDateSummaryValidatedV1: true,
                    coupangShipmentSummaryCollectionSessionV1: true,
                  },
                }
              : { success: true, attemptId, terminalState: "COMPLETE" },
          );
        },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url, "http://localhost").pathname;
        calls.push({ path, init });
        if (path === "/api/auth/extension-handoff")
          return Response.json({ token: "a".repeat(43) });
        if (path.endsWith("/date-summary/attempts") && init?.method === "POST")
          return Response.json(attempt);
        if (path.endsWith(`/attempts/${attemptId}`))
          return Response.json(complete);
        return Response.json(
          { message: `unexpected ${path}` },
          { status: 404 },
        );
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("uses the owner exact COMPLETE rows, sends only attempt identity to Chrome, and never resaves provider data", async () => {
    expect(await collectAndPersistCoupangShipmentSummary()).toEqual({
      status: "collected",
      latest: { date: "2026-09-01", count: 2, boxes: 4 },
      items: [{ date: "2026-09-01", count: 2, boxes: 4 }],
    });
    expect(
      messages.filter(
        (message) => message.action === "collectCoupangShipmentDateSummary",
      ),
    ).toEqual([{ action: "collectCoupangShipmentDateSummary", attemptId }]);
    expect(calls.some((call) => call.init?.method === "PUT")).toBe(false);
    expect(
      messages.some(
        (message) => message.action === "finalizeCollectionSession",
      ),
    ).toBe(false);
  });
  it("keeps an empty COMPLETE distinct from retained calendar history", async () => {
    complete = { ...complete, capturedItems: [] };
    expect(await collectAndPersistCoupangShipmentSummary()).toEqual({
      status: "empty",
      items: [],
    });
    expect(
      calls.some((call) => call.path.endsWith(`/attempts/${attemptId}`)),
    ).toBe(true);
  });
  it("ignores Chrome success when the exact owner reports failure", async () => {
    complete = {
      ...complete,
      state: "FAILED",
      errorCode: "coupang_cookie_bloat",
      errorMessage: "쿠키를 정리해주세요.",
    };
    await expect(
      collectAndPersistCoupangShipmentSummary(),
    ).rejects.toMatchObject({ code: "coupang_cookie_bloat" });
  });
  it("recovers a lost begin response using the same idempotency key, then uses the exact terminal read", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    let lost = false;
    vi.mocked(fetch).mockImplementation(async (...args) => {
      const response = await original(...args);
      if (String(args[0]).endsWith("/date-summary/attempts") && !lost) {
        lost = true;
        throw new Error("response lost");
      }
      return response;
    });
    const quiet = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      expect((await collectAndPersistCoupangShipmentSummary()).status).toBe(
        "collected",
      );
    } finally {
      quiet.mockRestore();
    }
    const starts = calls.filter((call) =>
      call.path.endsWith("/date-summary/attempts"),
    );
    expect(starts).toHaveLength(2);
    expect(new Headers(starts[0].init?.headers).get("Idempotency-Key")).toBe(
      new Headers(starts[1].init?.headers).get("Idempotency-Key"),
    );
  });
  it("recovers a lost Chrome callback from owner COMPLETE, but never invents terminal success for RUNNING", async () => {
    const runtime = (
      window as unknown as {
        chrome: {
          runtime: {
            lastError?: { message: string };
            sendMessage: (...args: unknown[]) => void;
          };
        };
      }
    ).chrome.runtime;
    const original = runtime.sendMessage;
    runtime.sendMessage = (...args: unknown[]) => {
      const message = args[1] as { action: string };
      if (message.action !== "collectCoupangShipmentDateSummary")
        return original(...args);
      runtime.lastError = { message: "reply lost" };
      (args[2] as (value: unknown) => void)(undefined);
      delete runtime.lastError;
    };
    expect((await collectAndPersistCoupangShipmentSummary()).status).toBe(
      "collected",
    );
    complete = { ...complete, state: "RUNNING", actualCutoffAt: null };
    await expect(
      collectAndPersistCoupangShipmentSummary(),
    ).rejects.toMatchObject({ code: "SOURCE_RUNNING" });
  });
});
