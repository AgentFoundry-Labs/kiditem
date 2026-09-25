import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoupangReviewCollectSection } from './CoupangReviewCollectSection';

const reviewBridge = vi.hoisted(() => ({
  cancel: vi.fn(),
  detect: vi.fn(),
  gateMessage: vi.fn(),
  readLatest: vi.fn(),
  resolveAccount: vi.fn(),
  start: vi.fn(),
}));

vi.mock('../lib/review-extension', () => ({
  DEFAULT_REVIEW_COLLECTION_MONTHS: 3,
  REVIEW_COLLECTION_MONTH_OPTIONS: [3, 6, 12, 24],
  cancelCoupangReviewCollection: reviewBridge.cancel,
  detectReviewExtensionGate: reviewBridge.detect,
  readLatestCoupangReviewCollection: reviewBridge.readLatest,
  resolveCoupangReviewAccountId: reviewBridge.resolveAccount,
  reviewExtensionGateMessage: reviewBridge.gateMessage,
  startCoupangReviewCollection: reviewBridge.start,
}));

const OPERATION_ID = 'a1111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = 'c1111111-1111-4111-8111-111111111111';

function status(overrides: Record<string, unknown> = {}) {
  return {
    status: 'running',
    operationId: OPERATION_ID,
    total: 3,
    completed: 1,
    current: '2026-08',
    collected: 150,
    inserted: null,
    updated: null,
    error: null,
    ...overrides,
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CoupangReviewCollectSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    reviewBridge.detect.mockResolvedValue({ status: 'ready', extensionId: 'ext', version: '1.0.0' });
    reviewBridge.gateMessage.mockReturnValue(null);
    reviewBridge.readLatest.mockResolvedValue({ status: 'idle' });
    reviewBridge.resolveAccount.mockResolvedValue(ACCOUNT_ID);
    reviewBridge.start.mockResolvedValue(OPERATION_ID);
    reviewBridge.cancel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('시작하면 대표 쿠팡 계정과 기간으로 실행을 맡기고, 실행 중에는 2초마다 서버 실행을 읽어 월 창 진행을 보여 준다', async () => {
    render(<CoupangReviewCollectSection onCollected={vi.fn()} />);
    await settle();
    reviewBridge.readLatest.mockResolvedValue(status());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '리뷰 수집' }));
    });
    await settle();

    expect(reviewBridge.start).toHaveBeenCalledWith('ext', { channelAccountId: ACCOUNT_ID, months: 3 }, expect.any(String));
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();
    expect(screen.getByText('1/3 개월 · 2026-08')).toBeInTheDocument();
    expect(screen.getByText('수집 150건')).toBeInTheDocument();

    const reads = reviewBridge.readLatest.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(reviewBridge.readLatest.mock.calls.length).toBe(reads + 1);
  });

  it('열었을 때 돌고 있는 실행이 있으면 이어서 보고, 끝나면 목록을 한 번 다시 불러온다', async () => {
    const onCollected = vi.fn();
    reviewBridge.readLatest.mockResolvedValue(status());
    render(<CoupangReviewCollectSection onCollected={onCollected} />);
    await settle();
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();

    reviewBridge.readLatest.mockResolvedValue(status({ status: 'done', completed: 3, current: null, inserted: 100, updated: 50 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByText('신규 100 · 갱신 50')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(onCollected).toHaveBeenCalledTimes(1);
    expect(reviewBridge.readLatest).toHaveBeenCalledTimes(2);
  });

  it('열었을 때 최근 실행이 이미 끝났으면 표시하지 않고 폴링하지 않는다', async () => {
    reviewBridge.readLatest.mockResolvedValue(status({ status: 'done' }));
    render(<CoupangReviewCollectSection onCollected={vi.fn()} />);
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(reviewBridge.readLatest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('수집 완료')).not.toBeInTheDocument();
  });

  it('중단은 그 실행 id로 서버 취소를 부르고, 실패하면 문장을 보여 준다', async () => {
    reviewBridge.readLatest.mockResolvedValue(status());
    reviewBridge.cancel.mockRejectedValue(new Error('cancel failed'));
    render(<CoupangReviewCollectSection onCollected={vi.fn()} />);
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '중단' }));
    });
    await settle();

    expect(reviewBridge.cancel).toHaveBeenCalledWith(OPERATION_ID);
    expect(screen.getByText('cancel failed')).toBeInTheDocument();
  });
});
