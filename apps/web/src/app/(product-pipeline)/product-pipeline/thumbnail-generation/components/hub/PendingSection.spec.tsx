import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PendingSection } from './PendingSection';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  cancelGeneration: vi.fn().mockResolvedValue(undefined),
  generations: [] as ThumbnailGenerationItem[],
  runningGeneration: {
    id: 'thumbnail-generation-1',
    contentWorkspaceId: 'workspace-1',
    sourceCandidateId: null,
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
    contentWorkspace: {
      id: 'workspace-1',
      name: '테스트 상품',
      imageUrl: 'https://example.com/original.png',
      coupangProductId: null,
      category: null,
    },
  },
}));

mocks.generations = [mocks.runningGeneration as ThumbnailGenerationItem];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../../../_shared/hooks/useThumbnailGenerations', () => ({
  useGenerationList: () => ({
    data: mocks.generations,
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
    mocks.generations = [mocks.runningGeneration as ThumbnailGenerationItem];
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

  it('keeps the section visible but does not list completed thumbnail generations as in-progress', () => {
    mocks.generations = [
      {
        ...mocks.runningGeneration,
        id: 'thumbnail-generation-complete',
        status: 'succeeded',
        phase: 'ready',
      } as ThumbnailGenerationItem,
    ];

    render(<PendingSection />);

    expect(screen.getByRole('heading', { name: '진행 중인 작업' })).toBeInTheDocument();
    expect(screen.getByText('전체 0')).toBeInTheDocument();
    expect(screen.getByText('진행 중인 작업 없음')).toBeInTheDocument();
    expect(screen.queryByText('테스트 상품')).not.toBeInTheDocument();
  });
});
