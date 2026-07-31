import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import SourcingPage from './page';

const {
  deleteCandidateMock,
  invalidateQueriesMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  deleteCandidateMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
  useQuery: () => ({
    data: {
      items: [{ id: 'candidate-1', name: '테스트 상품', status: 'sourced' }],
      total: 1,
    },
    isLoading: false,
    isPlaceholderData: false,
  }),
  useMutation: (options: {
    mutationFn: (variables: unknown) => Promise<unknown>;
    onSuccess?: (data: unknown, variables: unknown) => void;
    onError?: (error: unknown, variables: unknown) => void;
    onSettled?: (data: unknown, error: unknown, variables: unknown) => void;
  }) => ({
    isPending: false,
    mutate: (variables: unknown) => {
      void options.mutationFn(variables).then(
        (data) => {
          options.onSuccess?.(data, variables);
          options.onSettled?.(data, null, variables);
        },
        (error) => {
          options.onError?.(error, variables);
          options.onSettled?.(undefined, error, variables);
        },
      );
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('./lib/sourcing-api', () => ({
  candidatesApi: { delete: deleteCandidateMock },
  productsApi: { list: vi.fn() },
  searchSellpiaInventorySkus: vi.fn(),
  isInProgress: () => false,
}));

vi.mock('./hooks/useProcessingIds', () => ({
  useProcessingIds: () => ({ processingIds: new Set<string>() }),
}));

vi.mock('./hooks/useScrapeUrl', () => ({
  useScrapeUrl: () => ({ showScrapeInput: false }),
}));

vi.mock('./hooks/useWingRegistrationPreparation', () => ({
  useWingRegistrationPreparation: () => ({
    start: vi.fn(),
    cancel: vi.fn(),
    isPreparing: false,
    message: null,
  }),
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate', () => ({
  useAllGenerationsInProgress: () => [],
  useKidsPlayfulGenerationCancel: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../_shared/components/inbox/ProductPipelineHeader', () => ({
  ProductPipelineHeader: () => null,
}));
vi.mock('../_shared/components/inbox/ProductPipelineStats', () => ({
  ProductPipelineStats: () => null,
}));
vi.mock('../_shared/components/workspace/GenerationProgressBanner', () => ({
  GenerationProgressBannerStack: () => null,
}));
vi.mock('@/components/ui/Pagination', () => ({ Pagination: () => null }));
vi.mock('./components/list/ScrapeUrlInput', () => ({ default: () => null }));
vi.mock('./components/list/SourcingToolbar', () => ({ default: () => null }));
vi.mock('./components/wing/WingRegistrationConfirmDialog', () => ({ default: () => null }));
vi.mock('./components/list/ProductList', () => ({
  default: ({ onDelete }: { onDelete: (id: string) => void }) => (
    <button type="button" onClick={() => onDelete('candidate-1')}>삭제 실행</button>
  ),
}));

describe('SourcingPage candidate deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the server reason when a candidate deletion is blocked', async () => {
    deleteCandidateMock.mockRejectedValueOnce(new ApiError(
      409,
      'Conflict',
      '쿠팡 등록이 시작된 상품은 삭제할 수 없습니다.',
    ));

    render(<SourcingPage />);
    fireEvent.click(screen.getByRole('button', { name: '삭제 실행' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        '쿠팡 등록이 시작된 상품은 삭제할 수 없습니다.',
      );
    });
  });
});
