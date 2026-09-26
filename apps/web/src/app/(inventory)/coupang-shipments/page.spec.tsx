import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CoupangShipmentsPage from "./page";

/** 확장 경계만 가짜로 둔다(실행 시작). 실행·달력 읽기는 HTTP 경계에서 진짜 코드를 쓴다. */
const start = vi.hoisted(() => ({ requestOperationStart: vi.fn() }));
vi.mock("@/lib/operation-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/operation-start")>()),
  requestOperationStart: start.requestOperationStart,
}));

const replaceMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({
  pathname: "/coupang-shipments",
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => navigation.params,
}));

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: OPERATION_ID,
    kind: "orders.coupang_shipment_summary",
    status: "succeeded",
    lockKeys: [],
    plan: { maxPages: 40 },
    progress: { current: 1, total: 40, done: true },
    result: { dates: 1, rows: 3 },
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: "2026-09-01T00:00:00.000Z",
    finishedAt: "2026-09-01T00:00:10.000Z",
    expiresAt: "2026-09-01T00:30:00.000Z",
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}
const items = [
  { date: "2026-07-25", count: 3, boxes: 5, capturedAt: "2026-07-25T00:00:00Z", verified: true },
  { date: "2026-06-20", count: null, boxes: null, capturedAt: "2026-06-20T00:00:00Z", verified: false },
];

describe("쿠팡 쉽먼트 발송일 조회 — 실행 계약 읽기와 달력(HTTP 경계)", () => {
  let latest: Record<string, unknown> | null;
  const calls: Array<{ path: string; method?: string }> = [];
  const clients: QueryClient[] = [];
  beforeEach(() => {
    sessionStorage.clear();
    navigation.params = new URLSearchParams();
    replaceMock.mockReset();
    start.requestOperationStart.mockReset();
    calls.length = 0;
    latest = operation();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url, "http://localhost").pathname;
        calls.push({ path, method: init?.method });
        if (path === "/api/operations") return Response.json({ operations: latest ? [latest] : [] });
        if (path.endsWith("/cancel")) return Response.json({ operation: { ...latest, status: "cancelled" } });
        return Response.json(path.endsWith("/date-summary") ? { items } : { days: [] });
      }),
    );
  });
  afterEach(() => {
    cleanup();
    clients.forEach((client) => client.clear());
    clients.length = 0;
    vi.unstubAllGlobals();
  });
  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    return render(
      <QueryClientProvider client={client}>
        <CoupangShipmentsPage />
      </QueryClientProvider>,
    );
  }

  it("URL의 날짜를 되살리고, 마지막 성공 조회 시각과 미인증 기준 칸을 보인다 — 열 때 조회하지 않는다", async () => {
    navigation.params = new URLSearchParams({ month: "2026-06", date: "2026-06-20" });
    mount();
    const finished = await screen.findByText(/마지막 완료/);
    // 화면은 KST 문장으로 보이고, 기계용 ISO 문자열은 dateTime 속성에만 남는다.
    expect(finished).not.toHaveTextContent("2026-09-01T00:00:10.000Z");
    expect(finished.querySelector("time")?.getAttribute("dateTime")).toBe("2026-09-01T00:00:10.000Z");
    expect(finished).toHaveTextContent(/2026/);
    expect(screen.getByText(/최근 조회 결과 1일/)).toBeInTheDocument();
    expect(screen.getByText("2026년 6월")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /20/ })).toHaveClass("bg-purple-50");
    expect(screen.getByText(/미인증 이력 1일/)).toBeInTheDocument();
    expect(calls.every((call) => !call.method || call.method === "GET")).toBe(true);
    expect(start.requestOperationStart).not.toHaveBeenCalled();
  });

  it("저장된 달력 위치를 되살린다", async () => {
    sessionStorage.setItem("kiditem:route-state:coupang-shipments:v1", JSON.stringify({ month: "2026-06", date: "2026-06-20" }));
    mount();
    await waitFor(() => expect(replaceMock.mock.calls.some(([href]) => String(href).includes("date=2026-06-20"))).toBe(true));
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("실패한 최근 조회는 실패 문장을 보이고 달력 이력은 그대로 둔다", async () => {
    latest = operation({ status: "failed", result: null, errorCode: "SITE_COOKIE_BLOAT", errorMessage: "쿠팡 쿠키를 정리해주세요.", finishedAt: "2026-09-02T00:00:00.000Z" });
    mount();
    expect(await screen.findByText(/최근 조회 실패/)).toHaveTextContent("쿠팡 쿠키를 정리해주세요.");
    expect(screen.getByText("2026년 7월")).toBeInTheDocument();
  });

  it("진행 중인 조회는 쪽 진행과 중단 버튼을 보이고, 중단은 실행 계약의 cancel을 부른다", async () => {
    const user = userEvent.setup();
    latest = operation({ status: "executing", result: null, finishedAt: null, progress: { current: 6, total: 40, done: false } });
    mount();
    expect(await screen.findByText(/쉽먼트 조회 진행 중 \(6\/40쪽\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "수집 중단" }));
    await waitFor(() => expect(calls).toContainEqual({ path: `/api/operations/${OPERATION_ID}/cancel`, method: "POST" }));
  });

  it("다시 조회는 확장에 실행을 시작시키고, 끝나면 달력을 다시 읽어 결과를 보인다", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText(/최근 조회 결과 1일/);
    start.requestOperationStart.mockImplementation(async () => {
      latest = operation({ status: "executing", result: null, finishedAt: null, progress: { current: 0, total: 40, done: false } });
      return { outcome: "started", operationId: OPERATION_ID };
    });
    await user.click(screen.getByRole("button", { name: /다시 조회/ }));
    expect(start.requestOperationStart).toHaveBeenCalledWith("orders.coupang_shipment_summary", {}, {});
    expect(await screen.findByRole("button", { name: "수집 중단" })).toBeInTheDocument();
    latest = operation({ result: { dates: 2, rows: 4 } });
    expect(await screen.findByText(/최근 조회 결과 2일/, {}, { timeout: 2500 })).toBeInTheDocument();
    const calendarReads = calls.filter((call) => call.path.endsWith("/date-summary")).length;
    expect(calendarReads).toBeGreaterThanOrEqual(2);
  });
});
