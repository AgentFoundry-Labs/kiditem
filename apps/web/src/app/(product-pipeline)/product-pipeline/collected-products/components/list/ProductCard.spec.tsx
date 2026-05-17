import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductCard from './ProductCard';
import type { SourcedProduct } from '../../lib/sourcing-api';
import { candidatesApi } from '../../lib/sourcing-api';

vi.mock('@/app/(product-pipeline)/product-pipeline/_shared/hooks/useGenerateDetailPage', () => ({
  useGenerateDetailPage: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/_shared/hooks/useKidsPlayfulFromSourcing', () => ({
  useKidsPlayfulFromSourcing: () => ({ trigger: vi.fn(), isPending: false }),
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate', () => ({
  useKidsPlayfulInProgress: () => null,
}));

vi.mock('../../lib/sourcing-api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/sourcing-api')>('../../lib/sourcing-api');
  return {
    ...actual,
    candidatesApi: {
      ...actual.candidatesApi,
      quickProcess: vi.fn(),
    },
  };
});

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
    promotedMasterId: null,
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
    vi.mocked(candidatesApi.quickProcess).mockReset();
  });

  it('starts AI quick processing from the collected product card', async () => {
    vi.mocked(candidatesApi.quickProcess).mockResolvedValueOnce({
      ok: true,
      candidateId: 'candidate-1',
      href: '/product-pipeline/collected-products/candidate-1',
      parentOperationKey: 'product-generation:batch-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
    });

    render(
      <ProductCard
        product={productFixture()}
        isProcessing={false}
        isDeleting={false}
        onDelete={vi.fn()}
        onNavigate={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'AI 간편 처리' }));

    await waitFor(() => {
      expect(candidatesApi.quickProcess).toHaveBeenCalledWith('candidate-1');
    });
    expect(screen.queryByText('상세페이지 템플릿 선택')).not.toBeInTheDocument();
  });
});
