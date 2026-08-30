import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useRefreshSourcingValidation,
  useSourcingRecommendations,
  useSourcingValidation,
} from '../hooks/use-sourcing-workspace';
import { SellochValidationPage } from './SellochValidationPage';

vi.mock('../hooks/use-sourcing-workspace', () => ({
  useRefreshSourcingValidation: vi.fn(),
  useSourcingRecommendations: vi.fn(),
  useSourcingValidation: vi.fn(),
}));

vi.mock('../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: vi.fn(() => ({
    run: null,
    start: vi.fn(),
    cancel: vi.fn(),
    retryAttention: vi.fn(),
    isStarting: false,
    isCancelling: false,
    isRetrying: false,
  })),
}));

describe('SellochValidationPage', () => {
  beforeEach(() => {
    vi.mocked(useSourcingValidation).mockReturnValue({
      data: {
        status: 'ready',
        generatedAt: '2026-08-10T00:00:00.000Z',
        lastSuccessfulAt: '2026-08-10T00:00:00.000Z',
        freshUntil: null,
        operationId: null,
        warnings: [],
        error: null,
        data: {
          recommendationRunId: '00000000-0000-4000-8000-000000000001',
          nextCursor: null,
          items: [{
            episodeId: '00000000-0000-4000-8000-000000000002',
            recommendationRunId: '00000000-0000-4000-8000-000000000001',
            itemKey: 'a'.repeat(64),
            displayName: '검증 대기 상품',
            imageUrl: null,
            status: 'blocked',
            score: null,
            landedCostKrw: null,
            expectedMarginBps: null,
            validUntil: null,
            checks: [{ checkKey: 'supplier_evidence', status: 'missing', summary: null }],
          }],
        },
      },
      isLoading: false,
      error: null,
    } as never);
    vi.mocked(useRefreshSourcingValidation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(useSourcingRecommendations).mockReturnValue({
      data: { data: { items: [] } },
      isLoading: false,
      error: null,
    } as never);
  });

  it('shows missing server evidence rather than the legacy fixture score and margin', () => {
    render(<SellochValidationPage />);

    expect(screen.getByRole('heading', { name: '상품 검증 큐' })).toBeVisible();
    expect(screen.getAllByText('자료 없음').length).toBeGreaterThan(0);
    expect(screen.getByText('공급 근거 없음')).toBeVisible();
    expect(screen.queryByText('91점')).not.toBeInTheDocument();
    expect(screen.queryByText('28.5%')).not.toBeInTheDocument();
  });
});
