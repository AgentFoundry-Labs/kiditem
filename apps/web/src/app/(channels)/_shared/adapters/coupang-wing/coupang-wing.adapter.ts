import { salesProductApi } from '@/lib/sales-product-api';
import { formatNumber } from '@/lib/utils';
import { renderRegistrationDetailImage } from '../../../../(product-pipeline)/product-pipeline/collected-products/lib/detail-page-image-api';
import { listPriceProblem, publishItemSalesProductId } from '../../mall-publish-adapter';
import type {
  MallConfirmationSpec,
  MallFieldSpec,
  MallPreviewRow,
  MallPublishAdapter,
  MallFormInput,
  MallRegistrationForm,
} from '../../mall-publish-adapter';
import { getWingCategoryDefinition, WING_CATEGORY_DEFINITIONS } from './wing-category-presets';
import { translateWingError } from './wing-error-message';
import {
  defaultWingMallValues,
  resolveWingCategoryDefault,
  salesProductToWingProduct,
  validateWingMallValues,
  validateWingProduct,
  WING_DISPLAY_NAME_MAX,
  wingTargetInput,
} from './wing-product';
import { WING_PRODUCT_DRAFT_DEFAULTS } from './wing-registration-excel';

/**
 * 쿠팡 WING 어댑터(KID-321). 쿠팡도 몰 하나다 — 등록은 다른 폼 몰과 같은 등록 실행(`channels.registration`)이고,
 * 이 어댑터는 폼 지시(`{ product }`)만 만든다. 여기에는 WING 만의 사실만 있다:
 *
 *  - 몰에 닿는 방식은 레지스트리 `delivery: form` — 확장 몰 쓰기 모듈이 WING formV2 를 채운다. [상품등록]은 확장의
 *    관문 한 곳이 정한다(ADR-0019). 판매자 ID 대조는 서버 plan의 `expectedProviderAccountId` 한 규칙이다.
 *  - WING 값(카테고리 · 노출상품명 · 등록상품명 · 구매옵션 · 재고)은 확인 창에서 받고 등록 대상의 쿠팡 값으로
 *    저장한다. 서버 plan(쿠팡 채널 어댑터)이 그 값과 셀피아 매칭 · 업체상품코드 · 대표이미지를 폼 위에 얼리고, 이미
 *    같은 상품이 있는 계정이면 시작을 거절한다.
 *  - 상세설명은 등록 대상이 고른 상세 revision 을 서버가 780px 긴 이미지 한 장으로 렌더한 것이다.
 *  - 완료 안내에서 본 등록상품ID와 WING 판매자 ID가 확인 증거다. 맞는지는 서버가 판정한다.
 *
 * 일괄등록 엑셀은 이 어댑터의 파일 경로(`wing-excel-export.ts`)다 — 등록 실행을 열지 않는다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'wingCategoryKey',
    label: 'WING 카테고리',
    origin: 'override',
    control: 'select',
    options: [
      { value: '', label: '카테고리를 선택하세요' },
      ...WING_CATEGORY_DEFINITIONS.map((definition) => ({ value: definition.key, label: definition.categoryCell })),
    ],
    defaultValue: '',
    required: true,
    help: 'KidItem 고정 카테고리입니다. 카테고리에 필요한 구매옵션은 등록 확인에서 받습니다.',
  },
  {
    key: 'brand',
    label: '브랜드',
    origin: 'template',
    control: 'text',
    defaultValue: WING_PRODUCT_DRAFT_DEFAULTS.defaultBrand,
    required: true,
    help: '단일 등록은 확장이 `브랜드없음(또는 자체제작)` 을 체크하고, 엑셀 양식은 이 값을 넣는다.',
  },
  {
    key: 'maker',
    label: '제조사',
    origin: 'template',
    control: 'text',
    defaultValue: WING_PRODUCT_DRAFT_DEFAULTS.defaultMaker,
    required: true,
  },
];

/** 확인 창의 상품별 WING 값. 가격은 여기서 받지 않는다 — 판매상품의 확정 판매가가 정본이다. */
const CONFIRMATION_FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'productName',
    label: '노출상품명',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: true,
    help: `구매자에게 보이는 이름입니다(${WING_DISPLAY_NAME_MAX}자 이하).`,
  },
  {
    key: 'sellerProductName',
    label: '등록상품명 (판매자관리용)',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: true,
    help: '쿠팡 내부 조회용 이름입니다. 구매자에게 보이지 않습니다.',
  },
  { key: 'colorValue', label: '옵션 · 색상', origin: 'override', control: 'text', defaultValue: '', required: false },
  { key: 'quantityValue', label: '옵션 · 수량', origin: 'override', control: 'text', defaultValue: '', required: false },
  {
    key: 'unitWeightValue',
    label: '옵션 · 개당 중량 (g)',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '슬라임처럼 이 값을 요구하는 카테고리에서만 필수입니다.',
  },
  { key: 'stock', label: '재고수량', origin: 'override', control: 'text', defaultValue: '999', required: true },
];

