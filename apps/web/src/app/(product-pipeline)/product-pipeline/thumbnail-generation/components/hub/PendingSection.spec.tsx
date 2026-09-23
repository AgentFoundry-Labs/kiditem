import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PendingSection } from './PendingSection';
import type { ThumbnailJobListItem } from '../../../_shared/hooks/useThumbnailJobs';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  cancelGeneration: vi.fn().mockResolvedValue(undefined),
  generations: [] as unknown[],
  runningGeneration: {
    id: 'thumbnail-generation-1',
    contentWorkspaceId: 'workspace-1',
    status: 'running',
    method: 'generate',
    prompt: null,
    errorMessage: null,
    attemptCount: 1,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    candidates: [],
    adoptedCandidate: null,
    workspace: {
      id: 'workspace-1',
      salesProductId: null,
      name: '테스트 상품',
      imageUrl: 'https://example.com/original.png',
    },
    registrationExecutionId: null,
    registrationExecutionStatus: null,
    registrationStatus: null,
    registrationError: null,
    registrationCheckedAt: null,
  } satisfies ThumbnailJobListItem,
}));

mocks.generations = [mocks.runningGeneration];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../../../_shared/hooks/useThumbnailJobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_shared/hooks/useThumbnailJobs')>()),
  useThumbnailJobs: () => ({
    data: mocks.generations,
    isLoading: false,
  }),
  useDeleteThumbnailJob: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useCancelThumbnailJob: () => ({
    mutateAsync: mocks.cancelGeneration,
    isPending: false,
  }),
}));

describe('PendingSection', () => {
  it('offers a cancel action for running thumbnail generation cards', async () => {
    mocks.generations = [mocks.runningGeneration];
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
      },
    ];

    render(<PendingSection />);

    expect(screen.getByRole('heading', { name: '진행 중인 작업' })).toBeInTheDocument();
    expect(screen.getByText('전체 0')).toBeInTheDocument();
    expect(screen.getByText('진행 중인 작업 없음')).toBeInTheDocument();
    expect(screen.queryByText('테스트 상품')).not.toBeInTheDocument();
  });
});
