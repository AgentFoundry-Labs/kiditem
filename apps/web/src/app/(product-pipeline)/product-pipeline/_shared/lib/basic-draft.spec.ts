import { describe, expect, it } from 'vitest';
import type { ProductBasics } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import { basicDraftFrom, productBasicsInputFromDraft } from './basic-draft';
import type { ProductEditState } from './product-workspace-types';

const editData = {
  name: '',
  category: '',
  tags: [] as string[],
  salePrice: 0,
  originalPrice: 0,
  discountRate: 0,
} as unknown as ProductEditState;

const basicsWith = (patch: Partial<ProductBasics>): ProductBasics =>
  ({
    name: '상품',
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
    salePrice: 0,
    discountRate: 0,
    rocketBundleQuantity: 0,
    rocketUnitCost: 0,
    thumbnailUrls: [],
    selectedThumbnailUrl: null,
    selectedThumbnailGenerationId: null,
    selectedThumbnailGenerationCandidateId: null,
    ...patch,
  }) as ProductBasics;

describe('productBasicsInputFromDraft salePrice', () => {
  it('손대지 않은 셀피아 폴백은 저장 payload 에 싣지 않는다', () => {
    const basicInfo = basicsWith({ salePrice: 4000, salePriceSource: 'sellpia' });
    const draft = basicDraftFrom({ basicInfo, editData });

    const input = productBasicsInputFromDraft(draft, basicInfo);

    expect(draft.salePrice).toBe('4000'); // 화면에는 그대로 보인다
    expect('salePrice' in input).toBe(false); // 그러나 저장하지는 않는다
  });

  it('사용자가 셀피아 폴백값을 고치면 그 값을 저장한다', () => {
    const basicInfo = basicsWith({ salePrice: 4000, salePriceSource: 'sellpia' });
    const draft = { ...basicDraftFrom({ basicInfo, editData }), salePrice: '5500' };

    expect(productBasicsInputFromDraft(draft, basicInfo).salePrice).toBe(5500);
  });

  it('수기 입력값은 손대지 않아도 그대로 다시 저장한다', () => {
    const basicInfo = basicsWith({ salePrice: 4000, salePriceSource: 'input' });
    const draft = basicDraftFrom({ basicInfo, editData });

    expect(productBasicsInputFromDraft(draft, basicInfo).salePrice).toBe(4000);
  });

  it('하이드레이션 정보를 넘기지 않으면 기존대로 항상 싣는다', () => {
    const basicInfo = basicsWith({ salePrice: 4000, salePriceSource: 'sellpia' });
    const draft = basicDraftFrom({ basicInfo, editData });

    expect(productBasicsInputFromDraft(draft).salePrice).toBe(4000);
  });
});
