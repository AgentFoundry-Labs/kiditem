import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcingOperationRunPanel } from './SourcingOperationRunPanel';
import type { OperationRun } from '@kiditem/shared/operations';

function run(overrides: Partial<OperationRun> = {}): OperationRun {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    operationKey: 'sourcing.collect_wing_catalog_batch',
    definitionVersion: 1,
    title: 'Wing 카탈로그 수집',
    ownerDomain: 'sourcing',
    engineType: 'browser',
    resourceClass: 'extension_coupang',
    executionTimeoutMs: 900_000,
    status: 'running',
    triggerSource: 'domain_screen',
    parentRunId: null,
    scheduleId: null,
    nativeRunType: null,
    nativeRunId: null,
    progress: 0.5,
    stage: 'collecting_keyword',
    stageUpdatedAt: '2026-08-14T00:00:30.000Z',
    progressCurrent: 3,
    progressTotal: 6,
    deadlineAt: '2026-08-14T00:15:00.000Z',
    result: null,
    error: null,
    requestedBy: null,
    scheduledFor: null,
    startedAt: '2026-08-14T00:00:00.000Z',
    finishedAt: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:30.000Z',
    ...overrides,
  };
}

function safeResult(outcome: 'complete' | 'partial' | 'no_change') {
  return {
    outcome,
    summary: {
      discovered: 8,
      accepted: outcome === 'no_change' ? 0 : 5,
      duplicate: 1,
      unchanged: outcome === 'no_change' ? 8 : 0,
      failed: outcome === 'partial' ? 2 : 0,
    },
    sources: [],
    snapshotGeneratedAt: '2026-08-14T00:01:05.000Z',
  };
}

describe('SourcingOperationRunPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T00:01:05.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders localized stage, elapsed time, counts, and cancel', () => {
    const cancel = vi.fn();
    render(<SourcingOperationRunPanel run={run()} onCancel={cancel} />);

    expect(screen.getByText('키워드 상품 수집 중')).toBeInTheDocument();
    expect(screen.getByText('경과 1분 5초')).toBeInTheDocument();
    expect(screen.getByText('진행 3 / 6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('offers an explicit retry only when attention is required', () => {
    const retry = vi.fn();
    render(
      <SourcingOperationRunPanel
        run={run({ status: 'attention_required', stage: 'waiting_login' })}
        onRetryAttention={retry}
      />,
    );

    expect(screen.getByText('로그인 확인 필요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['complete', '수집 완료 · 반영 5개'],
    ['partial', '일부 수집 완료 · 반영 5개 · 실패 2개'],
    ['no_change', '변경 없음 · 새로 반영된 항목이 없습니다.'],
  ] as const)('renders the succeeded %s outcome truthfully', (outcome, message) => {
    render(
      <SourcingOperationRunPanel
        run={run({
          status: 'succeeded',
          progress: 1,
          stage: 'completed',
          result: safeResult(outcome),
          finishedAt: '2026-08-14T00:01:05.000Z',
        })}
      />,
    );

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it.each([
    [
      'sourcing.collect_daily_trends',
      safeResult('partial'),
      '일부 수집 완료 · 반영 5개 · 실패 2개',
    ],
    [
      'sourcing.detect_rising_products',
      safeResult('no_change'),
      '변경 없음 · 새로 반영된 항목이 없습니다.',
    ],
  ] as const)(
    'consumes the canonical result for %s without the generic completed fallback',
    (operationKey, result, message) => {
      render(
        <SourcingOperationRunPanel
          run={run({
            operationKey,
            status: 'succeeded',
            progress: 1,
            stage: 'completed',
            result,
            finishedAt: '2026-08-14T00:01:05.000Z',
          })}
        />,
      );

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.queryByText('작업이 완료되었습니다. 최신 스냅샷을 확인해주세요.'))
        .not.toBeInTheDocument();
    },
  );

  it('renders a row-free 1688 batch result without treating typed units as raw JSON', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <SourcingOperationRunPanel
        run={run({
          status: 'succeeded',
          progress: 1,
          stage: 'completed',
          result: {
            ...safeResult('partial'),
            units: [{
              keyword: '儿童雨伞',
              targetId: null,
              outcome: 'failed',
              discovered: 0,
              accepted: 0,
              duplicate: 0,
              failed: 1,
              errorCode: 'provider_failed',
            }],
          },
          finishedAt: '2026-08-14T00:01:05.000Z',
        })}
      />,
    );

    expect(screen.getByText('일부 수집 완료 · 반영 5개 · 실패 2개'))
      .toBeInTheDocument();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('renders a row-free Wing batch result without falling back to generic completion copy', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <SourcingOperationRunPanel
        run={run({
          status: 'succeeded',
          progress: 1,
          stage: 'completed',
          result: {
            ...safeResult('complete'),
            keywords: [{
              keyword: '슬라임',
              outcome: 'complete',
              discovered: 8,
              accepted: 5,
              duplicate: 1,
              failed: 0,
            }],
          },
          finishedAt: '2026-08-14T00:01:05.000Z',
        })}
      />,
    );

    expect(screen.getByText('수집 완료 · 반영 5개')).toBeInTheDocument();
    expect(screen.queryByText('작업이 완료되었습니다. 최신 스냅샷을 확인해주세요.'))
      .not.toBeInTheDocument();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('logs only bounded schema diagnostics for malformed results and never renders arbitrary JSON', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <SourcingOperationRunPanel
        run={run({
          status: 'succeeded',
          progress: 1,
          stage: 'completed',
          result: {
            outcome: 'complete',
            rawRows: [{ title: 'ARBITRARY_MARKETPLACE_ROW' }],
          },
          finishedAt: '2026-08-14T00:01:05.000Z',
        })}
      />,
    );

    expect(screen.getByText('작업이 완료되었습니다. 최신 스냅샷을 확인해주세요.'))
      .toBeInTheDocument();
    expect(screen.queryByText(/ARBITRARY_MARKETPLACE_ROW/)).not.toBeInTheDocument();

    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain('ARBITRARY_MARKETPLACE_ROW');
    error.mockRestore();
  });

  it('does not expose an unknown raw stage label', () => {
    render(<SourcingOperationRunPanel run={run({ stage: 'provider_secret_phase' })} />);

    expect(screen.getByText('작업 진행 중')).toBeInTheDocument();
    expect(screen.queryByText('provider_secret_phase')).not.toBeInTheDocument();
  });

  it('uses terminal Korean copy instead of a retained stage or raw server failure', () => {
    render(
      <SourcingOperationRunPanel
        run={run({
          status: 'failed',
          stage: 'persisting',
          error: {
            code: 'operation_execution_failed',
            message: 'SearchAd response failed strict validation at result.related.items.0.raw',
          },
          finishedAt: '2026-08-14T00:01:05.000Z',
        })}
      />,
    );

    expect(screen.getByText('작업 실패')).toBeInTheDocument();
    expect(screen.getByText('작업에 실패했습니다. 잠시 후 다시 시도해주세요.'))
      .toBeInTheDocument();
    expect(screen.queryByText('수집 결과 저장 중')).not.toBeInTheDocument();
    expect(screen.queryByText(/SearchAd response failed/)).not.toBeInTheDocument();
  });
});
