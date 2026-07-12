import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductCard from './ProductCard';
import type { SourcedProduct } from '../../lib/sourcing-api';

const { useKidsPlayfulInProgressMock } = vi.hoisted(() => ({
  useKidsPlayfulInProgressMock: vi.fn(),
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/_shared/hooks/useGenerateDetailPage', () => ({
  useGenerateDetailPage: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/_shared/hooks/useKidsPlayfulFromSourcing', () => ({
  useKidsPlayfulFromSourcing: () => ({ trigger: vi.fn(), isPending: false }),
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate', () => ({
  useKidsPlayfulInProgress: (...args: unknown[]) => useKidsPlayfulInProgressMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function productFixture(overrides: Partial<SourcedProduct> = {}): SourcedProduct {
  return {
    id: 'candidate-1',
    organizationId: 'org-1',
    name: '자석 다트게임',
    status: 'sourced',
    sourcePlatform: 'ALIBABA_1688',
    source_platform: 'ALIBABA_1688',
    sourceUrl: 'https://1688.com/item/1',
    source_url: 'https://1688.com/item/1',
    thumbnailUrl: 'https://cdn.example.com/product.jpg',
    thumbnail_url: 'https://cdn.example.com/product.jpg',
    imageUrl: 'https://cdn.example.com/product.jpg',
    images: [],
    price_krw: null,
    cost_cny: null,
    image_count: 1,
    is_processed: false,
    created_at: '2026-05-17T00:00:00.000Z',
    updated_at: '2026-05-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProductCard quick processing action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useKidsPlayfulInProgressMock.mockReturnValue(null);
  });

  it('keeps collected generation candidate-scoped when registration state exists', () => {
    render(
      <ProductCard
        product={productFixture({
          promotedMasterId: 'legacy-master-1',
          productPreparation: {
            id: 'preparation-1',
            sourceCandidateId: 'candidate-1',
            channelAccountId: 'account-1',
            contentWorkspaceId: 'workspace-1',
            listingId: 'listing-1',
            status: 'registered',
            selectedThumbnailUrl: null,
            selectedThumbnailGenerationCandidateId: null,
            selectedDetailPageGenerationId: null,
            selectedDetailPageArtifactId: null,
            selectedDetailPageRevisionId: null,
            updatedAt: '2026-07-13T00:00:00.000Z',
          },
        } as Partial<SourcedProduct> & { promotedMasterId: string })}
        isProcessing={false}
        isDeleting={false}
        onDelete={vi.fn()}
        onNavigate={vi.fn()}
        onOpenEditor={vi.fn()}
        onOpenQuickProcess={vi.fn()}
        quickProcessSelectedCount={0}
      />,
    );

    expect(useKidsPlayfulInProgressMock).toHaveBeenCalledWith('candidate-1', {
      sourceCandidateId: 'candidate-1',
    });
  });

  it('opens the selected-product quick processing modal from the collected product card', () => {
    const onOpenQuickProcess = vi.fn();

    render(
      <ProductCard
        product={productFixture()}
        isProcessing={false}
        isDeleting={false}
        onDelete={vi.fn()}
        onNavigate={vi.fn()}
        onOpenEditor={vi.fn()}
        onOpenQuickProcess={onOpenQuickProcess}
        quickProcessSelectedCount={2}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '선택 2개 AI 작업 선택' }));

    expect(onOpenQuickProcess).toHaveBeenCalledWith('candidate-1');
    expect(screen.queryByText('상세페이지 템플릿 선택')).not.toBeInTheDocument();
  });

  it('does not reopen quick processing while the product already has generation in progress', () => {
    const onOpenQuickProcess = vi.fn();

    render(
      <ProductCard
        product={productFixture()}
        isProcessing
        isDeleting={false}
        onDelete={vi.fn()}
        onNavigate={vi.fn()}
        onOpenEditor={vi.fn()}
        onOpenQuickProcess={onOpenQuickProcess}
        quickProcessSelectedCount={0}
      />,
    );

    const button = screen.getByRole('button', { name: /처리 중/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(onOpenQuickProcess).not.toHaveBeenCalled();
  });
});
