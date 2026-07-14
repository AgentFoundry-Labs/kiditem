import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProductBasicsTab, {
  basicDraftFrom,
  type BasicDraft,
  type SelectedDetailPageSummary,
} from './ProductBasicsTab';
import type { ProductEditState } from '../../../lib/product-workspace-types';
import type { ProductBasics } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';

vi.mock('../detail/TagEditor', () => ({
  default: () => <div data-testid="tag-editor" />,
}));

const editData: ProductEditState = {
  name: '상품 생성 입력명',
  category: '완구 > 보드게임',
  originalPrice: 15900,
  salePrice: 12900,
  discountRate: 19,
  thumbnails: ['https://cdn.example.com/source.jpg'],
  tags: ['자석', '다트'],
  rating: 0,
  reviewCount: 0,
  productInfo: [{ key: 'KC 인증', value: '확인 필요' }],
  features: [{ title: '안전한 자석 다트', description: '아이와 함께 쓰기 좋음' }],
};

const completeBasicInfo: ProductBasics = {
  name: '상품 생성 입력명',
  category: '완구 > 보드게임',
  description: '안전한 자석 다트 상품',
  target: '초등학생',
  ageGroup: 'age-8-plus',
  tags: ['자석', '다트'],
  keywords: [],
  optionNames: ['단품'],
  kcCertificationStatus: 'exists',
  kcCertificationNumber: 'CB061R1234-1001',
  kcCertificationImageUrl: '',
  productSize: '높이: 30cm',
  colorVariantStatus: 'multiple',
  colorVariantNames: '빨강, 파랑',
  boxSetStatus: 'box',
  boxSetQuantity: '1박스',
  originalPrice: 15900,
  salePrice: 12900,
  discountRate: 19,
  rocketBundleQuantity: 0,
  rocketUnitCost: 0,
  thumbnailUrls: ['https://cdn.example.com/source.jpg'],
  selectedThumbnailUrl: 'https://cdn.example.com/selected.jpg',
  selectedThumbnailGenerationId: null,
  selectedThumbnailGenerationCandidateId: null,
  selectedDetailPageGenerationId: 'detail-1',
  selectedDetailPageArtifactId: null,
  selectedDetailPageRevisionId: null,
};

function renderBasics({
  basicInfo = null,
  draft,
  isEditing = false,
  onDraftChange = vi.fn(),
  onDraftTagsChange = vi.fn(),
  selectedRegistrationThumbnailUrl,
  selectedDetailPageGenerationId,
  selectedDetailPageSummary,
}: {
  basicInfo?: ProductBasics | null;
  draft?: BasicDraft;
  isEditing?: boolean;
  onDraftChange?: (field: keyof BasicDraft, value: string) => void;
  onDraftTagsChange?: (tags: string[]) => void;
  selectedRegistrationThumbnailUrl?: string | null;
  selectedDetailPageGenerationId?: string | null;
  selectedDetailPageSummary?: SelectedDetailPageSummary | null;
} = {}) {
  render(
    <ProductBasicsTab
      editData={editData}
      basicInfo={basicInfo}
      nameLength={8}
      isEditing={isEditing}
      draft={draft ?? basicDraftFrom({ basicInfo, editData })}
      onDraftChange={onDraftChange}
      onDraftTagsChange={onDraftTagsChange}
      selectedRegistrationThumbnailUrl={selectedRegistrationThumbnailUrl}
      selectedDetailPageGenerationId={selectedDetailPageGenerationId}
      selectedDetailPageSummary={selectedDetailPageSummary}
    />,
  );

  return { onDraftChange, onDraftTagsChange };
}

