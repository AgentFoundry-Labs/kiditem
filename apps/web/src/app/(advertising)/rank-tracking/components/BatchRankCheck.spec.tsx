import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BatchRankCheck from "./BatchRankCheck";
import type { WingRankBatch } from "@kiditem/shared/advertising";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";
function batch(
  states: Array<"RUNNING" | "COMPLETE" | "FAILED">,
): WingRankBatch {
  return {
    attempts: states.map((state, index) => ({
      attemptId: [ID1, ID2][index],
      keyword: ["연필", "색연필"][index],
      generation: "1",
      state,
      expiresAt: "2026-09-10T00:00:00.000Z",
      actualCutoffAt: state === "COMPLETE" ? "2026-09-06T00:00:00.000Z" : null,
      itemCount: state === "COMPLETE" ? 20 : 0,
      errorCode: state === "FAILED" ? "WING_RANK_PROVIDER_WALL" : null,
      errorMessage: state === "FAILED" ? "Wing 로그인이 필요합니다." : null,
      plan: {
        sourceType: "coupang_wing_rank",
        parserVersion: "wing-rank-v1",
        keyword: ["연필", "색연필"][index],
        maxPages: 5,
        targets: [
          {
            vendorItemId: `V${index}`,
            productName: "연필",
            category: null,
            keyword: ["연필", "색연필"][index],
            candidateIndex: 0,
          },
        ],
      },
    })),
    selection: {
      productCount: 2,
      candidateCount: 2,
      keywordCount: 2,
      targetKeywordCount: 2,
      resumed: true,
      pendingProductCount: 1,
      targets: ["연필", "색연필"].map((keyword, index) => ({
        keyword,
        vendorItemIds: [`V${index}`],
        productCount: 1,
        primaryProductCount: 1,
        pendingProductCount: 1,
        pendingPrimaryProductCount: 1,
        phase: "primary",
        maxPages: 5,
      })),
    },
  };
}

function setup(initial: WingRankBatch) {
  let current = initial;
  let sessions: unknown[] = [];
  let dispatchReply: unknown = { success: true, started: true };
  const messages: Array<Record<string, unknown>> = [];
  const requests: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    requests.push({ url: String(url), init });
    if (
      !String(url).endsWith("/extension-handoff") &&
      !String(url).endsWith("/wing/batch-attempts")
    ) {
      throw new Error(`Unexpected owner route ${url}`);
    }
    const body = String(url).endsWith("/extension-handoff")
      ? { token: "a".repeat(43) }
      : current;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: (
        _id: string,
        message: Record<string, unknown>,
        callback: (reply: unknown) => void,
      ) => {
        messages.push(message);
        callback(
          message.action === "listCollectionSessions"
            ? sessions
            : message.action === "collectAdvertisingWingRankBatch"
              ? dispatchReply
              : { success: true },
        );
      },
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const completed = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <BatchRankCheck
        extensionId="coupang-extension"
        disabledReason={null}
        onCompleted={completed}
      />
    </QueryClientProvider>,
  );
  return {
    ...view,
    client,
    completed,
    messages,
    requests,
    setResult: (value: WingRankBatch) => {
      current = value;
    },
    setSessions: (value: unknown[]) => {
      sessions = value;
    },
    setDispatchReply: (value: unknown) => {
      dispatchReply = value;
    },
  };
}

