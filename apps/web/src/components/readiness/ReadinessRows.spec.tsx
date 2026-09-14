import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_READINESS_LABELS } from '@kiditem/shared/source-readiness';
import { AdKeywordRow, AdSyncRow, StockSyncRow } from './ReadinessRows';

const hooks = vi.hoisted(() => ({
  adSync: vi.fn(),
  keyword: vi.fn(),
  stock: vi.fn(),
}));

vi.mock('@/app/(advertising)/ad-ops/hooks/useAdSync', () => ({
  useAdSync: hooks.adSync,
}));
vi.mock('@/app/(advertising)/ad-ops/hooks/useAdKeywordCollect', () => ({
  useAdKeywordCollect: hooks.keyword,
}));
vi.mock('@/app/(inventory)/_shared/sellpia-inventory-source-owner', () => ({
  useSellpiaInventorySourceOwner: hooks.stock,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

function ownerSource(ready: boolean, completeEndDate: string | null) {
  return {
    loading: false,
    cancelling: false,
    run: vi.fn(),
    cancel: vi.fn(),
    status: null,
    source: {
      isPending: false,
      isError: false,
      data: {
        ready,
        latestAttempt: null,
        latestComplete: completeEndDate
          ? { plan: { startDate: '2026-08-06', endDate: completeEndDate } }
          : null,
      },
    },
  };
}

function stockOwner(
  status: 'fresh' | 'refresh_required' | 'syncing' | 'failed',
  lastVerifiedAt: string | null,
  errorMessage: string | null = null,
) {
  return {
    state: { status, lastVerifiedAt, errorMessage, sourceBindingConfirmed: true },
    start: vi.fn(),
    isStarting: false,
  };
}

const ownerRows = [
  { name: 'AdSyncRow', Row: AdSyncRow, hook: hooks.adSync },
  { name: 'AdKeywordRow', Row: AdKeywordRow, hook: hooks.keyword },
] as const;

describe('readiness owner rows use the shared source readiness labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(ownerRows)('$name derives ready, stale and missing from the owner source', ({ Row, hook }) => {
    hook.mockReturnValue(ownerSource(true, '2026-09-05'));
    const view = render(<Row onComplete={vi.fn()} />);
    expect(screen.getByText(SOURCE_READINESS_LABELS.ready)).toBeInTheDocument();

    hook.mockReturnValue(ownerSource(false, '2026-09-05'));
    view.rerender(<Row onComplete={vi.fn()} />);
    expect(screen.getByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();
    expect(screen.queryByText(SOURCE_READINESS_LABELS.ready)).not.toBeInTheDocument();
    expect(view.container).toHaveTextContent('사용 중인 데이터: 2026-08-06 ~ 2026-09-05');
    expect(view.container).not.toHaveTextContent(`· ${SOURCE_READINESS_LABELS.stale}`);

    hook.mockReturnValue(ownerSource(false, null));
    view.rerender(<Row onComplete={vi.fn()} />);
    expect(screen.getByText(SOURCE_READINESS_LABELS.missing)).toBeInTheDocument();
  });

  it.each(ownerRows)('$name blocks collection only while no owner status has been read', ({ name, Row, hook }) => {
    const collectLabel = name === 'AdSyncRow' ? '광고 동기화' : '키워드 수집';
    const lastKnown = ownerSource(true, '2026-09-05');
    hook.mockReturnValue({ ...lastKnown, source: { isPending: false, isError: true, data: undefined } });
    const view = render(<Row onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: collectLabel })).toBeDisabled();
    expect(view.container).toHaveTextContent('수집 상태를 확인하지 못했습니다');

    hook.mockReturnValue({ ...lastKnown, source: { ...lastKnown.source, isError: true } });
    view.rerender(<Row onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: collectLabel })).toBeEnabled();
    expect(view.container).toHaveTextContent('상태를 다시 확인하는 중');
    expect(view.container).not.toHaveTextContent('수집 상태를 확인하지 못했습니다');
  });

  it('derives the Sellpia chip from freshness and the KST date of the last verification', () => {
    hooks.stock.mockReturnValue(stockOwner('fresh', '2026-09-05T16:30:00.000Z'));
    const view = render(<StockSyncRow />);
    expect(screen.getByText(SOURCE_READINESS_LABELS.ready)).toBeInTheDocument();

    hooks.stock.mockReturnValue(stockOwner('refresh_required', '2026-09-05T16:30:00.000Z'));
    view.rerender(<StockSyncRow />);
    expect(screen.getByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();

    hooks.stock.mockReturnValue(stockOwner('refresh_required', null));
    view.rerender(<StockSyncRow />);
    expect(screen.getByText(SOURCE_READINESS_LABELS.missing)).toBeInTheDocument();
  });

  it('shows Sellpia syncing through the busy button and a failure through the owner message', () => {
    hooks.stock.mockReturnValue(stockOwner('syncing', '2026-09-05T16:30:00.000Z'));
    const view = render(<StockSyncRow />);
    expect(screen.getByRole('button', { name: /동기화 중/ })).toBeDisabled();
    expect(screen.getByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();
    expect(screen.queryByText('갱신 중')).not.toBeInTheDocument();

    hooks.stock.mockReturnValue(
      stockOwner('failed', '2026-09-05T16:30:00.000Z', '셀피아 로그인이 필요합니다.'),
    );
    view.rerender(<StockSyncRow />);
    expect(screen.getByText('셀피아 로그인이 필요합니다.')).toBeInTheDocument();
    expect(screen.getByText(SOURCE_READINESS_LABELS.stale)).toBeInTheDocument();
    expect(screen.queryByText('실패')).not.toBeInTheDocument();
  });
});
