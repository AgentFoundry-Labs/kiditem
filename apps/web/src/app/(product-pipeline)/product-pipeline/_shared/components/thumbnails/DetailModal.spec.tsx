import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DetailModal } from './DetailModal';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock('@/components/coupang/CoupangPreview', () => ({
  CoupangSearchCardPreview: () => <div data-testid="coupang-preview" />,
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-edit-href', () => ({
  buildEditHref: () => '/product-pipeline/thumbnail-generation/edit',
}));

const runningGeneration: ThumbnailGenerationItem = {
  id: 'generation-1',
  productId: 'product-1',
  sourceCandidateId: null,
  contentWorkspaceId: null,
  originalUrl: 'https://example.com/original.png',
  candidates: [],
  selectedUrl: null,
  status: 'running',
  phase: null,
  grade: '',
  score: 0,
  method: 'generate',
  editAnalysis: null,
  inputMeta: null,
  errorMessage: null,
  createdAt: '2026-05-17T00:00:00.000Z',
  product: {
    id: 'product-1',
    name: '테스트 상품',
    imageUrl: 'https://example.com/original.png',
    coupangProductId: null,
    category: null,
  },
};

describe('DetailModal', () => {
  it('offers a cancel action for running thumbnail generations', () => {
    const onCancel = vi.fn();

    render(
      <DetailModal
        product={null}
        gen={runningGeneration}
        productGenerations={[]}
        isAiAnalyzing={false}
        generatedProductIds={new Set()}
        hideEdit
        onClose={vi.fn()}
        onAiAnalyze={vi.fn()}
        onEditCompliance={vi.fn()}
        onEditQuality={vi.fn()}
        onSelectCandidate={vi.fn()}
        onApply={vi.fn()}
        onSkip={vi.fn()}
        onDelete={vi.fn()}
        onSelectGen={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '썸네일 생성 중단' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
