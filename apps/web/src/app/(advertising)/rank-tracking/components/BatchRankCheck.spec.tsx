import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import {
  listWingRankSessions,
  openWingRankAttention,
  runWingSalesRankCheck,
} from "../lib/rank-extension";
import BatchRankCheck from "./BatchRankCheck";
import type { WingRankBatch, WingRankCurrentBatch } from "@kiditem/shared/advertising";

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn(), getNullable: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/extension-auth", () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock("../lib/rank-extension", () => ({
  detectRankExtensionGate: vi.fn(async () => ({
    status: "ready",
    extensionId: "coupang-extension",
    version: "1.2.102",
  })),
  rankExtensionGateMessage: () => null,
  runWingSalesRankCheck: vi.fn(async () => ({ success: true, started: true })),
  cancelWingRankBatch: vi.fn(),
  listWingRankSessions: vi.fn(async () => []),
  openWingRankAttention: vi.fn(async () => undefined),
}));

const EXTENSION_ID = "coupang-extension";
const BATCH_PATH = "/api/ads/keyword-rank/wing/batch-attempts";
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";

function batch(states: Array<"RUNNING" | "COMPLETE" | "FAILED">): WingRankBatch {
  return {
    attempts: states.map((state, index) => ({
      attemptId: [ID1, ID2][index]!,
      keyword: ["연필", "색연필"][index]!,
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
        keyword: ["연필", "색연필"][index]!,
        maxPages: 5,
        targets: [{
          vendorItemId: `V${index}`,
          productName: "연필",
          category: null,
          keyword: ["연필", "색연필"][index]!,
          candidateIndex: 0,
        }],
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
        phase: "primary" as const,
        maxPages: 5,
      })),
    },
  };
}

let owner: WingRankCurrentBatch | null;

function renderCheck(props: { extensionId?: string | null; disabledReason?: string | null } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const completed = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <BatchRankCheck
        extensionId={props.extensionId === undefined ? EXTENSION_ID : props.extensionId}
        disabledReason={props.disabledReason ?? null}
        onCompleted={completed}
      />
    </QueryClientProvider>,
  );
  return { ...view, client, completed };
}

beforeEach(() => {
  vi.clearAllMocks();
  owner = null;
  vi.mocked(apiClient.getNullable).mockImplementation(async (path: string) => {
    if (path !== `${BATCH_PATH}/current`) throw new Error(`unexpected GET ${path}`);
    return owner;
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string, _body?: unknown, options?: unknown) => {
    if (path !== BATCH_PATH) throw new Error(`unexpected POST ${path}`);
    const key = (options as { headers: Record<string, string> }).headers["Idempotency-Key"]!;
    owner = { batchKey: key, ...batch(["COMPLETE", "RUNNING"]) };
    return batch(["COMPLETE", "RUNNING"]);
  });
});

describe("Wing rank owner UI", () => {
  it("shows the current batch progress and every failure from the owner without dispatching on mount", async () => {
    owner = { batchKey: KEY, ...batch(["FAILED", "FAILED"]) };
    const h = renderCheck();

    expect(await screen.findByText("처리 2 / 전체 2")).toBeInTheDocument();
    expect(screen.getByText("실패 2건 · 이전 정상 데이터는 유지됩니다.")).toBeInTheDocument();
    expect(screen.getByText("연필: Wing 로그인이 필요합니다.")).toBeInTheDocument();
    expect(screen.getByText("색연필: Wing 로그인이 필요합니다.")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveClass("max-h-48", "overflow-y-auto");
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(runWingSalesRankCheck).not.toHaveBeenCalled();
    expect(h.completed).toHaveBeenCalledTimes(1);
  });

  it("shows keywords a stop cancelled as stopped, not as failures", async () => {
    const stopped = batch(["FAILED", "FAILED"]);
    stopped.attempts[1] = {
      ...stopped.attempts[1]!,
      errorCode: "COLLECTION_CANCELLED",
      errorMessage: "키워드 순위 수집이 취소되었습니다.",
    };
    owner = { batchKey: KEY, ...stopped };
    renderCheck();

    expect(await screen.findByText("처리 2 / 전체 2")).toBeInTheDocument();
    expect(screen.getByText("실패 1건 · 이전 정상 데이터는 유지됩니다.")).toBeInTheDocument();
    expect(screen.getByText("중단 1건")).toBeInTheDocument();
    expect(screen.getByText("연필: Wing 로그인이 필요합니다.")).toBeInTheDocument();
    expect(screen.queryByText(/색연필:/)).not.toBeInTheDocument();
  });

  it("opens the exact failed attempt's attention tab", async () => {
    owner = { batchKey: KEY, ...batch(["COMPLETE", "FAILED"]) };
    vi.mocked(listWingRankSessions).mockResolvedValue([{
      attemptId: ID2,
      producer: "advertising.wing_rank",
      progress: { current: 0, total: 1, completed: 0, failed: 0, label: "색연필" },
      attention: { reason: "marketplace_login", message: "Wing 로그인이 필요합니다.", canOpenTab: true },
    }] as never);
    renderCheck();

    fireEvent.click(await screen.findByRole("button", { name: "색연필 확인 탭 열기" }));

    await waitFor(() => expect(openWingRankAttention).toHaveBeenCalledWith(EXTENSION_ID, ID2));
  });

  it("starts the batch from the shared control and refreshes when owner results change", async () => {
    const h = renderCheck();

    fireEvent.click(await screen.findByRole("button", { name: "전체 상품 순위 수집" }));

    expect(await screen.findByText("처리 1 / 전체 2")).toBeInTheDocument();
    expect(screen.getByText("수집 중 · 1/2개 키워드")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).has("rankBatch")).toBe(false);
    await waitFor(() => expect(h.completed).toHaveBeenCalledTimes(1));

    owner = { ...owner!, ...batch(["COMPLETE", "FAILED"]) };
    await act(() => h.client.refetchQueries({ queryKey: queryKeys.ads.wingRankCurrentBatch() }));

    expect(await screen.findByText("실패 1건 · 이전 정상 데이터는 유지됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 상품 순위 수집" })).toBeEnabled();
    await waitFor(() => expect(h.completed).toHaveBeenCalledTimes(2));
  });

  it("holds the start behind the page's extension reason", async () => {
    renderCheck({ extensionId: null, disabledReason: "KIDITEM 쿠팡 확장프로그램이 필요합니다." });

    expect(await screen.findByRole("button", { name: "전체 상품 순위 수집" })).toBeDisabled();
    expect(screen.getByText("KIDITEM 쿠팡 확장프로그램이 필요합니다.")).toBeInTheDocument();
  });

  it("keeps the last known batch progress beside a light hint when a later owner read fails", async () => {
    owner = { batchKey: KEY, ...batch(["COMPLETE", "RUNNING"]) };
    const h = renderCheck();
    expect(await screen.findByText("처리 1 / 전체 2")).toBeInTheDocument();

    vi.mocked(apiClient.getNullable).mockRejectedValue(new ApiError(403, "FORBIDDEN", "denied"));
    await act(() => h.client.refetchQueries({ queryKey: queryKeys.ads.wingRankCurrentBatch() }));

    expect(await screen.findByText("상태를 다시 확인하는 중")).toBeInTheDocument();
    expect(screen.getByText("처리 1 / 전체 2")).toBeInTheDocument();
    expect(screen.queryByText("수집 상태를 불러오지 못했습니다.")).not.toBeInTheDocument();
  });
});
