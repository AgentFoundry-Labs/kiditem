import { prepareRegistration } from '../sales-product-registration';
import {
  fillMallRegistrationForm,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  SMARTSTORE_BRAND_NAME,
  SMARTSTORE_DEFAULT_CATEGORY,
  parseSmartstoreCategory,
  smartstoreFormFromDraft,
  smartstorePricing,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/smartstore-registration-form';
import { formatNumber } from '@/lib/utils';
import { listPriceProblem, registrationOutcome } from '../mall-publish-adapter';
import type {
  MallFieldSpec,
  MallPreviewRow,
  MallPublishAdapter,
  MallSendInput,
  MallSendOutcome,
} from '../mall-publish-adapter';

/**
 * 네이버 스마트스토어센터 어댑터(`sell.smartstore.naver.com`).
 *
 * 실측 2026-09-14. 규칙은 폼 빌더(`smartstore-registration-form.ts`)에 적었다. 화면은 AngularJS 한
 * 페이지라 확장의 전용 채움 함수가 사람 순서대로 칸을 채운다. [저장하기] 는 사람이 누른다.
 */

const CATEGORY_DEFAULT = `${SMARTSTORE_DEFAULT_CATEGORY.id}:${SMARTSTORE_DEFAULT_CATEGORY.keyword}`;

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'quantity',
    label: '수량',
    origin: 'override',
    control: 'text',
    defaultValue: '1',
    required: true,
    help: '상품명에 `1p` 형태로 붙습니다.',
  },
  {
    key: 'smartstoreCategory',
    label: '스마트스토어 카테고리',
    origin: 'override',
    control: 'text',
    defaultValue: CATEGORY_DEFAULT,
    required: false,
    help: `카테고리 \`번호:마지막 단 이름\`. 기본은 기존 등록물과 같은 ${SMARTSTORE_DEFAULT_CATEGORY.label} 입니다.`,
  },
  {
    key: 'certNumber',
    label: '안전인증번호',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    shared: true,
    help: '있으면 어린이제품인증(안전확인)을 채웁니다. 여러 몰이 같은 값을 씁니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/** 칸이 비었으면 기본값, 적었는데 모양이 틀리면 `null`(막는다). */
function categoryFrom(raw: string | undefined) {
  const text = (raw ?? '').trim();
  if (!text) return SMARTSTORE_DEFAULT_CATEGORY;
  return parseSmartstoreCategory(text);
}

export const smartstoreAdapter: MallPublishAdapter = {
  mallKey: 'smartstore',
  mallName: '스마트스토어',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const pricing = smartstorePricing([item.name], item.salePrice ?? 0);
    const category = categoryFrom(values.smartstoreCategory);
    const cert = values.certNumber?.trim();
    return [
      {
        label: '상품명',
        value: `${item.name.replace(/^\d{3,}(?=\S)/, '')} ${parsePositive(values.quantity, 1)}p + 키워드 (브랜드 ${SMARTSTORE_BRAND_NAME})`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '판매가 / 즉시할인',
        value: pricing.salePrice <= 0
          ? '상세에서 확인'
          : pricing.discountWon > 0
            ? `${formatNumber(pricing.salePrice)}원 − ${formatNumber(pricing.discountWon)}원 = ${formatNumber(pricing.salePrice - pricing.discountWon)}원`
            : `${formatNumber(pricing.salePrice)}원 (할인 없음)`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '카테고리',
        value: category?.label ?? '형식 확인 필요',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '인증 · 고시',
        value: cert ? `어린이제품 안전확인 ${cert} · 고시 기타 재화` : '인증 비움(사람이 입력) · 고시 기타 재화',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '원산지 · 태그',
        value: '수입(중국) · 거영아이앤디 · 키워드 태그 최대 10개',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '이미지 · 상세설명',
        value: '대표 1장 + 추가 최대 9장 · 상세 이미지 한 장(네이버 사진 서버에 올려 HTML 로 넣음)',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '저장',
        value: '배송·반품·A/S 는 계정 기본값 · 확인 뒤 사람이 직접 [저장하기]',
        origin: 'template',
        mallSpecific: true,
      },
    ];
  },

  validate(item, values): string[] {
    const problems: string[] = [];
    if (!item.name.trim()) problems.push('상품명이 비어 있습니다.');
    const price = listPriceProblem(item.salePrice);
    if (price) problems.push(price);
    if (parsePositive(values.quantity, 0) <= 0) problems.push('수량은 1 이상이어야 합니다.');
    if (!categoryFrom(values.smartstoreCategory)) {
      problems.push('스마트스토어 카테고리는 `번호:이름` 이어야 합니다(예: 50004643:기타감각발달완구).');
    }
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const category = categoryFrom(values.smartstoreCategory);
    if (!category) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '스마트스토어 카테고리 형식이 틀렸습니다.' };
    }
    const { draft } = await prepareRegistration(item, 'smartstore');
    const certNumber = values.certNumber?.trim();
    const form = smartstoreFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      category,
      ...(certNumber ? { certNumber } : {}),
    });
    // [등록]까지 부탁한다(ADR-0015). 확장이 이 몰의 누르기를 확인하지 않았으면 폼만 채우고 사람에게 남긴다.
    const result = await fillMallRegistrationForm('smartstore', draft, form, { submit: true });
    return registrationOutcome(result);
  },
};
