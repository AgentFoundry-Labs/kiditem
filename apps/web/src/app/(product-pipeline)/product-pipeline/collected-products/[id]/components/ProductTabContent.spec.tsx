import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProductTabContent from './ProductTabContent';
import type { ProductEditState } from '../lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../components/detail/ThumbnailGrid', () => ({
  default: () => <div data-testid="thumbnail-grid" />,
}));

vi.mock('../../components/detail/TagEditor', () => ({
  default: () => <div data-testid="tag-editor" />,
}));

vi.mock('../hooks/useGenerateSourcingThumbnail', () => ({
  useGenerateSourcingThumbnail: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSourcingThumbnailGenerations: () => ({ data: [] }),
}));

vi.mock('./GenerationHistoryTab', () => ({
  default: ({ initialAgentHistory = [] }: { initialAgentHistory?: unknown[] }) => (
    <div data-testid="generation-history-tab">{initialAgentHistory.length}</div>
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
  it('does not render the linked produced content panel in the basic workspace tab', () => {
    render(<ProductTabContent {...baseProps} />);

    expect(screen.queryByTestId('linked-produced-content-panel')).not.toBeInTheDocument();
  });

  it('passes registration workspace history into the generation history tab', () => {
    render(
      <ProductTabContent
        {...baseProps}
        activeTab="history"
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

    expect(screen.getByTestId('generation-history-tab')).toHaveTextContent('1');
  });
});
