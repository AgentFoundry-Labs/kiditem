import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelWingSalesRankCheck,
  getWingSalesRankCheckStatus,
  runWingSalesRankCheck,
} from "../lib/rank-extension";
import BatchRankCheck from "./BatchRankCheck";

vi.mock("../lib/rank-extension", () => ({
  cancelWingSalesRankCheck: vi.fn(),
  getWingSalesRankCheckStatus: vi.fn(),
  runWingSalesRankCheck: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

function renderBatchRankCheck() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BatchRankCheck
        extensionId="coupang-extension"
        disabledReason={null}
        onCompleted={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("BatchRankCheck", () => {
  beforeEach(() => {
    vi.mocked(getWingSalesRankCheckStatus).mockReset();
    vi.mocked(runWingSalesRankCheck).mockReset();
    vi.mocked(cancelWingSalesRankCheck).mockReset();
  });

  it("restores an active extension run after the page reloads", async () => {
    vi.mocked(getWingSalesRankCheckStatus).mockResolvedValue({
      status: "running",
      runId: "wing-run-1",
      total: 12,
      completed: 3,
      failed: 1,
      current: "문구세트",
    });

    renderBatchRankCheck();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Wing 수집 중…" }),
      ).toBeDisabled();
    });
    await waitFor(() => {
      expect(screen.getByText("처리 4 / 전체 12")).toBeInTheDocument();
    });
    expect(screen.getByText("문구세트")).toBeInTheDocument();
    expect(getWingSalesRankCheckStatus).toHaveBeenCalledWith(
      "coupang-extension",
      null,
    );
    expect(getWingSalesRankCheckStatus).toHaveBeenCalledWith(
      "coupang-extension",
      "wing-run-1",
    );
  });

  it("requests a cooperative stop for the active run", async () => {
    vi.mocked(getWingSalesRankCheckStatus).mockResolvedValue({
      status: "running",
      runId: "wing-run-2",
      total: 947,
      completed: 67,
      failed: 0,
      current: "문구세트",
    });
    vi.mocked(cancelWingSalesRankCheck).mockResolvedValue({
      success: true,
      cancelled: true,
      runId: "wing-run-2",
    });

    renderBatchRankCheck();
    const cancelButton = await screen.findByRole("button", {
      name: "수집 중단",
    });

    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(cancelWingSalesRankCheck).toHaveBeenCalledWith(
        "coupang-extension",
        "wing-run-2",
      );
    });
  });
});
