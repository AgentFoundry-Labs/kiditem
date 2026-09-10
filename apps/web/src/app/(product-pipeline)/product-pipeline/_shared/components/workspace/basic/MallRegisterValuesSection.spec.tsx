import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  FORM_MALL_ADAPTERS,
  SHARED_MALL_FIELDS,
} from '@/app/(channels)/_shared/mall-register-values';
import type { ProductBasics } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import { MallRegisterValuesSection } from './MallRegisterValuesSection';

// 분류 칸이 마운트되며 몰 목록을 읽는다. 이 테스트의 관심사가 아니다.
vi.mock('../../../lib/mall-category-api', () => ({
  listMallCategories: vi.fn().mockResolvedValue([]),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * 상품 상세의 몰 등록 정보.
 *
 * 지키는 것 셋 —
 *  1. **화면은 몰을 모른다.** 줄도 칸도 어댑터 선언에서 나온다.
 *  2. **저장은 사람이 고친 값만.** 기본값까지 저장하면 어댑터가 기본값을 고쳐도
 *     저장한 상품 전부가 옛 값에 묶인다.
 *  3. **못 보내는 몰은 그 자리에서 이유를 말한다.**
 */
describe('MallRegisterValuesSection', () => {
  const basics = (overrides: Partial<ProductBasics> = {}): ProductBasics => ({
    name: '할로윈 LED 거미줄',
    category: '',
    description: '',
    target: '',
    ageGroup: '',
    tags: [],
    keywords: [],
    optionNames: [],
    kcCertificationStatus: '',
    kcCertificationNumber: '',
    kcCertificationImageUrl: '',
    productSize: '',
    colorVariantStatus: '',
    colorVariantNames: '',
    boxSetStatus: '',
    boxSetQuantity: '',
    originalPrice: 0,
    salePrice: 3500,
    discountRate: 0,
    rocketBundleQuantity: 0,
    rocketUnitCost: 0,
    thumbnailUrls: [],
    selectedThumbnailUrl: null,
    selectedThumbnailGenerationId: null,
    selectedThumbnailGenerationCandidateId: null,
    selectedDetailPageGenerationId: null,
    selectedDetailPageArtifactId: null,
    selectedDetailPageRevisionId: null,
    ...overrides,
  });

  function renderSection(overrides: Partial<Parameters<typeof MallRegisterValuesSection>[0]> = {}) {
    const props = {
      basicInfo: basics(),
      onCommit: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    render(<MallRegisterValuesSection {...props} />);
    return props;
  }

  it('폼 방식 몰마다 줄이 하나씩 선다', () => {
    renderSection();
    for (const adapter of FORM_MALL_ADAPTERS) {
      expect(screen.getByText(adapter.mallName)).toBeInTheDocument();
    }
  });

  it('공통 칸은 위에 한 번만 선다', () => {
    // 안전인증번호는 상품에 하나뿐이다. 몰마다 받으면 서로 다르게 적힌다.
    renderSection();
    expect(SHARED_MALL_FIELDS.length).toBeGreaterThan(0);
    for (const field of SHARED_MALL_FIELDS) {
      expect(screen.getAllByLabelText(field.label)).toHaveLength(1);
    }
  });

  it('몰 고정값은 사람에게 묻지 않는다', () => {
    renderSection();
    for (const adapter of FORM_MALL_ADAPTERS) {
      for (const field of adapter.fields.filter((entry) => entry.origin === 'template')) {
        expect(screen.queryByLabelText(field.label)).not.toBeInTheDocument();
      }
    }
  });

  it('저장한 값을 되읽어 칸에 채운다', () => {
    renderSection({
      basicInfo: basics({
        mallRegisterValues: { '11st': { categoryPath: '문구/사무용품>디자인/팬시용품>기능성 팬시' } },
      }),
    });
    expect(screen.getByLabelText('11번가 분류')).toHaveValue('문구/사무용품>디자인/팬시용품>기능성 팬시');
  });

  it('안 고쳤으면 저장 버튼이 잠긴다', () => {
    renderSection();
    expect(screen.getByRole('button', { name: '저장됨' })).toBeDisabled();
  });

  it('사람이 고친 값만 저장한다 — 어댑터 기본값은 담지 않는다', async () => {
    const props = renderSection();
    fireEvent.change(screen.getByLabelText('11번가 분류'), {
      target: { value: '문구/사무용품>디자인/팬시용품>기능성 팬시' },
    });
    fireEvent.click(screen.getByRole('button', { name: '몰 등록 정보 저장' }));

    await waitFor(() => expect(props.onCommit).toHaveBeenCalled());
    expect(props.onCommit).toHaveBeenCalledWith({
      mallRegisterValues: { '11st': { categoryPath: '문구/사무용품>디자인/팬시용품>기능성 팬시' } },
      mallRegisterShared: {},
    });
  });

  it('공통 값은 따로 담아 저장한다', async () => {
    const props = renderSection();
    const field = SHARED_MALL_FIELDS[0]!;
    fireEvent.change(screen.getByLabelText(field.label), { target: { value: 'CB065R1579-2008' } });
    fireEvent.click(screen.getByRole('button', { name: '몰 등록 정보 저장' }));

    await waitFor(() => expect(props.onCommit).toHaveBeenCalled());
    expect(props.onCommit.mock.calls[0]![0].mallRegisterShared)
      .toEqual({ [field.key]: 'CB065R1579-2008' });
  });

  it('값이 빠진 몰은 값 필요로 표시하고 이유를 말한다', () => {
    renderSection();
    // 11번가 분류는 등록 후 바꾸기 어려워 어댑터가 필수로 막는다.
    expect(screen.getAllByText('값 필요').length).toBeGreaterThan(0);
    expect(screen.getByText(/분류를 입력하세요/)).toBeInTheDocument();
    expect(screen.getByText(/개 몰이 아직 등록할 수 없습니다/)).toBeInTheDocument();
  });

  it('값을 채우면 등록 준비됨으로 바뀐다', () => {
    // 우리 데이터에 없어 사람이 정해야 하는 값 둘 — 11번가 분류와 올웨이즈 팀구매가.
    renderSection({
      basicInfo: basics({
        mallRegisterValues: {
          '11st': { categoryPath: '문구/사무용품>디자인/팬시용품>기능성 팬시' },
          always: { teamPrice: '1800' },
        },
      }),
    });
    expect(screen.getAllByText('등록 준비됨')).toHaveLength(FORM_MALL_ADAPTERS.length);
    expect(screen.queryByText(/개 몰이 아직 등록할 수 없습니다/)).not.toBeInTheDocument();
  });

  it('읽기 전용이면 저장 버튼도 칸도 잠근다', () => {
    renderSection({ readOnly: true });
    expect(screen.queryByRole('button', { name: /저장/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('11번가 분류')).toBeDisabled();
  });

  it('등록 버튼은 언제나 사람이 누른다고 알린다', () => {
    renderSection();
    expect(screen.getByText(/등록 버튼은 언제나 사람이 몰 화면에서 누릅니다/)).toBeInTheDocument();
  });
});
