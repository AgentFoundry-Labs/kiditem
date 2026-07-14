import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MallAccountSection } from './MallAccountSection';
import type { MallCollectionStat } from '../lib/order-collection-stats';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

function mallAccount(
  key: string,
  overrides: Partial<OrderCollectionMallAccount> = {},
): OrderCollectionMallAccount {
  return {
    key,
    name: overrides.name ?? key,
    configured: overrides.configured ?? true,
    enabled: overrides.enabled ?? true,
    loginId: overrides.loginId ?? 'operator',
    hasPassword: overrides.hasPassword ?? true,
    siteUrl: overrides.siteUrl ?? 'https://example.test',
    memo: overrides.memo ?? null,
    passwordUpdatedAt: overrides.passwordUpdatedAt ?? null,
    updatedAt: overrides.updatedAt ?? null,
  };
}

function renderSection(accounts: OrderCollectionMallAccount[], stats = new Map<string, MallCollectionStat>()) {
  const callbacks = {
    onCollectAll: vi.fn(),
    onCollectMall: vi.fn(),
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
      collectingKeys={new Set()}
      mallError={null}
      selectedMall={accounts[0]}
      mallDraft={{ loginId: '', password: '', siteUrl: '', memo: '', enabled: true }}
      mallSettingsOpen={false}
      mallPasswordLoading={false}
      mallPasswordVisible={false}
      configuredMallCount={accounts.filter((account) => account.configured).length}
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
      {...callbacks}
    />,
  );

  return callbacks;
}

describe('MallAccountSection', () => {
  it('renders compact account cards with status and collection stats', () => {
    const account = mallAccount('icecream-mall', { name: '아이스크림몰' });
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

    expect(screen.getByRole('article', { name: '아이스크림몰 계정 카드' })).toBeInTheDocument();
    expect(screen.getByText('사용')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('누적 주문')).toBeInTheDocument();
  });

  it('never enables collection for a disabled extension-session mall', async () => {
    const user = userEvent.setup();
    const account = mallAccount('kidsnote', { name: '키즈노트', enabled: false });
    const callbacks = renderSection([account]);
    const collectButton = screen.getByRole('button', { name: '키즈노트 수집' });

    expect(collectButton).toBeDisabled();
    await user.click(collectButton);
    expect(callbacks.onCollectMall).not.toHaveBeenCalled();
  });

  it('enables supported tracking and delegates the action', async () => {
    const user = userEvent.setup();
    const account = mallAccount('domeggook', { name: '도매꾹' });
    const callbacks = renderSection([account]);

    await user.click(screen.getByRole('button', { name: '도매꾹 송장 업로드' }));
    expect(callbacks.onUploadTracking).toHaveBeenCalledWith(account);
  });

  it('delegates account settings from the card', async () => {
    const user = userEvent.setup();
    const account = mallAccount('kidkids', { name: '키드키즈' });
    const callbacks = renderSection([account]);

    await user.click(screen.getByRole('button', { name: '키드키즈 설정' }));
    expect(callbacks.onOpenSettings).toHaveBeenCalledWith(account);
  });
});
