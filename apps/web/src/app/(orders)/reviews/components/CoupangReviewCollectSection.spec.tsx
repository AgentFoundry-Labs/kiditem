import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoupangReviewCollectSection } from './CoupangReviewCollectSection';

const reviewBridge = vi.hoisted(() => ({
  cancel: vi.fn(),
  detect: vi.fn(),
  getStatus: vi.fn(),
  gateMessage: vi.fn(),
  run: vi.fn(),
  recover: vi.fn(),
}));

vi.mock('../lib/review-extension', () => ({
  DEFAULT_REVIEW_COLLECTION_MONTHS: 3,
  REVIEW_COLLECTION_MONTH_OPTIONS: [3, 6, 12, 24],
  cancelCoupangReviewCollection: reviewBridge.cancel,
  detectReviewExtensionGate: reviewBridge.detect,
  getCoupangReviewCollectionStatus: reviewBridge.getStatus,
  recoverCoupangReviewCollection: reviewBridge.recover,
  reviewExtensionGateMessage: reviewBridge.gateMessage,
  runCoupangReviewCollection: reviewBridge.run,
}));

const ATTEMPT_ID = 'a1111111-1111-4111-8111-111111111111';
const ATTEMPT_TOKEN = 'b1111111-1111-4111-8111-111111111111';

function runningStatus(overrides: Record<string, unknown> = {}) {
  return {
    status: 'running',
    runId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
    months: 3,
    total: 3,
    completed: 1,
    collected: 4,
    created: 2,
    updated: 2,
    unlinked: 0,
    current: '2026-09',
    failures: [],
    error: null,
    cancelRequested: false,
    ...overrides,
  };
}

async function startCollection() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '리뷰 수집' }));
    await Promise.resolve();
  });
}

describe('CoupangReviewCollectSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    reviewBridge.detect.mockResolvedValue({
      status: 'ready',
      extensionId: 'review-extension',
      version: '1.0.0',
    });
    reviewBridge.gateMessage.mockReturnValue(null);
    reviewBridge.run.mockResolvedValue(runningStatus());
    reviewBridge.getStatus.mockResolvedValue(runningStatus({ attemptToken: null }));
    reviewBridge.recover.mockResolvedValue({ status: 'idle' });
    reviewBridge.cancel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the begin-issued token after a read-only poll and fences cancel with it', async () => {
    render(<CoupangReviewCollectSection onCollected={vi.fn()} />);
    await startCollection();

    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(reviewBridge.getStatus).toHaveBeenCalledWith('review-extension', ATTEMPT_ID);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '중단' }));
      await Promise.resolve();
    });

    expect(reviewBridge.cancel).toHaveBeenCalledWith(
      'review-extension',
      ATTEMPT_ID,
      ATTEMPT_TOKEN,
    );
  });

  it('rehydrates a token-free running checkpoint without starting a second provider run', async () => {
    reviewBridge.recover.mockResolvedValue(runningStatus({ attemptToken: null }));
    render(<CoupangReviewCollectSection onCollected={vi.fn()} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reviewBridge.recover).toHaveBeenCalledWith('review-extension');
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();
    expect(reviewBridge.run).not.toHaveBeenCalled();
  });

  it('shows a cancellation failure instead of swallowing it', async () => {
    reviewBridge.cancel.mockRejectedValue(new Error('owner cancel failed'));
    render(<CoupangReviewCollectSection onCollected={vi.fn()} />);
    await startCollection();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '중단' }));
      await Promise.resolve();
    });

    expect(screen.getByText('owner cancel failed')).toBeInTheDocument();
  });
});
