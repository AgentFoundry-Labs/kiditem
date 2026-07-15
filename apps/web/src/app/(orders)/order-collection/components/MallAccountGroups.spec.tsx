import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MallAccountGroups } from './MallAccountGroups';
import type { MallCollectionStat } from '../lib/order-collection-stats';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

function account(
  key: string,
  overrides: Partial<OrderCollectionMallAccount> = {},
): OrderCollectionMallAccount {
  return {
    key,
    name: overrides.name ?? key,
    configured: overrides.configured ?? true,
    enabled: overrides.enabled ?? true,
    loginId: overrides.loginId ?? null,
    hasPassword: overrides.hasPassword ?? false,
    siteUrl: overrides.siteUrl ?? null,
    memo: overrides.memo ?? null,
    passwordUpdatedAt: overrides.passwordUpdatedAt ?? null,
    updatedAt: overrides.updatedAt ?? null,
  };
}

describe('MallAccountGroups', () => {
  it('renders each account once in its state-derived group and keeps extension-session collection enabled', async () => {
    const user = userEvent.setup();
    const action = account('kidsnote', { name: '키즈노트', configured: false });
    const collectable = account('kakao', { name: '카카오', configured: false });
    const setup = account('unsupported', { name: '미지원몰' });
    const stats = new Map<string, MallCollectionStat>([
      [action.key, {
        key: action.key,
        name: action.name,
        files: 1,
        orderRows: 2,
        newRows: 1,
        productRows: 2,
        latestAt: Date.now(),
      }],
    ]);
    const onCollectMall = vi.fn();

    render(
      <MallAccountGroups
        accounts={[action, collectable, setup]}
        stats={stats}
        selectedMall={null}
        settingsOpen={false}
        browserCollecting={false}
        collectingKeys={new Set()}
        cancellingKeys={new Set()}
        conversionState="idle"
        autoDetect={false}
        autoNextRunAt={null}
        autoRunning={false}
        onOpenSettings={vi.fn()}
        onCollectMall={onCollectMall}
        onCancelMall={vi.fn()}
        onUploadTracking={vi.fn()}
      />,
    );

    const actionGroup = screen.getByRole('heading', { name: /조치 필요/ }).closest('section');
    const collectableGroup = screen.getByRole('heading', { name: /수집 가능/ }).closest('section');
    const setupGroup = screen.getByRole('heading', { name: /설정 필요/ }).closest('section');
    expect(within(actionGroup!).getByRole('article', { name: '키즈노트 계정 카드' })).toBeInTheDocument();
    expect(within(collectableGroup!).getByRole('article', { name: '카카오 계정 카드' })).toBeInTheDocument();
    expect(within(setupGroup!).getByRole('article', { name: '미지원몰 계정 카드' })).toBeInTheDocument();
    for (const name of ['키즈노트', '카카오', '미지원몰']) {
      expect(screen.getAllByRole('article', { name: `${name} 계정 카드` })).toHaveLength(1);
    }

    await user.click(screen.getByRole('button', { name: '카카오 수집' }));
    expect(onCollectMall).toHaveBeenCalledWith(collectable);
  });
});
