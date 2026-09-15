import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderCollectionSourceStatus } from "@kiditem/shared/order-collection-source";
import { apiClient } from "@/lib/api-client";
import { MallAccountSection } from "./MallAccountSection";
import { MallCollectionControl } from "./MallCollectionControl";
import { mallOrderCollectionSource } from "../lib/mall-order-collection-source";
import type { MallCollectionStat } from "../lib/order-collection-stats";
import type { OrderCollectionMallAccount } from "../lib/order-mall-account-api";

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/browser-collection-session", () => ({
  sendBrowserCollectionControl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/extension-bridge", () => ({
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock("@/lib/extension-auth", () => ({ transferExtensionAuthTo: vi.fn() }));

const ORGANIZATION_ID = "99999999-9999-4999-8999-999999999999";
const RUNNING_ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";

function runningOwnerStatus(mallKey: string): OrderCollectionSourceStatus {
  return {
    mallKey,
    channelAccountId: null,
    running: {
      attemptId: RUNNING_ATTEMPT_ID,
      collectionMode: "browser",
      startedAt: "2026-09-15T01:00:00.000Z",
      expiresAt: "2026-09-15T01:30:00.000Z",
    },
    lastComplete: null,
    lastAttempt: null,
  };
}

function mallAccount(
  key: string,
  overrides: Partial<OrderCollectionMallAccount> = {},
): OrderCollectionMallAccount {
  return {
    key,
    name: overrides.name ?? key,
    configured: overrides.configured ?? true,
    enabled: overrides.enabled ?? true,
    loginId: overrides.loginId ?? "operator",
    hasPassword: overrides.hasPassword ?? true,
    siteUrl: overrides.siteUrl ?? "https://example.test",
    memo: overrides.memo ?? null,
    passwordUpdatedAt: overrides.passwordUpdatedAt ?? null,
    updatedAt: overrides.updatedAt ?? null,
  };
}

/**
 * 진행 중은 몰 카드가 마운트한 공용 컨트롤이 owner에게서 읽는다(KID-189). 구조만
 * 보는 테스트는 그 자리에 버튼 하나를 놓고, 게이트를 보는 테스트는
 * `ownerControl`로 진짜 컨트롤을 놓는다.
 */
function renderSection(
  accounts: OrderCollectionMallAccount[],
  stats = new Map<string, MallCollectionStat>(),
  collectionControls?: ReactNode,
  options: {
    ownerControl?: boolean;
    onOpenCalendar?: (account: OrderCollectionMallAccount) => void;
  } = {},
) {
  const callbacks = {
    onCollectMall: vi.fn(),
    onCollectAll: vi.fn(),
    onRetryFailedMalls: vi.fn(),
    onDraftChange: vi.fn(),
    onOpenMall: vi.fn(),
    onOpenSettings: vi.fn(),
    onPasswordVisibleChange: vi.fn(),
    onRefresh: vi.fn(),
    onSaveMallAccount: vi.fn(),
    onSettingsOpenChange: vi.fn(),
    onToggleAutoDetect: vi.fn(),
    onAutoIntervalChange: vi.fn(),
    onUploadTracking: vi.fn(),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
    <MallAccountSection
      mallAccounts={accounts}
      mallLoading={false}
      mallSaving={false}
      browserCollecting={false}
      onOpenCalendar={options.onOpenCalendar}
      renderCollectionControl={options.ownerControl
        ? (account, renderCard) => (
          <MallCollectionControl
            account={account}
            buildAdapter={(target) => mallOrderCollectionSource({
              organizationId: ORGANIZATION_ID,
              account: target,
              handOff: vi.fn().mockResolvedValue(undefined),
            })}
          >
            {renderCard}
          </MallCollectionControl>
        )
        : (account, renderCard) => renderCard({
          control: (
            <button type="button" onClick={() => callbacks.onCollectMall(account)}>
              {account.name} 수집
            </button>
          ),
          running: false,
        })}
      mallError={null}
      selectedMall={accounts[0]}
      mallDraft={{
        loginId: "",
        supplierLoginId: "",
        password: "",
        siteUrl: "",
        memo: "",
        enabled: true,
      }}
      mallSettingsOpen={false}
      mallPasswordLoading={false}
      mallPasswordVisible={false}
      configuredMallCount={
        accounts.filter((account) => account.configured).length
      }
      enabledMallCount={accounts.filter((account) => account.enabled).length}
      conversionState="idle"
      mallCollectionStats={stats}
      autoDetect={false}
      autoIntervalMin={30}
      autoIntervalOptions={[5, 10, 15, 30, 60]}
      autoLastRunAt={null}
      autoNextRunAt={null}
      autoRunning={false}
      failedMallCount={0}
      collectionControls={collectionControls}
      {...callbacks}
    />
    </QueryClientProvider>,
  );

  return callbacks;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.post).mockResolvedValue({});
});