const DETAIL_PAGE_REQUIRED = '저장한 상세페이지가 있는 상품만 쿠팡 WING 에 올립니다.';

function evidenceNotes(evidence: Awaited<ReturnType<typeof resolveWingCategoryDefault>>['evidence']): string[] {
  if (!evidence) return [];
  const head = evidence.applied
    ? '기존 등록상품과 비슷해 카테고리를 자동으로 골랐습니다 — 맞는지 확인해 주세요'
    : '추천 신뢰도가 낮아 카테고리를 자동으로 고르지 않았습니다';
  return [
    `${head} (유사도 ${Math.round(evidence.score * 100)}%): ${evidence.path}`,
    ...(evidence.basedOn.length > 0 ? [`근거: ${evidence.basedOn.join(', ')}`] : []),
  ];
}

const confirmation: MallConfirmationSpec = {
  fields: CONFIRMATION_FIELDS,
  sellpiaMatch: true,
  async loadDefaults({ salesProductId, savedInputs }) {
    const product = await salesProductApi.get(salesProductId);
    const saved = savedInputs.find((input) => typeof input.wingCategoryKey === 'string') ?? savedInputs[0] ?? null;
    const category = await resolveWingCategoryDefault(
      product,
      typeof saved?.wingCategoryKey === 'string' ? saved.wingCategoryKey : null,
    );
    return {
      values: defaultWingMallValues(product, category.key, saved),
      notes: evidenceNotes(category.evidence),
    };
  },
  validate: validateWingMallValues,
};

/** 판매상품 + 확인 창 값 → WING 폼 지시. 상세는 등록 대상이 고른 revision을 서버가 한 장으로 렌더한 것. */
async function buildForm({ item, values }: MallFormInput): Promise<MallRegistrationForm> {
  const salesProduct = await salesProductApi.get(publishItemSalesProductId(item));
  const wing = salesProductToWingProduct(salesProduct, values);
  const problems = validateWingProduct(wing);
  if (problems.length > 0) throw new Error(problems.join(' '));
  const rendered = await renderRegistrationDetailImage({
    salesProductId: salesProduct.id,
    detailPageRevisionId: item.detailPageRevisionId ?? null,
  });
  if (rendered.status !== 'ready') {
    const reason = rendered.status === 'missing' ? rendered.message : '상세페이지 이미지 생성이 끝나지 않았습니다.';
    throw new Error(`${reason} ${DETAIL_PAGE_REQUIRED}`);
  }
  return { product: { ...wing, detailImageUrls: [rendered.imageUrl] } };
}

export const coupangWingAdapter: MallPublishAdapter = {
  mallKey: 'coupang',
  mallName: '쿠팡 WING',
  // 레지스트리 `delivery: form` 과 같다(spec 이 잠근다).
  mode: 'form',
  acceptsSalesProducts: true,
  supportsOptions: false,
  batchSize: 1,
  // 등록 실행의 `submit`이면 확장 관문이 [상품등록]까지 누를 수 있다(WING spec만 제출이 검증돼 있다).
  requiresOperatorSubmit: false,
  fields: FIELDS,
  confirmation,
  adapterTargetInput: wingTargetInput,
  describeError: translateWingError,

  preview(item, values): MallPreviewRow[] {
    const category = getWingCategoryDefinition(values.wingCategoryKey ?? '');
    return [
      {
        label: '노출상품명',
        value: values.productName?.trim() || `${item.name} + 키워드`,
        origin: values.productName?.trim() ? 'override' : 'master',
        mallSpecific: true,
      },
      {
        label: '판매가',
        value: item.salePrice && item.salePrice > 0 ? `${formatNumber(item.salePrice)}원` : '판매상품에서 정함',
        origin: 'master',
        mallSpecific: false,
      },
      {
        label: 'WING 카테고리',
        value: category?.categoryCell ?? '등록 확인에서 고름',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '상품정보고시',
        value: `${WING_PRODUCT_DRAFT_DEFAULTS.noticeCategory} · 7칸`,
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '상세설명',
        value: '저장한 상세페이지를 780px 이미지 한 장으로',
        origin: 'master',
        mallSpecific: true,
      },
    ];
  },

  validate(item, values): string[] {
    return [
      ...(item.name.trim() ? [] : ['상품명이 비어 있습니다.']),
      ...[listPriceProblem(item.salePrice)].filter((problem): problem is string => Boolean(problem)),
    ];
  },

  buildForm,
};
