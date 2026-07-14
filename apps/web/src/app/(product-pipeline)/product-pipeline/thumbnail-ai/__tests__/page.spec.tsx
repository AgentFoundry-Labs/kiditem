import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ThumbnailsPage from '../page';

const generation = {
  id: '33333333-3333-4333-8333-333333333333',
  contentWorkspaceId: '22222222-2222-4222-8222-222222222222',
  status: 'succeeded',
  phase: 'generated',
  candidates: [],
  selectedUrl: null,
  originalUrl: 'https://cdn.example.com/source.jpg',
  createdAt: '2026-05-08T00:00:00.000Z',
  contentWorkspace: {
    id: '22222222-2222-4222-8222-222222222222',
    name: '검증용 상품',
    imageUrl: 'https://cdn.example.com/source.jpg',
    coupangProductId: null,
    category: null,
  },
};

const failedGeneration = {
  ...generation,
  id: '44444444-4444-4444-8444-444444444444',
  status: 'failed',
  phase: null,
  errorMessage: 'fetch failed',
};

const mockSearchParams = vi.hoisted(() => ({
  value: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams.value,
  usePathname: () => '/product-pipeline/thumbnail-ai',
  useRouter: () => ({ replace: mockSearchParams.replace }),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../_shared/components/thumbnails/DetailModal', () => ({
  DetailModal: ({ gen }: { gen: { id: string } | null }) => <div data-testid="detail-modal">generation:{gen?.id}</div>,
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
    data: [generation, failedGeneration],
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

vi.mock('../components/ThumbnailHeader', () => ({
  ThumbnailHeader: () => <div />,
}));
vi.mock('../components/BatchProgressBanner', () => ({
  BatchProgressBanner: () => <div />,
}));
vi.mock('../components/GradeDistributionDonut', () => ({
  GradeDistributionDonut: () => <div />,
}));
vi.mock('../components/AiActionCenter', () => ({
  AiActionCenter: () => <div />,
}));
vi.mock('../components/ComplianceCard', () => ({
  ComplianceCard: () => <div />,
}));
vi.mock('../components/AnalyticsCard', () => ({
  AnalyticsCard: () => <div />,
}));
vi.mock('../components/PipelineVisualization', () => ({
  PipelineVisualization: () => <div />,
}));
vi.mock('../components/ThumbnailMainTabs', () => ({
  ThumbnailMainTabs: () => <div />,
}));
vi.mock('../components/UnclassifiedTab', () => ({
  UnclassifiedTab: () => <div />,
}));
vi.mock('../components/ScanResultsTab', () => ({
  ScanResultsTab: () => <div />,
}));
vi.mock('../components/AiEditTab', () => ({
  AiEditTab: ({ editFilter }: { editFilter: string }) => <div data-testid="ai-edit-tab">filter:{editFilter}</div>,
}));
vi.mock('../components/HistoryTab', () => ({ HistoryTab: () => <div /> }));
vi.mock('../components/InspectionDrawer', () => ({
  InspectionDrawer: () => <div />,
}));

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

  it('opens failed generation deep links on the failed edit filter', async () => {
    mockSearchParams.value = new URLSearchParams(`generationId=${failedGeneration.id}`);

    render(<ThumbnailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('detail-modal')).toHaveTextContent(`generation:${failedGeneration.id}`);
    });
    expect(screen.getByTestId('ai-edit-tab')).toHaveTextContent('filter:failed');
  });

  it('opens the AI edit tab from returnTo query params', async () => {
    mockSearchParams.value = new URLSearchParams('tab=ai-edit&editFilter=ready');

    render(<ThumbnailsPage />);

    expect(screen.getByTestId('ai-edit-tab')).toHaveTextContent('filter:ready');
  });
});