describe("MallAccountSection", () => {
  it("preserves the c9 account cards with today and new-order stats", () => {
    const account = mallAccount("icecream-mall", { name: "아이스크림몰" });
    const stats = new Map<string, MallCollectionStat>([
      [
        account.key,
        {
          key: account.key,
          name: account.name,
          files: 2,
          orderRows: 17,
          newRows: 12,
          productRows: 23,
          latestAt: Date.UTC(2026, 6, 14, 1, 30),
        },
      ],
    ]);

    renderSection([account], stats);

    expect(
      screen.getByRole("article", { name: "아이스크림몰 계정 카드" }),
    ).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("당일")).toBeInTheDocument();
    expect(screen.getByText("신규")).toBeInTheDocument();
    expect(screen.getByTitle("오늘 수집한 주문 중 셀피아 미전송")).toBeInTheDocument();
    expect(screen.queryByText("전송 대기")).not.toBeInTheDocument();
    expect(screen.queryByText("누적 주문")).not.toBeInTheDocument();
    expect(screen.queryByText("operator")).not.toBeInTheDocument();
  });

  it("renders every account once in the c9 flat five-column card grid", () => {
    const needsAction = mallAccount("kidsnote", { name: "키즈노트" });
    const collectable = mallAccount("domeggook", { name: "도매꾹" });
    const extensionSession = mallAccount("kakao", {
      name: "카카오",
      configured: false,
      loginId: null,
      hasPassword: false,
    });
    const needsSetup = mallAccount("unsupported-mall", {
      name: "미지원몰",
    });
    const stats = new Map<string, MallCollectionStat>([
      [needsAction.key, {
        key: needsAction.key,
        name: needsAction.name,
        files: 1,
        orderRows: 3,
        newRows: 2,
        productRows: 3,
        latestAt: Date.now(),
      }],
    ]);

    renderSection([needsAction, collectable, extensionSession, needsSetup], stats);

    expect(screen.queryAllByRole("heading", { name: /조치 필요|수집 가능|설정 필요/ })).toHaveLength(0);
    expect(screen.getByTestId("mall-account-card-grid")).toHaveClass("grid-cols-5");
    for (const name of ["키즈노트", "도매꾹", "카카오", "미지원몰"]) {
      expect(screen.getAllByRole("article", { name: `${name} 계정 카드` })).toHaveLength(1);
    }
  });

  it("enables supported tracking and delegates the action", async () => {
    const user = userEvent.setup();
    const account = mallAccount("domeggook", { name: "도매꾹" });
    const callbacks = renderSection([account]);

    await user.click(
      screen.getByRole("button", { name: "도매꾹 송장 업로드" }),
    );
    expect(callbacks.onUploadTracking).toHaveBeenCalledWith(account);
  });

  it("delegates account settings from the card", async () => {
    const user = userEvent.setup();
    const account = mallAccount("kidkids", { name: "키드키즈" });
    const callbacks = renderSection([account]);

    await user.click(screen.getByRole("button", { name: "키드키즈 설정" }));
    expect(callbacks.onOpenSettings).toHaveBeenCalledWith(account);
  });

  it("shows a second ID field only for the single art09 account", () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, "MallAccountSection.tsx"),
      "utf8",
    );

    expect(source).toContain("selectedMall?.key === \"art09\"");
    expect(source).toContain("공급사 ID");
    expect(source).not.toContain("아트공구 2");
  });

  it("renders collection recovery controls above the mall cards", () => {
    const account = mallAccount("kidsnote", { name: "키즈노트" });
    renderSection(
      [account],
      new Map(),
      <div aria-label="주문 수집 복구 컨트롤">복구</div>,
    );

    const controls = screen.getByLabelText("주문 수집 복구 컨트롤");
    const card = screen.getByRole("article", { name: "키즈노트 계정 카드" });
    expect(
      controls.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  /**
   * 진행 중은 owner가 말한다(KID-189). 다른 탭이 시작한 수집이어도 이 카드의
   * 보조 동작(송장 업로드·입고예정일 달력)은 함께 닫힌다.
   */
  it("closes the card's own actions while the owner reports this mall collecting", async () => {
    const user = userEvent.setup();
    const account = mallAccount("coupang-direct", { name: "쿠팡직배송" });
    const onOpenCalendar = vi.fn();
    vi.mocked(apiClient.getParsed).mockImplementation(
      async () => ({ malls: [runningOwnerStatus(account.key)] }),
    );

    renderSection([account], new Map(), undefined, { ownerControl: true, onOpenCalendar });

    expect(await screen.findByText("수집 중 · 쿠팡직배송")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "쿠팡직배송 송장 업로드" })).toBeDisabled();
    await user.click(screen.getByRole("article", { name: "쿠팡직배송 계정 카드" }));
    expect(onOpenCalendar).not.toHaveBeenCalled();
  });

  it("keeps the card's own actions open while the owner reports no collection", async () => {
    const user = userEvent.setup();
    const account = mallAccount("coupang-direct", { name: "쿠팡직배송" });
    const onOpenCalendar = vi.fn();
    vi.mocked(apiClient.getParsed).mockImplementation(async () => ({
      malls: [{ ...runningOwnerStatus(account.key), running: null }],
    }));

    renderSection([account], new Map(), undefined, { ownerControl: true, onOpenCalendar });

    expect(await screen.findByRole("button", { name: "쿠팡직배송 수집" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "쿠팡직배송 송장 업로드" })).toBeEnabled();
    await user.click(screen.getByRole("article", { name: "쿠팡직배송 계정 카드" }));
    expect(onOpenCalendar).toHaveBeenCalledWith(account);
  });

  it("wires source-owner recovery and explicit cancel through the order route", () => {
    const routeRoot = path.resolve(import.meta.dirname, "..");
    const workspace = readFileSync(
      path.join(routeRoot, "components/OrderCollectionWorkspace.tsx"),
      "utf8",
    );
    const collector = readFileSync(
      path.join(routeRoot, "lib/browser-mall-collection.ts"),
      "utf8",
    );
    const sessionHook = readFileSync(
      path.join(routeRoot, "hooks/use-order-collection-session-controls.ts"),
      "utf8",
    );

    // Source-owner state is read on reload; provider work only starts from the
    // explicit collect action.
    expect(workspace).not.toContain("BrowserCollectionRunControls");
    expect(sessionHook).toContain("readOrderCollectionSourceAttempt");
    expect(sessionHook).toContain("beginOrderCollectionSourceAttempt");
    expect(sessionHook).toContain("rememberActiveOrderCollectionAttempt");
    expect(sessionHook).toContain("getOrderCollectionEnvironmentKey");
    expect(sessionHook).not.toContain("issueBrowserCollectionRunId");
    expect(sessionHook).not.toContain("finalizeOrderCollectionSession");
    // 시작·중단은 몰 카드가 그리는 공용 컨트롤이 담당한다(KID-189).
    expect(workspace).toContain('MallCollectionControl');
    expect(workspace).toContain('renderCollectionControl');
    expect(sessionHook).toContain("mallAccounts.find((account) => account.key === mallKey)");
    expect(collector).not.toContain("runId");
    expect(collector).toContain("attemptId");
    expect(collector).toContain("extensionId");
  });
});
