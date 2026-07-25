import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdTrendsData } from "@kiditem/shared/advertising";
import AdCollectionDailyChart from "./AdCollectionDailyChart";

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: mockApiGet },
}));

const emptyTrends = {
  daily: [],
  accountDaily: [],
  accountSummary: null,
  firstHalf: {
    spend: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    roas: 0,
    ctr: 0,
    cvr: 0,
  },
  secondHalf: {
    spend: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    roas: 0,
    ctr: 0,
    cvr: 0,
  },
  gradeBudget: { A: 0, B: 0, C: 0 },
} as AdTrendsData;

function shiftDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("AdCollectionDailyChart interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(emptyTrends);
  });

  it("applies a custom date range to both the label and API request", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AdCollectionDailyChart
          initialTrends={emptyTrends}
          period="14d"
          onPeriodChange={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "기간" }));
    const fromInput = screen.getByLabelText("광고 성과 시작일") as HTMLInputElement;
    const toInput = screen.getByLabelText("광고 성과 종료일") as HTMLInputElement;
    const to = toInput.value;
    const from = shiftDate(to, -3);

    fireEvent.change(fromInput, { target: { value: from } });
    fireEvent.change(toInput, { target: { value: to } });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    expect(
      screen.getByText(new RegExp(`^${from} ~ ${to}`)),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        `/api/ads/campaigns/trends?from=${from}&to=${to}`,
      );
    });
  });

  it("keeps daily collection completeness out of the performance chart", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AdCollectionDailyChart
          initialTrends={emptyTrends}
          period="14d"
          onPeriodChange={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByText(/^수집 \d+\/\d+일$/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/광고 성과 일별 수집 상태/),
    ).not.toBeInTheDocument();
  });

  it("keeps the chart preset synchronized with the page-wide period", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onPeriodChange = vi.fn();
    const view = render(
      <QueryClientProvider client={queryClient}>
        <AdCollectionDailyChart
          initialTrends={emptyTrends}
          period="14d"
          onPeriodChange={onPeriodChange}
        />
      </QueryClientProvider>,
    );

    const referenceDate = shiftDate(
      new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
      -1,
    );
    const sevenDayFrom = shiftDate(referenceDate, -6);

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <AdCollectionDailyChart
          initialTrends={emptyTrends}
          period="7d"
          onPeriodChange={onPeriodChange}
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        new RegExp(`^${sevenDayFrom} ~ ${referenceDate}`),
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        `/api/ads/campaigns/trends?from=${sevenDayFrom}&to=${referenceDate}`,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "이번달" }));
    expect(onPeriodChange).toHaveBeenCalledWith("month");
  });
});
