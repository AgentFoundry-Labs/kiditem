import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ThumbnailJobView } from '../../../_shared/hooks/useThumbnailJobs';
import { DirectUploadJobsSection } from './DirectUploadJobsSection';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  listParams: null as unknown,
  directGeneration: {
    id: 'direct-generation-1',
    contentWorkspaceId: 'workspace-direct',
    status: 'succeeded',
    method: 'generate',
    prompt: null,
    errorMessage: null,
    attemptCount: 1,
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
    candidates: [{
      id: 'asset-1',
      contentWorkspaceId: 'workspace-direct',
      source: 'ai',
      role: 'thumbnail',
      url: 'https://example.com/generated.png',
      label: null,
      sortOrder: 0,
      width: null,
      height: null,
      thumbnailGenerationId: 'direct-generation-1',
      isCurrentThumbnail: false,
      createdAt: '2026-05-18T00:00:00.000Z',
    }],
    adoptedCandidate: null,
    // 직접 업로드 작업공간은 이름이 없다 — 서버가 job 의 상품명으로 부른다.
    workspace: { id: 'workspace-direct', salesProductId: null, name: 'Uploaded toy', imageUrl: 'https://example.com/input.png' },
  } satisfies ThumbnailJobView,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../../../_shared/hooks/useThumbnailJobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_shared/hooks/useThumbnailJobs')>()),
  useThumbnailJobs: (params: unknown) => {
    mocks.listParams = params;
    return { data: [mocks.directGeneration], isLoading: false };
  },
}));

vi.mock('../../edit/lib/upload-session', () => ({
  listRecentThumbnailEditorUploads: () => [],
  readThumbnailEditorUpload: () => null,
}));

describe('DirectUploadJobsSection', () => {
  it('shows persisted direct-upload generations and reopens them by generation id', () => {
    render(<DirectUploadJobsSection />);

    expect(mocks.listParams).toEqual({ scope: 'direct-upload', limit: 8 });
    expect(screen.getByRole('heading', { name: '직접 업로드 생성 이력' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Uploaded toy').closest('button')!);

    expect(mocks.push).toHaveBeenCalledWith(
      '/product-pipeline/thumbnail-generation/edit?mode=edit&editCase=single&generationId=direct-generation-1&productName=Uploaded+toy',
    );
  });
});
