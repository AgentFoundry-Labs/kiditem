import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThumbnailWorkspaceTab from './ThumbnailWorkspaceTab';
import type { ProductEditState } from '../../../lib/product-workspace-types';

const { pushMock, searchParamsMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock(),
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
  beforeEach(() => {
    pushMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('requires a selected source before thumbnail actions are enabled', () => {
    render(
      <ThumbnailWorkspaceTab
        editData={{ ...editData, thumbnails: [] }}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        thumbnailPreviewImages={[]}
        onPreviewThumbnail={vi.fn()}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    expect(screen.getByRole('button', { name: /선택 이미지 편집하기/ })).toBeDisabled();
  });

  it('opens the full-page editor from the selected image', () => {
    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        thumbnailPreviewImages={editData.thumbnails}
        onPreviewThumbnail={vi.fn()}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '썸네일 미리보기 이미지 1' }));
    fireEvent.click(screen.getByRole('button', { name: /선택 이미지 편집하기/ }));
    expect(pushMock.mock.calls[0][0]).toContain('/product-pipeline/thumbnail-generation/edit?');
    expect(pushMock.mock.calls[0][0]).toContain('mode=edit');
    expect(pushMock.mock.calls[0][0]).toContain('fullPage=1');
  });

  it('shows only product-scoped result and status language', () => {
    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        thumbnailPreviewImages={editData.thumbnails}
        onPreviewThumbnail={vi.fn()}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    expect(screen.getByText('생성 이미지 이력')).toBeInTheDocument();
    expect(screen.queryByText('상품 썸네일 상태')).not.toBeInTheDocument();
    expect(screen.queryByText('진행 중인 작업')).not.toBeInTheDocument();
    expect(screen.queryByText('쿠팡 등록 대기')).not.toBeInTheDocument();
  });

  it('previews the selected source image without applying it as the registration thumbnail', () => {
    const onPreviewThumbnail = vi.fn();
    const onSelectRegistrationThumbnail = vi.fn();

    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        thumbnailPreviewImages={editData.thumbnails}
        onPreviewThumbnail={onPreviewThumbnail}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '썸네일 미리보기 이미지 1' }));

    expect(onPreviewThumbnail).toHaveBeenCalledWith('https://cdn.example.com/source.jpg');
    expect(onSelectRegistrationThumbnail).not.toHaveBeenCalled();
  });

  it('syncs the editor-selected source into the mobile preview when the tab opens', () => {
    const onPreviewThumbnail = vi.fn();
    searchParamsMock.mockReturnValue(
      new URLSearchParams([['imageUrl', 'https://cdn.example.com/edited-from-editor.jpg']]),
    );

    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl="https://cdn.example.com/source.jpg"
        thumbnailPreviewImages={editData.thumbnails}
        onPreviewThumbnail={onPreviewThumbnail}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    expect(onPreviewThumbnail).toHaveBeenCalledWith('https://cdn.example.com/edited-from-editor.jpg');
  });

  it('previews generated result candidates before representative application', () => {
    const onPreviewThumbnail = vi.fn();
    const onSelectRegistrationThumbnail = vi.fn();

    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        thumbnailPreviewImages={editData.thumbnails}
        onPreviewThumbnail={onPreviewThumbnail}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /생성 결과 미리보기 1/ }));

    expect(onPreviewThumbnail).toHaveBeenCalledWith('https://cdn.example.com/generated.jpg');
    expect(onSelectRegistrationThumbnail).not.toHaveBeenCalled();
  });

  it('adds a generated history image to thumbnail preview images', () => {
    const onThumbnailPreviewImagesChange = vi.fn();

    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        thumbnailPreviewImages={editData.thumbnails}
        onPreviewThumbnail={vi.fn()}
        onThumbnailPreviewImagesChange={onThumbnailPreviewImagesChange}
        onSaveThumbnailConfiguration={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '생성 1 미리보기 이미지로 추가' }));

    expect(onThumbnailPreviewImagesChange).toHaveBeenCalledWith([
      'https://cdn.example.com/source.jpg',
      'https://cdn.example.com/generated.jpg',
    ]);
  });

  it('opens generated image actions and sends that image to the editor', () => {
    const onPreviewThumbnail = vi.fn();

    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        thumbnailPreviewImages={editData.thumbnails}
        onPreviewThumbnail={onPreviewThumbnail}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /생성 결과 미리보기 1/ }));

    expect(screen.getByRole('dialog', { name: '생성 이미지 미리보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PNG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /스마트스토어/ })).toHaveTextContent('640 x 640');
    expect(screen.getByRole('button', { name: /쿠팡/ })).toHaveTextContent('1000 x 1000');

    fireEvent.click(screen.getByRole('button', { name: '이미지 편집기로 가기' }));

    expect(pushMock.mock.calls[0][0]).toContain('/product-pipeline/thumbnail-generation/edit?');
    expect(pushMock.mock.calls[0][0]).toContain('mode=edit');
    expect(pushMock.mock.calls[0][0]).toContain('generated.jpg');
    expect(onPreviewThumbnail).toHaveBeenCalledWith('https://cdn.example.com/generated.jpg');
  });

  // 회귀: 대표 등록과 목록 저장이 분리돼 있어 사용자가 하나만 누르면 반쪽만
  // 저장됐다. 이제 한 버튼이 대표 + 목록을 함께 저장한다.
  it('saves the representative and the preview list in one click', () => {
    const onSaveThumbnailConfiguration = vi.fn();

    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        thumbnailPreviewImages={editData.thumbnails}
        onPreviewThumbnail={vi.fn()}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={onSaveThumbnailConfiguration}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '썸네일 미리보기 이미지 1' }));
    fireEvent.click(screen.getByRole('button', { name: '대표 썸네일 · 구성 저장' }));

    expect(onSaveThumbnailConfiguration).toHaveBeenCalledWith({
      thumbnailUrls: ['https://cdn.example.com/source.jpg'],
      selectedThumbnail: {
        url: 'https://cdn.example.com/source.jpg',
        kind: 'source',
        generatedGenerationId: null,
        generatedCandidateId: null,
      },
    });
  });

  it('registers the first preview image as the representative thumbnail', () => {
    const onSaveThumbnailConfiguration = vi.fn();

    render(
      <ThumbnailWorkspaceTab
        editData={editData}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        thumbnailPreviewImages={editData.thumbnails}
        onPreviewThumbnail={vi.fn()}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={onSaveThumbnailConfiguration}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '대표 썸네일 · 구성 저장' }));

    expect(onSaveThumbnailConfiguration).toHaveBeenCalledWith({
      thumbnailUrls: ['https://cdn.example.com/source.jpg'],
      selectedThumbnail: {
        url: 'https://cdn.example.com/source.jpg',
        kind: 'source',
        generatedGenerationId: null,
        generatedCandidateId: null,
      },
    });
  });

  it('moves the selected preview image to the representative position when registering it', () => {
    const onSaveThumbnailConfiguration = vi.fn();
    const onThumbnailPreviewImagesChange = vi.fn();

    render(
      <ThumbnailWorkspaceTab
        editData={{
          ...editData,
          thumbnails: ['https://cdn.example.com/source.jpg', 'https://cdn.example.com/other.jpg'],
        }}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl="https://cdn.example.com/source.jpg"
        thumbnailPreviewImages={['https://cdn.example.com/source.jpg', 'https://cdn.example.com/other.jpg']}
        onPreviewThumbnail={vi.fn()}
        onThumbnailPreviewImagesChange={onThumbnailPreviewImagesChange}
        onSaveThumbnailConfiguration={onSaveThumbnailConfiguration}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '썸네일 미리보기 이미지 2' }));
    fireEvent.click(screen.getByRole('button', { name: '대표 썸네일 · 구성 저장' }));

    expect(onThumbnailPreviewImagesChange).toHaveBeenCalledWith([
      'https://cdn.example.com/other.jpg',
      'https://cdn.example.com/source.jpg',
    ]);
    expect(onSaveThumbnailConfiguration).toHaveBeenCalledWith({
      thumbnailUrls: ['https://cdn.example.com/other.jpg', 'https://cdn.example.com/source.jpg'],
      selectedThumbnail: {
        url: 'https://cdn.example.com/other.jpg',
        kind: 'source',
        generatedGenerationId: null,
        generatedCandidateId: null,
      },
    });
  });

  it('marks the saved representative by saved URL instead of preview order', () => {
    render(
      <ThumbnailWorkspaceTab
        editData={{
          ...editData,
          thumbnails: ['https://cdn.example.com/source.jpg', 'https://cdn.example.com/other.jpg'],
        }}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl="https://cdn.example.com/source.jpg"
        // 배지는 편집용 선택값이 아니라 **저장된 대표**만 근거로 삼는다.
        savedRepresentativeThumbnailUrl="https://cdn.example.com/source.jpg"
        thumbnailPreviewImages={['https://cdn.example.com/other.jpg', 'https://cdn.example.com/source.jpg']}
        onPreviewThumbnail={vi.fn()}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    expect(
      within(screen.getByRole('button', { name: '썸네일 미리보기 이미지 1' })).queryAllByText('대표 이미지'),
    ).toHaveLength(0);
    expect(
      within(screen.getByRole('button', { name: '썸네일 미리보기 이미지 2' })).getAllByText('등록 대표'),
    ).toHaveLength(2);
  });

  // 회귀: `selectedSourceUrl` 의 초기값은 마운트 시점에 확정돼서 서버가 준 저장된
  // 대표가 늦게 도착하면 반영되지 않았다. 그 상태로 저장을 누르면 저장 버튼이
  // **사용자가 저장했던 대표를 엉뚱한 이미지로 조용히 덮어썼다.**
  it('adopts the saved representative as the edit selection when it arrives late', () => {
    const onSaveThumbnailConfiguration = vi.fn();
    const previewImages = ['https://cdn.example.com/other.jpg', 'https://cdn.example.com/source.jpg'];

    render(
      <ThumbnailWorkspaceTab
        editData={{ ...editData, thumbnails: previewImages }}
        contentWorkspaceId={null}
        thumbnailUrl="https://cdn.example.com/other.jpg"
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        savedRepresentativeThumbnailUrl="https://cdn.example.com/source.jpg"
        thumbnailPreviewImages={previewImages}
        onPreviewThumbnail={vi.fn()}
        onThumbnailPreviewImagesChange={vi.fn()}
        onSaveThumbnailConfiguration={onSaveThumbnailConfiguration}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    // 아무것도 건드리지 않고 저장 → 저장된 대표가 그대로 유지돼야 한다.
    fireEvent.click(screen.getByRole('button', { name: '대표 썸네일 · 구성 저장' }));

    expect(onSaveThumbnailConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedThumbnail: expect.objectContaining({ url: 'https://cdn.example.com/source.jpg' }),
      }),
    );
  });

  it('adds product images through the image picker modal instead of rendering all inline', () => {
    const onThumbnailPreviewImagesChange = vi.fn();

    render(
      <ThumbnailWorkspaceTab
        editData={{
          ...editData,
          thumbnails: ['https://cdn.example.com/source.jpg', 'https://cdn.example.com/other.jpg'],
        }}
        contentWorkspaceId={null}
        thumbnailUrl={null}
        thumbnailSourceCandidateId="candidate-1"
        selectedRegistrationThumbnailUrl={null}
        thumbnailPreviewImages={['https://cdn.example.com/source.jpg']}
        onPreviewThumbnail={vi.fn()}
        onThumbnailPreviewImagesChange={onThumbnailPreviewImagesChange}
        onSaveThumbnailConfiguration={vi.fn()}
        thumbnailGenerationReturnHref="/product-pipeline/collected-products/candidate-1"
      />,
    );

    expect(screen.getAllByRole('button', { name: /^썸네일 미리보기 이미지 \d+$/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '이미지 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '상품 이미지 2' }));
    fireEvent.click(screen.getByRole('button', { name: '선택 이미지 추가' }));

    expect(onThumbnailPreviewImagesChange).toHaveBeenCalledWith([
      'https://cdn.example.com/source.jpg',
      'https://cdn.example.com/other.jpg',
    ]);
  });
});
