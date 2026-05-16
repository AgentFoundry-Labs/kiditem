import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThumbnailWorkspaceTab from './ThumbnailWorkspaceTab';
import type { ProductEditState } from '../../../lib/product-workspace-types';

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../hooks/useGenerateSourcingThumbnail', () => ({
  useSourcingThumbnailGenerations: () => ({
    data: [
      {
        id: 'generation-1',
        status: 'succeeded',
        phase: 'ready',
        registrationStatus: null,
        registrationError: null,
        candidates: [{ id: 'candidate-1', url: 'https://cdn.example.com/generated.jpg' }],
      },
    ],
    isLoading: false,
  }),
}));

const editData: ProductEditState = {
  category: '',
  discountRate: 0,
  features: [],
  name: '테스트 상품',
  originalPrice: 0,
  productInfo: [],
  rating: 0,
  reviewCount: 0,
  salePrice: 0,
  tags: [],
  thumbnails: ['https://cdn.example.com/source.jpg'],
};

describe('ThumbnailWorkspaceTab', () => {
  beforeEach(() => pushMock.mockReset());

  it('requires a selected source before thumbnail actions are enabled', () => {
    render(
      <ThumbnailWorkspaceTab
        editData={{ ...editData, thumbnails: [] }}
        productId="candidate-1"
        promotedMasterId={null}
        registrationWorkspaceId={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        onSelectRegistrationThumbnail={vi.fn()}
        onThumbnailsChange={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    expect(screen.getByRole('button', { name: /원본 보정하기/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /새 장면 만들기/ })).toBeDisabled();
  });

  it('opens edit and creative modes from the selected image', () => {
    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        productId="candidate-1"
        promotedMasterId={null}
        registrationWorkspaceId={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        onSelectRegistrationThumbnail={vi.fn()}
        onThumbnailsChange={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /source\.jpg/ }));
    fireEvent.click(screen.getByRole('button', { name: /원본 보정하기/ }));
    expect(pushMock.mock.calls[0][0]).toContain('thumbnailMode=edit');

    fireEvent.click(screen.getByRole('button', { name: /새 장면 만들기/ }));
    expect(pushMock.mock.calls[1][0]).toContain('thumbnailMode=creative');
  });

  it('shows only product-scoped result and status language', () => {
    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        productId="candidate-1"
        promotedMasterId={null}
        registrationWorkspaceId={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        onSelectRegistrationThumbnail={vi.fn()}
        onThumbnailsChange={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    expect(screen.getByText('이 상품 생성 결과')).toBeInTheDocument();
    expect(screen.getByText('상품 썸네일 상태')).toBeInTheDocument();
    expect(screen.queryByText('진행 중인 작업')).not.toBeInTheDocument();
    expect(screen.queryByText('쿠팡 등록 대기')).not.toBeInTheDocument();
  });
});
