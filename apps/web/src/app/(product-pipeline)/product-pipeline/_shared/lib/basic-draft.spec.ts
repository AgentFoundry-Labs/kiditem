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
  it('saves the reviewed operator price', () => {
    const basicInfo = basicsWith({ salePrice: 4000, salePriceSource: 'input' });
    const draft = { ...basicDraftFrom({ basicInfo, editData }), salePrice: '5500' };
    expect(productBasicsInputFromDraft(draft).salePrice).toBe(5500);
  });
  it('preserves an unchanged input price', () => {
    const draft = basicDraftFrom({ basicInfo: basicsWith({ salePrice: 4000, salePriceSource: 'input' }), editData });
    expect(productBasicsInputFromDraft(draft).salePrice).toBe(4000);
  });
  it('does not invent a price for an empty form', () => {
    const draft = basicDraftFrom({ basicInfo: basicsWith({ salePrice: 0, salePriceSource: 'none' }), editData });
    expect(productBasicsInputFromDraft(draft).salePrice).toBe(0);
  });
});
