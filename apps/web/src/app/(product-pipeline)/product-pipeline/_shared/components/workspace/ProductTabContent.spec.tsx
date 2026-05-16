import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductTabContent from './ProductTabContent';
import type { ProductEditState } from '../../lib/product-workspace-types';

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('./detail/ThumbnailGrid', () => ({
  default: ({
    onOpenThumbnailEditor,
    onOpenThumbnailGeneration,
  }: {
    onOpenThumbnailEditor?: () => void;
    onOpenThumbnailGeneration?: () => void;
  }) => (
    <div>
      <button type="button" data-testid="thumbnail-generation" onClick={onOpenThumbnailGeneration}>
        thumbnail-generation
      </button>
      <button type="button" data-testid="thumbnail-editor" onClick={onOpenThumbnailEditor}>
        thumbnail-editor
      </button>
    </div>
  ),
}));

vi.mock('./detail/TagEditor', () => ({
  default: () => <div data-testid="tag-editor" />,
}));

vi.mock('../../hooks/useGenerateSourcingThumbnail', () => ({
  useGenerateSourcingThumbnail: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSourcingThumbnailGenerations: () => ({ data: [] }),
}));

vi.mock('./GenerationHistoryTab', () => ({
  default: ({ initialAgentHistory = [] }: { initialAgentHistory?: unknown[] }) => (
    <div data-testid="generation-history-tab">{initialAgentHistory.length}</div>
  ),
}));

vi.mock('./thumbnail/ThumbnailWorkspaceTab', () => ({
  default: ({ selectedRegistrationThumbnailUrl }: { selectedRegistrationThumbnailUrl?: string | null }) => (
    <div data-testid="thumbnail-workspace-tab">{selectedRegistrationThumbnailUrl ?? 'none'}</div>
  ),
}));

vi.mock('./detail/DetailPageWorkspaceTab', () => ({
  default: ({ initialAgentHistory = [] }: { initialAgentHistory?: unknown[] }) => (
    <div data-testid="detail-page-workspace-tab">{initialAgentHistory.length}</div>
  ),
}));

const editData: ProductEditState = {
  category: '',
  discountRate: 0,
  name: '테스트 상품',
  originalPrice: 0,
  productInfo: [],
  rating: 0,
  reviewCount: 0,
  salePrice: 0,
  tags: [],
  thumbnails: ['https://cdn.example.com/product.jpg'],
  features: [],
};

const baseProps = {
  activeTab: 'basic' as const,
  detailPreviewHtml: '',
  editData,
  editedHtml: null,
  imageUrls: [],
  nameLength: 5,
  onSelectAgent: vi.fn(),
  onSelectBoldVertical: vi.fn(),
  onSelectKidsPlayful: vi.fn(),
  onSelectRegistrationThumbnail: vi.fn(),
  productId: 'candidate-1',
  promotedMasterId: null,
  rawData: null,
  selectedAgentId: null,
  selectedBoldVerticalId: null,
  selectedKidsPlayfulId: null,
  selectedRegistrationThumbnailUrl: null,
  initialAgentHistory: [],
  templateCss: '',
  thumbnailGenerationReturnHref: '/product-pipeline/collected-products/candidate-1',
  thumbnailUrl: null,
  updateField: vi.fn(),
};

describe('ProductTabContent', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('does not render the linked produced content panel in the basic workspace tab', () => {
    render(<ProductTabContent {...baseProps} />);

    expect(screen.queryByTestId('linked-produced-content-panel')).not.toBeInTheDocument();
  });

  it('renders the thumbnail workspace tab when thumbnail is active', () => {
    render(
      <ProductTabContent
        {...baseProps}
        activeTab="thumbnail"
        selectedRegistrationThumbnailUrl="https://cdn.example.com/generated.jpg"
      />,
    );

    expect(screen.getByTestId('thumbnail-workspace-tab')).toHaveTextContent(
      'https://cdn.example.com/generated.jpg',
    );
  });

  it('passes registration workspace history into the detail page workspace tab', () => {
    render(
      <ProductTabContent
        {...baseProps}
        activeTab="detail"
        initialAgentHistory={[
          {
            id: 'generation-1',
            generatedTitle: '등록 상품 이력',
            status: 'COMPLETED',
            templateId: 'kiditem',
            detailPageData: null,
            imageUrls: [],
            processedImages: {},
            detailPageArtifactId: 'artifact-1',
            detailPageRevisionId: null,
            errorMessage: null,
            productId: null,
            createdAt: '2026-05-15T12:00:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByTestId('detail-page-workspace-tab')).toHaveTextContent('1');
  });

  it('does not expose thumbnail generation actions in the basic tab', () => {
    render(<ProductTabContent {...baseProps} thumbnailSourceCandidateId="candidate-1" />);

    expect(screen.queryByTestId('thumbnail-generation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('thumbnail-editor')).not.toBeInTheDocument();
  });
});
