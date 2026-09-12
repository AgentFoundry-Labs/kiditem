import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CoupangShipmentsPage from "./page";

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
const attempt = {
  attemptId: "11111111-1111-4111-8111-111111111111",
  state: "COMPLETE",
  generation: "1",
  plan: {
    sourceType: "coupang_shipment_summary",
    parserVersion: "shipment-summary-v1",
    maxPages: 40,
  },
  expiresAt: "2099-01-01T00:00:00Z",
  actualCutoffAt: "2026-09-01T00:00:00Z",
  errorCode: null,
  errorMessage: null,
};
const items = [
  {
    date: "2026-07-25",
    count: 3,
    boxes: 5,
    capturedAt: "2026-07-25T00:00:00Z",
    verified: true,
  },
  {
    date: "2026-06-20",
    count: 2,
    boxes: 2,
    capturedAt: "2026-06-20T00:00:00Z",
    verified: false,
  },
];

describe("shipment source reload and calendar route state at HTTP boundary", () => {
  let source: Record<string, unknown>;
  const calls: Array<{ path: string; method?: string }> = [];
  const clients: QueryClient[] = [];
  beforeEach(() => {
    sessionStorage.clear();
    navigation.params = new URLSearchParams();
    replaceMock.mockReset();
    calls.length = 0;
    source = {
      ready: true,
      refreshing: false,
      latestAttempt: attempt,
      latestComplete: attempt,
      items,
      capturedItems: [items[0]],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url, "http://localhost").pathname;
        calls.push({ path, method: init?.method });
        return Response.json(
          path.endsWith("/date-summary/source")
            ? source
            : path.endsWith("/date-summary")
              ? { items }
              : { days: [] },
        );
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
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    clients.push(client);
    return render(
      <QueryClientProvider client={client}>
        <CoupangShipmentsPage />
      </QueryClientProvider>,
    );
  }
  it("restores URL-selected date while displaying owner cutoff and unverified historical rows", async () => {
    navigation.params = new URLSearchParams({
      month: "2026-06",
      date: "2026-06-20",
    });
    mount();
    expect(await screen.findByText(/마지막 완료/)).toHaveTextContent(
      "2026-09-01T00:00:00Z",
    );
    expect(screen.getByText("2026년 6월")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /20/ })).toHaveClass(
      "bg-purple-50",
    );
    expect(screen.getByText(/미인증 이력 1일/)).toBeInTheDocument();
    expect(calls.every((call) => !call.method || call.method === "GET")).toBe(
      true,
    );
  });
  it("restores saved calendar position without collecting on mount", async () => {
    sessionStorage.setItem(
      "kiditem:route-state:coupang-shipments:v1",
      JSON.stringify({ month: "2026-06", date: "2026-06-20" }),
    );
    mount();
    await waitFor(() =>
      expect(
        replaceMock.mock.calls.some(([href]) =>
          String(href).includes("date=2026-06-20"),
        ),
      ).toBe(true),
    );
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
  it("reload shows owner failure beside previous cutoff and keeps calendar history", async () => {
    source = {
      ...source,
      ready: false,
      latestAttempt: {
        ...attempt,
        state: "FAILED",
        errorCode: "coupang_cookie_bloat",
        errorMessage: "쿠팡 쿠키를 정리해주세요.",
        actualCutoffAt: null,
      },
    };
    mount();
    expect(await screen.findByText(/최근 조회 실패/)).toHaveTextContent(
      "쿠팡 쿠키를 정리해주세요.",
    );
    expect(screen.getByText(/마지막 완료/)).toHaveTextContent(
      "2026-09-01T00:00:00Z",
    );
    expect(screen.getByText("2026년 7월")).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
  it("polls an existing RUNNING attempt after reload and displays empty COMPLETE without clearing history", async () => {
    source = {
      ...source,
      refreshing: true,
      latestAttempt: { ...attempt, state: "RUNNING", actualCutoffAt: null },
    };
    mount();
    expect(await screen.findByText(/쉽먼트 조회 진행 중/)).toBeInTheDocument();
    source = {
      ...source,
      refreshing: false,
      latestAttempt: attempt,
      capturedItems: [],
    };
    expect(
      await screen.findByText(/최근 조회 결과 0일/, {}, { timeout: 2500 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/미인증 이력 1일/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
});
