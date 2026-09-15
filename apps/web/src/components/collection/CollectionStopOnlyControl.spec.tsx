import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CollectionControlNotice,
  CollectionControlView,
} from '@/hooks/use-collection-source-control';
import { CollectionStopOnlyControl } from './CollectionStopOnlyControl';

function control(
  patch: Partial<CollectionControlView & { notice: CollectionControlNotice | null; stop: () => void }> = {},
) {
  return {
    state: 'idle' as const,
    statusRead: 'current' as const,
    running: null,
    canStop: false,
    canStart: false,
    notice: null,
    stop: vi.fn(),
    ...patch,
  };
}

describe('CollectionStopOnlyControl', () => {
  it('stays out of the screen while the source is idle and quiet', () => {
    const { container } = render(
      <CollectionStopOnlyControl control={control()} label="셀피아 송장 조회" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the owner running collection with the operator stop and never a start', () => {
    const stop = vi.fn();
    render(
      <CollectionStopOnlyControl
        control={control({
          state: 'running',
          running: { attemptId: 'a1', scopeLabel: '키즈노트' },
          canStop: true,
          stop,
        })}
        label="셀피아 송장 조회"
      />,
    );

    expect(screen.getByText('셀피아 송장 조회')).toBeInTheDocument();
    expect(screen.getByText('수집 중 · 키즈노트')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /수집$/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '수집 중단' }));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  /** 중단이 거절됐다는 안내는 수집이 끝난 뒤에도 운영자가 읽을 수 있어야 한다(KID-191). */
  it('keeps the last notice on screen after the collection ended', () => {
    render(
      <CollectionStopOnlyControl
        control={control({
          notice: { tone: 'error', message: '수집을 중단하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
        })}
        label="쿠팡 쉽먼트 발송일 조회"
      />,
    );

    expect(screen.getByText('수집을 중단하지 못했습니다. 잠시 후 다시 시도해 주세요.'))
      .toBeInTheDocument();
  });
});
