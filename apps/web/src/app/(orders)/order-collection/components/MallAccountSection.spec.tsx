import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MallAccountSection } from "./MallAccountSection";
import type { MallCollectionStat } from "../lib/order-collection-stats";
import type { OrderCollectionMallAccount } from "../lib/order-mall-account-api";

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

function renderSection(
  accounts: OrderCollectionMallAccount[],
  stats = new Map<string, MallCollectionStat>(),
  collectionControls?: ReactNode,
  runState: {
    collectingKeys?: Set<string>;
    cancellingKeys?: Set<string>;
  } = {},
) {
  const callbacks = {
    onCollectAll: vi.fn(),
    onCollectMall: vi.fn(),
    onCancelMall: vi.fn(),
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

  render(
    <MallAccountSection
      mallAccounts={accounts}
      mallLoading={false}
      mallSaving={false}
      browserCollecting={false}
      collectingKeys={runState.collectingKeys ?? new Set()}
      cancellingKeys={runState.cancellingKeys ?? new Set()}
      mallError={null}
      selectedMall={accounts[0]}
      mallDraft={{
        loginId: "",
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
    />,
  );

  return callbacks;
}

describe("MallAccountSection", () => {
  it("renders compact account cards with today and transmission-waiting stats", () => {
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
    expect(screen.getByText("전송 대기")).toBeInTheDocument();
    expect(screen.getByTitle("오늘 주문 중 셀피아 전송 대기")).toBeInTheDocument();
    expect(screen.queryByText("신규")).not.toBeInTheDocument();
    expect(screen.queryByText("누적 주문")).not.toBeInTheDocument();
    expect(screen.queryByText("operator")).not.toBeInTheDocument();
  });

  it("never enables collection for a disabled extension-session mall", async () => {
    const user = userEvent.setup();
    const account = mallAccount("kidsnote", {
      name: "키즈노트",
      enabled: false,
    });
    const callbacks = renderSection([account]);
    const collectButton = screen.getByRole("button", { name: "키즈노트 수집" });

    expect(collectButton).toBeDisabled();
    await user.click(collectButton);
    expect(callbacks.onCollectMall).not.toHaveBeenCalled();
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

  it("turns the existing collect button into a stop action while collecting", async () => {
    const user = userEvent.setup();
    const account = mallAccount("coupang-direct", { name: "쿠팡직배송" });
    const callbacks = renderSection(
      [account],
      new Map(),
      undefined,
      { collectingKeys: new Set([account.key]) },
    );

    expect(screen.queryByRole("button", { name: "쿠팡직배송 수집" })).not.toBeInTheDocument();
    const stopButton = screen.getByRole("button", { name: "쿠팡직배송 중단" });
    await user.click(stopButton);

    expect(callbacks.onCancelMall).toHaveBeenCalledWith(account);
    expect(screen.getByRole("button", { name: "쿠팡직배송 송장 업로드" })).toBeDisabled();
  });

  it("disables the stop action while cancellation is being applied", () => {
    const account = mallAccount("coupang-direct", { name: "쿠팡직배송" });
    renderSection(
      [account],
      new Map(),
      undefined,
      {
        collectingKeys: new Set([account.key]),
        cancellingKeys: new Set([account.key]),
      },
    );

    expect(screen.getByRole("button", { name: "쿠팡직배송 중단 중" })).toBeDisabled();
  });

  it("wires route collectionRun recovery and same-run restart", () => {
    const routeRoot = path.resolve(import.meta.dirname, "..");
    const page = readFileSync(path.join(routeRoot, "page.tsx"), "utf8");
    const collector = readFileSync(
      path.join(routeRoot, "lib/browser-mall-collection.ts"),
      "utf8",
    );
    const sessionHook = readFileSync(
      path.join(routeRoot, "hooks/use-order-collection-session-controls.ts"),
      "utf8",
    );

    expect(page).toContain("BrowserCollectionRunControls");
    expect(sessionHook).toContain("useBrowserCollectionSession");
    expect(sessionHook).toContain("collectionRun");
    expect(sessionHook).toContain("globalThis.crypto.randomUUID()");
    expect(sessionHook).toContain("'orders.mall'");
    expect(page).toMatch(/handleBrowserCollectMall\(account,\s*session\.runId\)/);
    expect(page).toContain('webRestartUnavailableMessage');
    expect(sessionHook).toContain("mallAccounts.find((account) => account.key === mallKey)");
    expect(collector).toContain("runId");
    expect(collector).toContain("extensionId");
  });
});
