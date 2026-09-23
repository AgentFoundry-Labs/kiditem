import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import SourcingPage from './page';

const {
  deleteCandidateMock,
  quickProcessMock,
  createRequestId,
  invalidateQueriesMock,
  toastErrorMock,
  wingOnReadyRef,
  submitWingRegistrationMock,
  waitForRegisteredListingMock,
  registrationExecutionConfirmMock,
  registrationExecutionMarkUnresolvedMock,
} = vi.hoisted(() => ({
  deleteCandidateMock: vi.fn(),
  quickProcessMock: vi.fn(),
  createRequestId: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  toastErrorMock: vi.fn(),
  wingOnReadyRef: { current: null as ((draft: unknown) => void) | null },
  submitWingRegistrationMock: vi.fn(),
  waitForRegisteredListingMock: vi.fn(),
  registrationExecutionConfirmMock: vi.fn(),
  registrationExecutionMarkUnresolvedMock: vi.fn(),
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
  candidatesApi: { delete: deleteCandidateMock, quickProcess: quickProcessMock },
  productsApi: { list: vi.fn() },
  searchSellpiaInventorySkus: vi.fn(),
  isInProgress: () => false,
}));

vi.mock('@/lib/secure-random-uuid', () => ({
  createSecureRandomUuid: createRequestId,
}));

vi.mock('./hooks/useProcessingIds', () => ({
  useProcessingIds: () => ({ processingIds: new Set<string>() }),
}));

vi.mock('./hooks/useScrapeUrl', () => ({
  useScrapeUrl: () => ({ showScrapeInput: false }),
}));

vi.mock('./hooks/useWingRegistrationPreparation', () => ({
  useWingRegistrationPreparation: (options: { onReady: (draft: unknown) => void }) => {
    wingOnReadyRef.current = options.onReady;
    return {
      start: vi.fn(),
      cancel: vi.fn(),
      isPreparing: false,
      message: null,
    };
  },
}));

// registrationExecutionApi 는 page.tsx 가 직접 부른다(WING 확정/미해결 표시) — KID-310 부터 salesProductId 로 연다.
vi.mock('../../../(channels)/_shared/registration-execution-api', () => ({
  registrationExecutionApi: {
    confirm: registrationExecutionConfirmMock,
    markUnresolved: registrationExecutionMarkUnresolvedMock,
  },
}));

// submitWingRegistration/waitForRegisteredListing 만 갈아 끼운다 — isConfirmedWingRegistration ·
// translateWingError 는 실제 구현 그대로 써서 분기 판정까지 검증한다.
vi.mock('./lib/wing-registration-flow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/wing-registration-flow')>();
  return {
    ...actual,
    submitWingRegistration: submitWingRegistrationMock,
    waitForRegisteredListing: waitForRegisteredListingMock,
  };
});

vi.mock('./components/wing/WingRegistrationConfirmDialog', () => ({
  default: ({ draft, onConfirm }: { draft: unknown; onConfirm: (overrides: unknown, autoSubmit: boolean, channelAccountId: string, sellpiaSelection: unknown) => void }) =>
    draft ? (
      <button type="button" onClick={() => onConfirm({}, false, 'channel-account-1', { mode: 'skip' })}>
        WING 확인
      </button>
    ) : null,
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
vi.mock('./components/list/ProductList', () => ({
  default: ({
    onDelete,
    onOpenQuickProcess,
  }: {
    onDelete: (id: string) => void;
    onOpenQuickProcess: (id: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => onDelete('candidate-1')}>삭제 실행</button>
      <button type="button" onClick={() => onOpenQuickProcess('candidate-1')}>AI 작업 선택</button>
    </>
  ),
}));

describe('SourcingPage candidate deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRequestId.mockReturnValue('batch-quick-process-key');
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

  it('reuses a failed batch quick-process key when the user retries the same candidate', async () => {
    quickProcessMock
      .mockRejectedValueOnce(new Error('network response lost'))
      .mockResolvedValueOnce({ ok: true });

    render(<SourcingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'AI 작업 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /둘 다 실행/ }));

    await waitFor(() => {
      expect(quickProcessMock).toHaveBeenCalledWith(
        'candidate-1',
        'all',
        'batch-quick-process-key',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'AI 작업 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /둘 다 실행/ }));

    await waitFor(() => {
      expect(quickProcessMock).toHaveBeenCalledTimes(2);
    });
    expect(quickProcessMock).toHaveBeenLastCalledWith(
      'candidate-1',
      'all',
      'batch-quick-process-key',
    );
    expect(createRequestId).toHaveBeenCalledTimes(1);
  });
});

// draft 는 useWingRegistrationPreparation({ onReady }) 로 들어오는 최소 필드만 채운다 — 나머지는
// submitWingRegistration 이 mock 이라 안 쓰인다.
const WING_DRAFT = {
  candidateId: 'candidate-1',
  salesProductId: 'sales-product-1',
  idempotencyKey: 'idem-1',
  product: {},
  overrides: {},
  extensionId: 'extension-1',
  channelAccountId: 'channel-account-1',
};

describe('SourcingPage WING 확정', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRequestId.mockReturnValue('batch-quick-process-key');
    waitForRegisteredListingMock.mockResolvedValue(true);
  });

  it('resolves the current sales-product draft id, not the candidate id, when confirming a completed WING registration', async () => {
    submitWingRegistrationMock.mockResolvedValue({
      submission: {
        attempted: true,
        ok: true,
        status: 'registered',
        externalListingId: 'external-listing-1',
        executionId: 'execution-1',
        evidence: { screenshot: 'shot.png' },
      },
    });

    render(<SourcingPage />);
    act(() => wingOnReadyRef.current?.(WING_DRAFT));
    fireEvent.click(await screen.findByRole('button', { name: 'WING 확인' }));

    await waitFor(() => {
      expect(registrationExecutionConfirmMock).toHaveBeenCalledWith('sales-product-1', {
        executionId: 'execution-1',
        externalListingId: 'external-listing-1',
        evidence: { screenshot: 'shot.png' },
      });
    });
    expect(registrationExecutionConfirmMock).not.toHaveBeenCalledWith('candidate-1', expect.anything());
  });

  it('reports a failed listing sync against the sales-product draft id, not the candidate id', async () => {
    submitWingRegistrationMock.mockResolvedValue({
      submission: {
        attempted: true,
        ok: true,
        status: 'registered',
        externalListingId: 'external-listing-1',
        executionId: 'execution-1',
      },
    });
    registrationExecutionConfirmMock.mockRejectedValueOnce(new Error('등록상품 반영 실패'));

    render(<SourcingPage />);
    act(() => wingOnReadyRef.current?.(WING_DRAFT));
    fireEvent.click(await screen.findByRole('button', { name: 'WING 확인' }));

    await waitFor(() => {
      expect(registrationExecutionMarkUnresolvedMock).toHaveBeenCalledWith(
        'sales-product-1',
        'execution-1',
        { reason: 'completion_failed', message: expect.any(String) },
      );
    });
    expect(registrationExecutionMarkUnresolvedMock).not.toHaveBeenCalledWith('candidate-1', expect.anything(), expect.anything());
  });
});
