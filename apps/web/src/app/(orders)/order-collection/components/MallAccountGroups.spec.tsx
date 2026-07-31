import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MallAccountGroups } from './MallAccountGroups';
import type { MallCollectionStat } from '../lib/order-collection-stats';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';
import type { FailedMallReason } from '../hooks/use-order-activity-events';

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
  it('preserves the c9 flat five-column mall card grid and keeps collection enabled', async () => {
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
        collectingKeys={new Set()}
        cancellingKeys={new Set()}
        autoDetect={false}
        autoNextRunAt={null}
        autoRunning={false}
        onOpenSettings={vi.fn()}
        onCollectMall={onCollectMall}
        onCancelMall={vi.fn()}
        onUploadTracking={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole('heading', { name: /조치 필요|수집 가능|설정 필요/ })).toHaveLength(0);
    expect(screen.getByTestId('mall-account-card-grid')).toHaveClass('grid-cols-5');
    for (const name of ['키즈노트', '카카오', '미지원몰']) {
      expect(screen.getAllByRole('article', { name: `${name} 계정 카드` })).toHaveLength(1);
    }
    expect(screen.getAllByText('신규')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: '카카오 수집' }));
    expect(onCollectMall).toHaveBeenCalledWith(collectable);
  });

  it('separates the collect button from the card-area calendar', async () => {
    // 수집 버튼은 달력을 띄우지 않고 곧바로 수집한다. 달력은 카드 영역 클릭에서만 열린다.
    const user = userEvent.setup();
    const collectable = account('kakao', { name: '카카오', configured: false });
    const onCollectMall = vi.fn();
    const onOpenCalendar = vi.fn();

    render(
      <MallAccountGroups
        accounts={[collectable]}
        stats={new Map()}
        selectedMall={null}
        settingsOpen={false}
        collectingKeys={new Set()}
        cancellingKeys={new Set()}
        autoDetect={false}
        autoNextRunAt={null}
        autoRunning={false}
        onOpenSettings={vi.fn()}
        onCollectMall={onCollectMall}
        onOpenCalendar={onOpenCalendar}
        onCancelMall={vi.fn()}
        onUploadTracking={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '카카오 수집' }));
    expect(onCollectMall).toHaveBeenCalledWith(collectable);
    expect(onOpenCalendar).not.toHaveBeenCalled();

    await user.click(screen.getByRole('article', { name: '카카오 계정 카드' }));
    expect(onOpenCalendar).toHaveBeenCalledWith(collectable);
    expect(onCollectMall).toHaveBeenCalledTimes(1);
  });

  it('keeps another mall collection button enabled while one mall is collecting', async () => {
    const user = userEvent.setup();
    const kidsnote = account('kidsnote', { name: '키즈노트' });
    const kakao = account('kakao', { name: '카카오' });
    const onCollectMall = vi.fn();

    render(
      <MallAccountGroups
        accounts={[kidsnote, kakao]}
        stats={new Map()}
        selectedMall={null}
        settingsOpen={false}
        collectingKeys={new Set(['kidsnote'])}
        cancellingKeys={new Set()}
        autoDetect={false}
        autoNextRunAt={null}
        autoRunning={false}
        onOpenSettings={vi.fn()}
        onCollectMall={onCollectMall}
        onCancelMall={vi.fn()}
        onUploadTracking={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '키즈노트 중단' })).toBeEnabled();
    const kakaoCollect = screen.getByRole('button', { name: '카카오 수집' });
    expect(kakaoCollect).toBeEnabled();
    await user.click(kakaoCollect);
    expect(onCollectMall).toHaveBeenCalledWith(kakao);
  });

  it('turns the status light red when a mall needs login or authentication', () => {
    const kakao = account('kakao', { name: '카카오' });
    const kidsnote = account('kidsnote', { name: '키즈노트' });
    const gsshop = account('gsshop', { name: 'GS샵' });

    render(
      <MallAccountGroups
        accounts={[kakao, kidsnote, gsshop]}
        stats={new Map()}
        failedMallReasonByKey={new Map<string, FailedMallReason>([
          ['kidsnote', 'login'],
          ['gsshop', 'auth'],
        ])}
        selectedMall={null}
        settingsOpen={false}
        collectingKeys={new Set()}
        cancellingKeys={new Set()}
        autoDetect={false}
        autoNextRunAt={null}
        autoRunning={false}
        onOpenSettings={vi.fn()}
        onCollectMall={vi.fn()}
        onCancelMall={vi.fn()}
        onUploadTracking={vi.fn()}
      />,
    );

    // 로그인 안 됨 → 빨간불 + "로그인 필요" 안내
    const loginDot = screen.getByTitle('로그인 필요 · 재수집 필요');
    expect(loginDot).toHaveClass('bg-red-500');
    // 인증 안 됨 → 빨간불 + "인증 필요" 안내
    const authDot = screen.getByTitle('인증 필요 · 재수집 필요');
    expect(authDot).toHaveClass('bg-red-500');
    // 실패가 없는 수집 가능 몰은 초록불 유지
    const okDot = screen.getByTitle('수집 가능');
    expect(okDot).toHaveClass('bg-emerald-500');
    expect(okDot).not.toHaveClass('bg-red-500');
  });
});
