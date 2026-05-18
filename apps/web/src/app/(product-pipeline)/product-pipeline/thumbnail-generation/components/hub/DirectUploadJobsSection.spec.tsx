import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';
import { DirectUploadJobsSection } from './DirectUploadJobsSection';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  listParams: null as unknown,
  directGeneration: {
    id: 'direct-generation-1',
    productId: null,
    sourceCandidateId: null,
    contentWorkspaceId: null,
    originalUrl: 'https://example.com/input.png',
    candidates: [
      {
        id: 'candidate-1',
        url: 'https://example.com/generated.png',
        filename: 'generated.png',
        storageKey: null,
        sortOrder: 0,
      },
    ],
    selectedUrl: null,
    status: 'succeeded',
    phase: 'ready',
    grade: 'F',
    score: 0,
    method: 'generate',
    editAnalysis: null,
    inputMeta: { productName: 'Uploaded toy', mode: 'edit' },
    errorMessage: null,
    createdAt: '2026-05-18T00:00:00.000Z',
    product: null,
  } satisfies ThumbnailGenerationItem,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../../../_shared/hooks/useThumbnailGenerations', () => ({
  useGenerationList: (params: unknown) => {
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
