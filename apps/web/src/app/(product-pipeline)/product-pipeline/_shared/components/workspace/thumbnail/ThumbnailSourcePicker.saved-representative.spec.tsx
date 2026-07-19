import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ThumbnailSourcePicker from './ThumbnailSourcePicker';

/**
 * `등록 대표` 배지는 **실제로 저장된 대표**에만 붙어야 한다.
 *
 * 회귀 배경: `ProductWorkspaceScreen` 이 편집용 선택값(`selectedRegistrationThumbnailUrl`)을
 * 배지 근거로 그대로 넘기고 있었고, 그 값은 저장된 대표가 없으면 첫 썸네일로 폴백했다.
 * 그래서 **한 번도 저장한 적 없는 이미지에 `등록 대표` 가 붙었고**, 사용자는 지정이 끝난
 * 줄 알았지만 DB(`ProductPreparation.selectedThumbnailUrl` /
 * `content_workspace_thumbnail_selections`)에는 아무것도 없어 쿠팡 WING 추가이미지가
 * 계속 0/9 로 비었다.
 */
describe('ThumbnailSourcePicker — 등록 대표 배지', () => {
  const urls = ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'];

  const renderPicker = (savedRepresentativeUrl: string | null) =>
    render(
      <ThumbnailSourcePicker
        thumbnailUrls={urls}
        availableOptions={[]}
        selectedUrl={urls[0]}
        savedRepresentativeUrl={savedRepresentativeUrl}
        onSelect={vi.fn()}
        onEditSelectedImage={vi.fn()}
        onSaveConfiguration={vi.fn()}
        onRegisterRepresentative={vi.fn()}
        onAddImages={vi.fn()}
        onRemoveImage={vi.fn()}
        onReorderImages={vi.fn()}
        onUploadImages={vi.fn()}
      />,
    );

  it('저장된 대표가 없으면 어떤 썸네일에도 배지를 붙이지 않는다', () => {
    renderPicker(null);
    // 선택돼 있어도(selectedUrl=urls[0]) 저장 전이면 배지는 없어야 한다.
    expect(screen.queryByText('등록 대표')).not.toBeInTheDocument();
    expect(screen.getByText('이미지 1')).toBeInTheDocument();
    expect(screen.getByText('이미지 2')).toBeInTheDocument();
  });

  it('저장된 대표와 일치하는 썸네일에만 배지를 붙인다', () => {
    renderPicker(urls[1]);
    // `등록 대표` 는 타일과 상단 대표 패널 양쪽에 나오므로 존재 여부만 본다.
    expect(screen.getAllByText('등록 대표').length).toBeGreaterThan(0);
    // 핵심 단언: 대표가 된 2번 타일은 순번 라벨을 잃고, 1번은 그대로 유지된다.
    expect(screen.getByText('이미지 1')).toBeInTheDocument();
    expect(screen.queryByText('이미지 2')).not.toBeInTheDocument();
  });

  it('저장된 대표가 현재 목록에 없으면 배지를 붙이지 않는다', () => {
    renderPicker('https://cdn.example.com/removed.jpg');
    expect(screen.queryByText('등록 대표')).not.toBeInTheDocument();
  });
});
