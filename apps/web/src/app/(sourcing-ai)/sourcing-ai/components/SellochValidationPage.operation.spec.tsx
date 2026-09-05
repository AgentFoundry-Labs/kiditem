import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useRefreshSourcingValidation,
  useSourcingRecommendations,
} from '../hooks/use-sourcing-workspace';
import { useWingCatalogSource } from '../hooks/use-wing-catalog-source';
import { SellochValidationPage } from './SellochValidationPage';

const start = vi.fn(async () => ({ id: '10000000-0000-4000-8000-000000000001' }));
const legacyRefresh = vi.fn();

vi.mock('../hooks/use-wing-catalog-source', () => ({
  useWingCatalogSource: vi.fn(() => ({
    attempt: null, isRunning: false, error: null,
    start,
    cancel: vi.fn(),
    retryAttention: vi.fn(),
    isStarting: false,
    isCancelling: false,
    isRetrying: false,
  })),
}));

vi.mock('../hooks/use-sourcing-workspace', () => ({
  useRefreshSourcingValidation: vi.fn(() => ({ mutate: legacyRefresh, isPending: false })),
  useSourcingRecommendations: vi.fn(() => ({
    data: {
      data: {
        items: Array.from({ length: 12 }, (_, index) => ({
          keyword: index === 0 ? '  Ａ   Pencil  ' : `키워드 ${index + 1}`,
          sourceKeywords: [],
        })),
      },
    },
  })),
  useSourcingValidation: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
  })),
}));

describe('SellochValidationPage Wing operation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts one approved recommendation-validation Wing batch from the CTA only', async () => {
    render(<SellochValidationPage />);

    expect(start).not.toHaveBeenCalled();
    expect(legacyRefresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '검증 새로고침' }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(useWingCatalogSource).toHaveBeenLastCalledWith(expect.objectContaining({
            input: {
        keywords: ['A Pencil', ...Array.from({ length: 11 }, (_, index) => `키워드 ${index + 2}`)],
        maxPages: 1,
        purpose: 'recommendation_validation',
      },
    }));
    expect(useSourcingRecommendations).toHaveBeenCalledWith('today');
    expect(useRefreshSourcingValidation).not.toHaveBeenCalled();
    expect(legacyRefresh).not.toHaveBeenCalled();
  });
});