describe('ProductBasicsTab', () => {
  it('shows one shared basic-information view for any workspace entry point', () => {
    renderBasics({
      basicInfo: completeBasicInfo,
      selectedRegistrationThumbnailUrl: 'https://cdn.example.com/selected.jpg',
      selectedDetailPageGenerationId: 'detail-1',
      selectedDetailPageSummary: {
        id: 'detail-1',
        title: 'Codex QA 상세페이지 버전 1',
        templateLabel: 'KIDITEM DESIGN',
        createdAt: '2026-05-17T06:05:56.000Z',
        status: 'COMPLETED',
      },
    });

    expect(screen.getByText('상품 정보')).toBeInTheDocument();
    expect(screen.getByText('등록 콘텐츠')).toBeInTheDocument();
    expect(screen.getByText('등록 대표 썸네일')).toBeInTheDocument();
    expect(screen.getByAltText('등록 대표 썸네일')).toHaveAttribute('src', 'https://cdn.example.com/selected.jpg');
    expect(screen.getByText('등록 상세페이지')).toBeInTheDocument();
    expect(screen.getByText('등록 상세')).toBeInTheDocument();
    expect(screen.getByText('KIDITEM DESIGN')).toBeInTheDocument();
    expect(screen.getByText('Codex QA 상세페이지 버전 1')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByText('옵션과 검색 정보')).toBeInTheDocument();
    expect(screen.getByText('상품 생성 입력명')).toBeInTheDocument();
    expect(screen.getByText('완구 > 보드게임')).toBeInTheDocument();
    expect(screen.getByText('주요 타겟')).toBeInTheDocument();
    expect(screen.getByText('초등학생')).toBeInTheDocument();
    expect(screen.getAllByText('KC 인증').length).toBeGreaterThan(0);
    expect(screen.getByText('있음')).toBeInTheDocument();
    expect(screen.getByText('CB061R1234-1001')).toBeInTheDocument();
    expect(screen.queryByLabelText('상품명')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.queryByText('수집 상태')).not.toBeInTheDocument();
    expect(screen.queryByText('등록 상태')).not.toBeInTheDocument();
  });

  it('keeps the basic tab focused on product information instead of generation prompts', () => {
    renderBasics({
      selectedRegistrationThumbnailUrl: null,
      selectedDetailPageGenerationId: null,
    });

    expect(screen.queryByText('템플릿')).not.toBeInTheDocument();
    expect(screen.queryByText('DETAIL 이미지 수')).not.toBeInTheDocument();
    expect(screen.queryByText('사용법 영역')).not.toBeInTheDocument();
    expect(screen.getByText('상품 속성')).toBeInTheDocument();
    expect(screen.getByText('등록 콘텐츠')).toBeInTheDocument();
    expect(screen.getAllByText('미입력').length).toBeGreaterThan(0);
    expect(screen.getByText('대표 썸네일 미선택')).toBeInTheDocument();
    expect(screen.getByText('상세페이지 미선택')).toBeInTheDocument();
  });

  it('renders edit fields only when the parent basic screen enters edit mode', () => {
    renderBasics({ isEditing: true });

    expect(screen.getByLabelText('상품명')).toHaveValue('상품 생성 입력명');
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
  });

  it('renders numbered product descriptions on separate lines', () => {
    renderBasics({
      basicInfo: {
        ...completeBasicInfo,
        description: '1. 오감 발달을 돕는 촉감 2. 창의적인 DIY 미술놀이 3. 안전한 어린이용 왁스',
      },
    });

    expect(screen.getByText('1. 오감 발달을 돕는 촉감')).toBeInTheDocument();
    expect(screen.getByText('2. 창의적인 DIY 미술놀이')).toBeInTheDocument();
    expect(screen.getByText('3. 안전한 어린이용 왁스')).toBeInTheDocument();
  });

  it('reports visible product fact edits to the parent draft controller', () => {
    const onDraftChange = vi.fn();

    renderBasics({
      basicInfo: completeBasicInfo,
      isEditing: true,
      onDraftChange,
    });

    fireEvent.change(screen.getByLabelText('상품 설명'), { target: { value: '수정 설명' } });
    fireEvent.change(screen.getByLabelText('주요 타겟'), { target: { value: '부모 구매자' } });
    fireEvent.change(screen.getByLabelText('사용 연령'), { target: { value: 'age-14-plus' } });
    fireEvent.change(screen.getByLabelText('KC 인증 상태'), { target: { value: 'exists' } });
    fireEvent.change(screen.getByLabelText('KC 인증번호'), { target: { value: 'CB061R9999-2605' } });
    fireEvent.change(screen.getByLabelText('판매가'), { target: { value: '13900' } });
    fireEvent.change(screen.getByLabelText('옵션명'), { target: { value: '단품, 2개 세트' } });
    fireEvent.change(screen.getByLabelText('검색 키워드'), { target: { value: '자석완구, 다트게임' } });

    expect(onDraftChange).toHaveBeenCalledWith('description', '수정 설명');
    expect(onDraftChange).toHaveBeenCalledWith('target', '부모 구매자');
    expect(onDraftChange).toHaveBeenCalledWith('ageGroup', 'age-14-plus');
    expect(onDraftChange).toHaveBeenCalledWith('kcCertificationStatus', 'exists');
    expect(onDraftChange).toHaveBeenCalledWith('kcCertificationNumber', 'CB061R9999-2605');
    expect(onDraftChange).toHaveBeenCalledWith('salePrice', '13900');
    expect(onDraftChange).toHaveBeenCalledWith('optionNames', '단품, 2개 세트');
    expect(onDraftChange).toHaveBeenCalledWith('keywords', '자석완구, 다트게임');
  });
});
