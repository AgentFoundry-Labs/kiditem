import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWingSalesRankCheckStatus,
  runWingSalesRankCheck,
} from "../lib/rank-extension";
import BatchRankCheck from "./BatchRankCheck";

const RUN_ID_1 = "11111111-1111-4111-8111-111111111111";
const RUN_ID_2 = "22222222-2222-4222-8222-222222222222";
const mockCollectionSession = vi.hoisted(() => vi.fn());
const mockSendCollectionControl = vi.hoisted(() => vi.fn());

vi.mock("../lib/rank-extension", () => ({
  getWingSalesRankCheckStatus: vi.fn(),
  runWingSalesRankCheck: vi.fn(),
}));

vi.mock("@/hooks/useBrowserCollectionSession", () => ({
  useBrowserCollectionSession: mockCollectionSession,
}));

vi.mock("@/lib/browser-collection-session", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/browser-collection-session")
  >()),
  sendBrowserCollectionControl: mockSendCollectionControl,
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
    window.history.replaceState(null, "", "/rank-tracking");
    vi.mocked(getWingSalesRankCheckStatus).mockReset();
    vi.mocked(runWingSalesRankCheck).mockReset();
    mockCollectionSession.mockReset();
    mockCollectionSession.mockReturnValue({ data: null });
    mockSendCollectionControl.mockReset();
  });

  it("does not reattach a terminal collection linked from a personal alert", async () => {
    window.history.replaceState(
      null,
      "",
      `/rank-tracking?collectionRun=${RUN_ID_1}`,
    );
    mockCollectionSession.mockReturnValue({
      data: {
        runId: RUN_ID_1,
        producer: "advertising.wing_rank",
        classification: "background_preferred",
        status: "cancelled",
        attempt: 1,
        restartStrategy: "web",
        progress: {
          current: 2,
          total: 946,
          completed: 2,
          failed: 0,
          label: "비누방울",
        },
        inputIdentity: { scheduled: false },
        attention: null,
        startedAt: 1_700_000_000_000,
        updatedAt: 1_700_000_001_000,
        finishedAt: 1_700_000_001_000,
      },
    });
    vi.mocked(getWingSalesRankCheckStatus).mockResolvedValue({
      status: "cancelled",
      runId: RUN_ID_1,
      total: 946,
      completed: 2,
      failed: 0,
      current: null,
    });

    renderBatchRankCheck();

    await waitFor(() => {
      expect(mockCollectionSession).toHaveBeenCalledWith(RUN_ID_1);
    });
    await waitFor(() => {
      expect(getWingSalesRankCheckStatus).not.toHaveBeenCalledWith(
        "coupang-extension",
        RUN_ID_1,
      );
    });
    expect(
      screen.getByRole("button", { name: "전체 상품 순위 수집" }),
    ).toBeEnabled();
  });

  it("restores an active extension run after the page reloads", async () => {
    vi.mocked(getWingSalesRankCheckStatus).mockResolvedValue({
      status: "running",
      runId: RUN_ID_1,
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
      RUN_ID_1,
    );
  });

  it("renders generic attention, restart, and cancel controls for the active run", async () => {
    vi.mocked(runWingSalesRankCheck).mockResolvedValue({
      success: true,
      started: true,
      runId: RUN_ID_2,
    });
    vi.mocked(getWingSalesRankCheckStatus)
      .mockResolvedValueOnce({
        status: "running",
        runId: RUN_ID_2,
        total: 947,
        completed: 67,
        failed: 0,
        current: "문구세트",
      })
      .mockResolvedValue({
        status: "attention_required",
        runId: RUN_ID_2,
        total: 947,
        completed: 67,
        failed: 0,
        current: "문구세트",
      });
    mockCollectionSession.mockImplementation((runId: string | null) => ({
      data:
        runId === RUN_ID_2
          ? {
              runId: RUN_ID_2,
              producer: "advertising.wing_rank",
              classification: "background_preferred",
              status: "attention_required",
              attempt: 1,
              restartStrategy: "web",
              progress: {
                current: 67,
                total: 947,
                completed: 67,
                failed: 0,
                label: "문구세트",
              },
              inputIdentity: { scheduled: false },
              attention: {
                reason: "marketplace_login",
                message: "Wing 로그인이 필요합니다.",
                canOpenTab: true,
              },
              startedAt: 1_700_000_000_000,
              updatedAt: 1_700_000_001_000,
              finishedAt: null,
            }
          : null,
    }));

    renderBatchRankCheck();

    await waitFor(() => {
      expect(mockCollectionSession).toHaveBeenCalledWith(RUN_ID_2);
    });
    expect(screen.getByText("Wing 로그인이 필요합니다.")).toBeInTheDocument();
    const attentionAction = screen.getByRole("button", { name: "확인 탭 열기" });
    expect(attentionAction).toBeInTheDocument();
    expect(attentionAction.closest('.fixed')).toHaveClass('bottom-4', 'right-4');
    expect(screen.getByRole("button", { name: "처음부터 재실행" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "중단" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "수집 중단" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "처음부터 재실행" }));
    await waitFor(() => {
      expect(runWingSalesRankCheck).toHaveBeenCalledWith(
        "coupang-extension",
        RUN_ID_2,
      );
    });
  });
});