describe("Wing rank owner UI", () => {
  beforeEach(() => window.history.replaceState(null, "", "/rank-tracking"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows persisted per-keyword progress after dispatch ACK and refreshes when owner results change", async () => {
    const h = setup(batch(["COMPLETE", "RUNNING"]));
    fireEvent.click(
      screen.getByRole("button", { name: "전체 상품 순위 수집" }),
    );
    expect(await screen.findByText("처리 1 / 전체 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Wing 수집 중…" }),
    ).toBeDisabled();
    const start = h.requests.find(
      ({ init, url }) =>
        init.method === "POST" && url.endsWith("/wing/batch-attempts"),
    )!;
    expect(JSON.parse(String(start.init.body))).toEqual({});
    const key = new Headers(start.init.headers).get("Idempotency-Key");
    expect(new URLSearchParams(window.location.search).get("rankBatch")).toBe(
      key,
    );
    expect(h.messages).toContainEqual({
      action: "collectAdvertisingWingRankBatch",
      idempotencyKey: key,
    });
    expect(h.completed).toHaveBeenCalledTimes(1);
    h.setResult(batch(["COMPLETE", "FAILED"]));
    await h.client.invalidateQueries();
    expect(
      await screen.findByText("실패 1건 · 이전 정상 데이터는 유지됩니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "전체 상품 순위 수집" }),
    ).toBeEnabled();
    expect(
      screen.getByText("색연필: Wing 로그인이 필요합니다."),
    ).toBeInTheDocument();
    await waitFor(() => expect(h.completed).toHaveBeenCalledTimes(2));
  });

  it("reloads owner results without re-dispatching and opens the exact failed attempt attention tab", async () => {
    window.history.replaceState(null, "", `/rank-tracking?rankBatch=${KEY}`);
    const h = setup(batch(["COMPLETE", "FAILED"]));
    h.setSessions([
      {
        attemptId: ID2,
        producer: "advertising.wing_rank",
        progress: {
          current: 0,
          total: 1,
          completed: 0,
          failed: 0,
          label: "색연필",
        },
        attention: {
          reason: "marketplace_login",
          message: "Wing 로그인이 필요합니다.",
          canOpenTab: true,
        },
      },
    ]);
    expect(await screen.findByText("처리 2 / 전체 2")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "색연필 확인 탭 열기" }),
    );
    await waitFor(() =>
      expect(h.messages).toContainEqual({
        action: "openCollectionAttentionTab",
        attemptId: ID2,
      }),
    );
    expect(h.requests.every(({ init }) => init.method !== "POST")).toBe(true);
    expect(
      h.messages.some(
        ({ action }) => action === "collectAdvertisingWingRankBatch",
      ),
    ).toBe(false);
  });

  it("cancels by receipt key but keeps running until the owner confirms terminal results", async () => {
    window.history.replaceState(null, "", `/rank-tracking?rankBatch=${KEY}`);
    const h = setup(batch(["RUNNING", "RUNNING"]));
    fireEvent.click(await screen.findByRole("button", { name: "수집 중단" }));
    await waitFor(() =>
      expect(h.messages).toContainEqual({
        action: "cancelAdvertisingWingRankBatch",
        idempotencyKey: KEY,
      }),
    );
    expect(
      screen.getByRole("button", { name: "Wing 수집 중…" }),
    ).toBeDisabled();
    h.setResult(batch(["FAILED", "FAILED"]));
    await h.client.invalidateQueries();
    expect(await screen.findByText("처리 2 / 전체 2")).toBeInTheDocument();
  });

  it("treats empty admission as a no-op without retaining or polling a nonexistent receipt", async () => {
    const h = setup({
      attempts: [],
      selection: {
        productCount: 0,
        candidateCount: 0,
        keywordCount: 0,
        targetKeywordCount: 0,
        pendingProductCount: 0,
        resumed: false,
        targets: [],
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "전체 상품 순위 수집" }),
    );
    await waitFor(() =>
      expect(h.requests.some(({ init }) => init.method === "POST")).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "전체 상품 순위 수집" }),
      ).toBeEnabled(),
    );
    expect(new URLSearchParams(window.location.search).has("rankBatch")).toBe(
      false,
    );
    expect(
      h.messages.some(
        ({ action }) => action === "collectAdvertisingWingRankBatch",
      ),
    ).toBe(false);
    expect(
      h.requests.filter(
        ({ init, url }) =>
          url.endsWith("/batch-attempts") && init.method !== "POST",
      ),
    ).toEqual([]);
  });

  it("keeps an unconfirmed dispatch visible without publishing or discarding the owner attempts", async () => {
    const h = setup(batch(["RUNNING", "RUNNING"]));
    h.setDispatchReply({
      success: false,
      error: "확장 응답이 유실되었습니다.",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "전체 상품 순위 수집" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "확장 응답이 유실되었습니다.",
    );
    expect(await screen.findByText("처리 0 / 전체 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수집 중단" })).toBeEnabled();
    expect(h.completed).not.toHaveBeenCalled();
    expect(
      new URLSearchParams(window.location.search).get("rankBatch"),
    ).not.toBeNull();
    expect(
      h.requests.filter(
        ({ init, url }) =>
          init.method === "POST" && !url.endsWith("/extension-handoff"),
      ),
    ).toHaveLength(1);
  });
});
