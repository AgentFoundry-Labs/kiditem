import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  blockMallAutoLogin,
  isMallAutoLoginBlocked,
  resetMallLoginBlocksForTest,
} from '@/lib/mall-login-block';
import { MallAccountGroups, type MallCardCollection } from './MallAccountGroups';
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

/**
 * 시작·중단은 몰마다 자기 공용 컨트롤이 그린다(KID-189). 카드는 그 컨트롤에게서
 * 컨트롤 자리와 owner 진행 중을 함께 받는다. 여기서는 그 배선만 본다.
 */
function collectButton(
  onCollect: (account: OrderCollectionMallAccount) => void,
  running = false,
) {
  return (
    account: OrderCollectionMallAccount,
    renderCard: (collection: MallCardCollection) => ReactNode,
  ) => renderCard({
    control: (
      <button type="button" onClick={() => onCollect(account)}>
        {account.name} 수집
      </button>
    ),
    running,
  });
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
        autoDetect={false}
        autoNextRunAt={null}
        autoRunning={false}
        onOpenSettings={vi.fn()}
        renderCollectionControl={collectButton(onCollectMall)}
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
        autoDetect={false}
        autoNextRunAt={null}
        autoRunning={false}
        onOpenSettings={vi.fn()}
        renderCollectionControl={collectButton(onCollectMall)}
        onOpenCalendar={onOpenCalendar}
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

  it('gives every mall its own collection control, one per card', async () => {
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
        autoDetect={false}
        autoNextRunAt={null}
        autoRunning={false}
        onOpenSettings={vi.fn()}
        renderCollectionControl={collectButton(onCollectMall)}
        onUploadTracking={vi.fn()}
      />,
    );

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
        autoDetect={false}
        autoNextRunAt={null}
        autoRunning={false}
        onOpenSettings={vi.fn()}
        renderCollectionControl={collectButton(vi.fn())}
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

  describe('자동 로그인이 막힌 몰 — 다시 켜는 건 사람이 정한다', () => {
    beforeEach(() => {
      resetMallLoginBlocksForTest();
      window.localStorage.clear();
    });

    function renderCard(onDropMall?: (sourceMallKey: string, targetMallKey: string) => void) {
      render(
        <MallAccountGroups
          accounts={[account('art09', { name: '아트공구' }), account('kakao', { name: '카카오' })]}
          stats={new Map()}
          selectedMall={null}
          settingsOpen={false}
          autoDetect={false}
          autoNextRunAt={null}
          autoRunning={false}
          onOpenSettings={vi.fn()}
          renderCollectionControl={collectButton(vi.fn())}
          onUploadTracking={vi.fn()}
          onDropMall={onDropMall}
        />,
      );
    }

    /** 기계는 멈췄다는 사실과, 다시 켤 권한이 사람에게 있다는 것을 한 줄로 말한다. */
    it('⭐ 자동이 멈췄다고 적고, 눌러서 사람이 직접 다시 켤 수 있다', async () => {
      const user = userEvent.setup();
      blockMallAutoLogin('art09', '아트공구 로그인이 필요합니다.');
      renderCard();

      const control = screen.getByRole('button', { name: '아트공구 자동 수집 다시 켜기' });
      expect(control).toHaveTextContent('자동 멈춤 · 직접 로그인');
      expect(isMallAutoLoginBlocked('art09')).toBe(true);

      await user.click(control);
      expect(isMallAutoLoginBlocked('art09')).toBe(false);
    });

    it('인증이 막힌 몰은 "직접 인증"이라고 적는다 — 사람이 할 일이 다르다', () => {
      blockMallAutoLogin('art09', '본인 인증이 필요합니다.', 'verification');
      renderCard();
      expect(
        screen.getByRole('button', { name: '아트공구 자동 수집 다시 켜기' }),
      ).toHaveTextContent('자동 멈춤 · 직접 인증');
    });

    /** 막힌 몰은 이번 화면에서 실패한 적이 없어도 빨간 카드로 선다 — 지금 사람이 해야 할 일이라서. */
    it('⭐ 막힌 몰은 빨간불과 "로그인 필요"로 선다', () => {
      blockMallAutoLogin('art09', '아트공구 로그인이 필요합니다.');
      renderCard();
      expect(screen.getByTitle('로그인 필요 · 재수집 필요')).toHaveClass('bg-red-500');
    });
  });

  describe('카드 순서 — 손잡이로만 옮긴다', () => {
    it('손잡이는 순서를 바꿀 수 있을 때만 보인다', () => {
      render(
        <MallAccountGroups
          accounts={[account('art09', { name: '아트공구' })]}
          stats={new Map()}
          selectedMall={null}
          settingsOpen={false}
          autoDetect={false}
          autoNextRunAt={null}
          autoRunning={false}
          onOpenSettings={vi.fn()}
          renderCollectionControl={collectButton(vi.fn())}
          onUploadTracking={vi.fn()}
        />,
      );
      expect(screen.queryByRole('button', { name: /끌어서 옮기기/ })).toBeNull();
    });

    it('⭐ 계정 행이 없는 몰에는 손잡이가 없다 — 순서를 담을 행이 없다', () => {
      render(
        <MallAccountGroups
          accounts={[
            account('art09', { name: '아트공구', updatedAt: '2026-09-16T00:00:00.000Z' }),
            account('kakao', { name: '카카오' }),
          ]}
          stats={new Map()}
          selectedMall={null}
          settingsOpen={false}
          autoDetect={false}
          autoNextRunAt={null}
          autoRunning={false}
          onOpenSettings={vi.fn()}
          renderCollectionControl={collectButton(vi.fn())}
          onUploadTracking={vi.fn()}
          onMoveMall={vi.fn()}
          onDropMall={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: '아트공구 순서 1번 — 끌어서 옮기기' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /카카오 순서/ })).toBeNull();
    });

    it('방향키로 옆 카드와 자리를 바꾼다', async () => {
      const user = userEvent.setup();
      const onMoveMall = vi.fn();
      const updatedAt = '2026-09-16T00:00:00.000Z';
      render(
        <MallAccountGroups
          accounts={[account('art09', { name: '아트공구', updatedAt }), account('kakao', { name: '카카오', updatedAt })]}
          stats={new Map()}
          selectedMall={null}
          settingsOpen={false}
          autoDetect={false}
          autoNextRunAt={null}
          autoRunning={false}
          onOpenSettings={vi.fn()}
          renderCollectionControl={collectButton(vi.fn())}
          onUploadTracking={vi.fn()}
          onMoveMall={onMoveMall}
          onDropMall={vi.fn()}
        />,
      );
      screen.getByRole('button', { name: '아트공구 순서 1번 — 끌어서 옮기기' }).focus();
      await user.keyboard('{ArrowRight}');
      expect(onMoveMall).toHaveBeenCalledWith('art09', 1);
      // 맨 앞 카드는 더 앞으로 가지 않는다.
      await user.keyboard('{ArrowLeft}');
      expect(onMoveMall).toHaveBeenCalledTimes(1);
    });
  });
});
