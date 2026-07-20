import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('./thumbnail/ThumbnailWorkspaceTab', () => ({
  default: ({
    selectedRegistrationThumbnailUrl,
    onPreviewThumbnail,
  }: {
    selectedRegistrationThumbnailUrl?: string | null;
    onPreviewThumbnail?: (url: string | null) => void;
  }) => (
    <button
      type="button"
      data-testid="thumbnail-workspace-tab"
      onClick={() => onPreviewThumbnail?.('https://cdn.example.com/preview.jpg')}
    >
      {selectedRegistrationThumbnailUrl ?? 'none'}
    </button>
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
  productId: 'candidate-1',
  rawData: null,
  selectedAgentId: null,
  selectedBoldVerticalId: null,
  selectedKidsPlayfulId: null,
  selectedRegistrationThumbnailUrl: null,
  thumbnailPreviewImages: [],
  initialAgentHistory: [],
  templateCss: '',
  thumbnailGenerationReturnHref: '/product-pipeline/collected-products/candidate-1',
  thumbnailUrl: null,
  updateField: vi.fn(),
  mobilePreviewData: {
    name: '테스트 상품',
    mainImage: 'https://cdn.example.com/product.jpg',
    salePrice: 0,
    originalPrice: 0,
    discountRate: 0,
    rating: 0,
    reviewCount: 0,
    previewImages: ['https://cdn.example.com/product.jpg'],
  },
  onPreviewThumbnail: vi.fn(),
  onThumbnailPreviewImagesChange: vi.fn(),
  onSaveThumbnailConfiguration: vi.fn(),
  onCommitBasicInfo: vi.fn(),
};

const basicInfo = {
  name: '테스트 상품',
  category: '완구 > 보드게임',
  description: '기존 설명',
  target: '초등학생',
  ageGroup: 'age-8-plus',
  tags: ['자석'],
  keywords: ['자석완구'],
  optionNames: ['단품'],
  kcCertificationStatus: 'unknown',
  kcCertificationNumber: '',
  kcCertificationImageUrl: '',
  productSize: '높이: 30cm',
  colorVariantStatus: 'single',
  colorVariantNames: '빨강',
  boxSetStatus: 'box',
  boxSetQuantity: '1박스',
  originalPrice: 15900,
  salePrice: 12900,
  discountRate: 19,
  rocketBundleQuantity: 0,
  rocketUnitCost: 0,
  thumbnailUrls: ['https://cdn.example.com/product.jpg'],
  selectedThumbnailUrl: null,
  selectedThumbnailGenerationId: null,
  selectedThumbnailGenerationCandidateId: null,
  selectedDetailPageGenerationId: null,
  selectedDetailPageArtifactId: null,
  selectedDetailPageRevisionId: null,
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

  it('passes content workspace history into the detail page workspace tab', () => {
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

  it('keeps basic edit controls outside the product information section', () => {
    render(<ProductTabContent {...baseProps} />);

    const editButton = screen.getByRole('button', { name: '수정' });
    const productInfoSection = screen.getByRole('heading', { name: '상품 정보' }).closest('section');

    expect(productInfoSection).not.toContainElement(editButton);

    fireEvent.click(editButton);

    expect(screen.getByLabelText('상품명')).toHaveValue('테스트 상품');
  });

  it('saves basic information edits from the screen-level toolbar', async () => {
    const onCommitBasicInfo = vi.fn();
    const updateField = vi.fn();

    render(
      <ProductTabContent
        {...baseProps}
        basicInfo={basicInfo}
        onCommitBasicInfo={onCommitBasicInfo}
        updateField={updateField}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('상품 설명'), { target: { value: '수정 설명' } });
    fireEvent.change(screen.getByLabelText('판매가'), { target: { value: '13900' } });
    fireEvent.change(screen.getByLabelText('검색 키워드'), { target: { value: '자석완구, 다트게임' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onCommitBasicInfo).toHaveBeenCalledWith(expect.objectContaining({
      description: '수정 설명',
      salePrice: 13900,
      keywords: ['자석완구', '다트게임'],
    })));
    expect(updateField).toHaveBeenCalledWith('salePrice', 13900);
    expect(screen.queryByLabelText('상품 설명')).not.toBeInTheDocument();
  });

  it('renders registered product basics read-only when preparation persistence is unavailable', () => {
    render(
      <ProductTabContent
        {...baseProps}
        basicInfo={basicInfo}
        onCommitBasicInfo={undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('KC 인증 이미지 업로드')).not.toBeInTheDocument();
  });

  it('keeps the basic editor open and avoids local field updates when save fails', async () => {
    const onCommitBasicInfo = vi.fn().mockRejectedValue(new Error('stale save'));
    const updateField = vi.fn();

    render(
      <ProductTabContent
        {...baseProps}
        basicInfo={basicInfo}
        onCommitBasicInfo={onCommitBasicInfo}
        updateField={updateField}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('상품 설명'), { target: { value: '오래된 탭 설명' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onCommitBasicInfo).toHaveBeenCalled());
    expect(updateField).not.toHaveBeenCalled();
    expect(screen.getByLabelText('상품 설명')).toHaveValue('오래된 탭 설명');
  });

  it('passes thumbnail preview selection up from the thumbnail tab', () => {
    const onPreviewThumbnail = vi.fn();

    render(
      <ProductTabContent
        {...baseProps}
        activeTab="thumbnail"
        onPreviewThumbnail={onPreviewThumbnail}
      />,
    );

    fireEvent.click(screen.getByTestId('thumbnail-workspace-tab'));

    expect(onPreviewThumbnail).toHaveBeenCalledWith('https://cdn.example.com/preview.jpg');
  });
});
