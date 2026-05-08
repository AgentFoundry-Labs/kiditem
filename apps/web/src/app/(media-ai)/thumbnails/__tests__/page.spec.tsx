import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ThumbnailsPage from '../page';

const generation = {
  id: '33333333-3333-4333-8333-333333333333',
  productId: '22222222-2222-4222-8222-222222222222',
  status: 'succeeded',
  phase: 'generated',
  candidates: [],
  selectedUrl: null,
  originalUrl: 'https://cdn.example.com/source.jpg',
  createdAt: '2026-05-08T00:00:00.000Z',
  product: {
    id: '22222222-2222-4222-8222-222222222222',
    title: '검증용 상품',
    imageUrl: 'https://cdn.example.com/source.jpg',
  },
};

const mockSearchParams = vi.hoisted(() => ({
  value: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams.value,
  usePathname: () => '/thumbnails',
  useRouter: () => ({ replace: mockSearchParams.replace }),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../_shared/components/thumbnails/DetailModal', () => ({
  DetailModal: ({ gen }: { gen: { id: string } | null }) => (
    <div data-testid="detail-modal">generation:{gen?.id}</div>
  ),
}));

vi.mock('../hooks/useThumbnailAnalysis', () => ({
  useAnalysisList: () => ({
    data: { total: 0, allResults: [], unclassified: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../_shared/hooks/useThumbnailGenerations', () => ({
  useGenerationList: () => ({
    data: [generation],
    refetch: vi.fn(),
  }),
}));

vi.mock('../hooks/useThumbnailTracking', () => ({
  useTrackingList: () => ({
    data: { items: [], total: 0 },
    isLoading: false,
  }),
}));

vi.mock('../hooks/useBatchAnalysis', () => ({
  useBatchAnalysis: () => ({
    run: vi.fn(),
    isBatchRunning: false,
    batchDone: 0,
    batchTotal: 0,
    elapsed: 0,
    cancel: vi.fn(),
  }),
}));

vi.mock('../hooks/useThumbnailActions', () => ({
  useThumbnailActions: () => ({
    aiResults: {},
    aiAnalyzingId: null,
    mergeAiResults: vi.fn(),
    editSingle: vi.fn(),
    editBatch: vi.fn(),
    runAiAnalysis: vi.fn(),
    selectCandidate: vi.fn(),
    openCoupangEdit: vi.fn(),
    skipGeneration: vi.fn(),
    deleteGeneration: vi.fn(),
  }),
}));

vi.mock('../hooks/useCoupangImageSync', () => ({
  useCoupangImageSync: () => ({
    status: null,
    startError: null,
    isCancelledError: false,
    reset: vi.fn(),
    start: vi.fn(),
    cancel: vi.fn(),
    isRunning: false,
    extensionRunId: null,
    extensionStatus: null,
  }),
}));

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ message }: { message: string }) => <div>{message}</div>,
  ErrorState: ({ message }: { message: string }) => <div>{message}</div>,
}));
vi.mock('@/components/ui/PageSkeleton', () => ({
  default: () => <div>loading</div>,
}));
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('../components/ThumbnailHeader', () => ({ ThumbnailHeader: () => <div /> }));
vi.mock('../components/BatchProgressBanner', () => ({ BatchProgressBanner: () => <div /> }));
vi.mock('../components/UnmatchedReconciliationBanner', () => ({ UnmatchedReconciliationBanner: () => <div /> }));
vi.mock('../components/GradeDistributionDonut', () => ({ GradeDistributionDonut: () => <div /> }));
vi.mock('../components/AiActionCenter', () => ({ AiActionCenter: () => <div /> }));
vi.mock('../components/ComplianceCard', () => ({ ComplianceCard: () => <div /> }));
vi.mock('../components/AnalyticsCard', () => ({ AnalyticsCard: () => <div /> }));
vi.mock('../components/PipelineVisualization', () => ({ PipelineVisualization: () => <div /> }));
vi.mock('../components/ThumbnailMainTabs', () => ({ ThumbnailMainTabs: () => <div /> }));
vi.mock('../components/UnclassifiedTab', () => ({ UnclassifiedTab: () => <div /> }));
vi.mock('../components/ScanResultsTab', () => ({ ScanResultsTab: () => <div /> }));
vi.mock('../components/AiEditTab', () => ({ AiEditTab: () => <div /> }));
vi.mock('../components/HistoryTab', () => ({ HistoryTab: () => <div /> }));
vi.mock('../components/InspectionDrawer', () => ({ InspectionDrawer: () => <div /> }));

describe('ThumbnailsPage deep links', () => {
  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams();
    mockSearchParams.replace.mockReset();
  });

  it('opens the matching generation when generationId is provided in the URL', async () => {
    mockSearchParams.value = new URLSearchParams(`generationId=${generation.id}`);

    render(<ThumbnailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('detail-modal')).toHaveTextContent(`generation:${generation.id}`);
    });
  });
});
