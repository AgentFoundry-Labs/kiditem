import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PendingSection } from './PendingSection';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  cancelGeneration: vi.fn().mockResolvedValue(undefined),
  runningGeneration: {
    id: 'thumbnail-generation-1',
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
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../../../_shared/hooks/useThumbnailGenerations', () => ({
  useGenerationList: () => ({
    data: [mocks.runningGeneration as ThumbnailGenerationItem],
    isLoading: false,
  }),
  useDeleteGeneration: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useCancelGeneration: () => ({
    mutateAsync: mocks.cancelGeneration,
    isPending: false,
  }),
}));

describe('PendingSection', () => {
  it('offers a cancel action for running thumbnail generation cards', async () => {
    render(<PendingSection />);

    fireEvent.click(screen.getByRole('button', { name: '썸네일 생성 중단' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('중단할까요?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '계속 실행' }));

    expect(screen.queryByText('중단할까요?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '썸네일 생성 중단' }));

    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    await waitFor(() => {
      expect(mocks.cancelGeneration).toHaveBeenCalledWith('thumbnail-generation-1');
    });
  });
});
