import { salesProductApi } from '@/lib/sales-product-api';
import { formatNumber } from '@/lib/utils';
import { renderRegistrationDetailImage } from '../../../../(product-pipeline)/product-pipeline/collected-products/lib/detail-page-image-api';
import {
  listPriceProblem,
  mallFormExecutionOptions,
  publishItemSalesProductId,
} from '../../mall-publish-adapter';
import type {
  MallConfirmationSpec,
  MallFieldSpec,
  MallPreviewRow,
  MallPublishAdapter,
  MallPublishItem,
  MallSendChannelAccount,
  MallSendInput,
  MallSendOutcome,
} from '../../mall-publish-adapter';
import { getWingCategoryDefinition, WING_CATEGORY_DEFINITIONS } from './wing-category-presets';
import { translateWingError } from './wing-error-message';
import { sendWingForm, WingFormNotReachedError, wingFormOutcome } from './wing-form';
import {
  defaultWingMallValues,
  resolveWingCategoryDefault,
  salesProductToWingProduct,
  validateWingMallValues,
  validateWingProduct,
  WING_DISPLAY_NAME_MAX,
  wingProductForExecution,
  wingTargetInput,
} from './wing-product';
import { WING_PRODUCT_DRAFT_DEFAULTS } from './wing-registration-excel';

/**
 * 쿠팡 WING 어댑터(KID-321). 쿠팡도 몰 하나다 — 등록은 다른 폼 몰과 같은 등록 대상 실행(준비 → 시작 → 이
 * 어댑터의 `send` → 결과)을 지나고, 여기에는 WING 만의 사실만 있다:
 *
 *  - 몰에 닿는 방식은 레지스트리 `delivery: form` — 확장이 WING formV2 를 채운다. [상품등록]은 실행 컨텍스트가
 *    있을 때만 누른다(`mallFormExecutionOptions`, KID-322). 실행 없이 부르면 폼만 채운다.
 *  - WING 값(카테고리 · 노출상품명 · 등록상품명 · 구매옵션 · 재고)은 확인 창에서 받고 등록 대상의 쿠팡 값으로
 *    저장한다. 준비 때 서버 쿠팡 어댑터가 그 값과 셀피아 매칭 · 업체상품코드를 `adapterPayload` 에 얼린다.
 *  - 상세설명은 실행이 얼린 상세 revision 을 서버가 780px 긴 이미지 한 장으로 렌더한 것이다.
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

const DETAIL_PAGE_REQUIRED = '상세페이지가 없습니다. 저장한 상세페이지가 있는 상품만 쿠팡 WING 에 올립니다.';

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

/** 계정 행의 WING 판매자 ID. 옛 행은 외부 계정 ID 로 대신한다(서버 쿠팡 어댑터와 같은 규칙). */
function accountVendorId(account: MallSendChannelAccount | undefined): string | null {
  return account?.vendorId?.trim() || account?.externalAccountId?.trim() || null;
}

function notSubmitted(error: string): MallSendOutcome {
  return { ok: false, confirmed: false, submitted: false, manualSteps: [], warnings: [], error };
}

function existingListing(item: MallPublishItem): { externalListingId: string } | null {
  const existing = item.targetExecution?.snapshot.adapterPayload.existingChannelListing;
  if (!existing || typeof existing !== 'object') return null;
  const externalListingId = (existing as Record<string, unknown>).externalListingId;
  return typeof externalListingId === 'string' && externalListingId.trim() ? { externalListingId } : null;
}

async function send({ items, values, channelAccount }: MallSendInput): Promise<MallSendOutcome> {
  const [item] = items;
  if (!item) return notSubmitted('보낼 상품이 없습니다.');
  const execution = item.targetExecution;

  // 같은 셀피아 코드의 상품이 이 계정에 이미 있으면 WING 을 열지 않는다 — 한 번 더 올리면 중복 리스팅이다.
  // 그 상품으로 확인하려면 등록 확인에서 등록상품ID 와 판매자 ID 를 넣는다(증거 없는 확인은 없다, ADR-0014).
  const existing = existingListing(item);
  if (existing) {
    return {
      ok: false,
      confirmed: false,
      manualSteps: [`등록 확인에서 등록상품ID ${existing.externalListingId} 와 판매자 ID 로 이 실행을 확인하세요.`],
      warnings: [],
      error: `이 계정에 같은 셀피아 코드로 올라간 상품(등록상품ID ${existing.externalListingId})이 이미 있어 WING 폼을 열지 않았습니다.`,
    };
  }

  let product;
  try {
    const salesProduct = execution ? execution.snapshot.product : await salesProductApi.get(publishItemSalesProductId(item));
    const wing = execution
      ? wingProductForExecution(execution.snapshot, values)
      : salesProductToWingProduct(salesProduct, values);
    const problems = validateWingProduct(wing);
    if (problems.length > 0) return notSubmitted(problems.join(' '));
    const rendered = await renderRegistrationDetailImage({
      salesProductId: salesProduct.id,
      detailPageRevisionId: execution?.snapshot.detailPage?.revisionId ?? null,
    });
    if (rendered.status !== 'ready') {
      const reason = rendered.status === 'missing' ? rendered.message : '상세페이지 이미지 생성이 끝나지 않았습니다.';
      return notSubmitted(`${reason} 저장한 상세페이지가 있는 상품만 쿠팡 WING 에 올립니다.`);
    }
    product = { ...wing, detailImageUrls: [rendered.imageUrl] };
  } catch (error) {
    return notSubmitted(error instanceof Error ? error.message : String(error));
  }

  const expectedVendorId = execution ? execution.expectedProviderAccountId?.trim() || null : accountVendorId(channelAccount);
  if (!expectedVendorId) {
    return notSubmitted('쿠팡 계정에 WING 판매자 ID(vendorId)가 없습니다. 쇼핑몰 계정 설정에서 먼저 넣으세요.');
  }

  const options = mallFormExecutionOptions(item);
  try {
    const response = await sendWingForm({ product, expectedVendorId, ...options });
    return wingFormOutcome(response, options.submit);
  } catch (error) {
    // 확장에 닿지도 못했으면 올라간 것이 없다. 닿은 뒤 통신이 끊기면 제출 여부를 모른다 — 던져서 실행이
    // `uncertain` 으로 남게 한다.
    if (error instanceof WingFormNotReachedError || !options.submit) {
      return notSubmitted(error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}

export const coupangWingAdapter: MallPublishAdapter = {
  mallKey: 'coupang',
  mallName: '쿠팡 WING',
  // 레지스트리 `delivery: form` 과 같다(spec 이 잠근다).
  mode: 'form',
  acceptsSalesProducts: true,
  supportsOptions: false,
  batchSize: 1,
  // 등록 실행 안에서는 확장이 [상품등록]까지 누른다. 실행 밖에서는 폼만 채운다.
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
    const execution = item.targetExecution;
    if (!execution) {
      return [
        ...(item.name.trim() ? [] : ['상품명이 비어 있습니다.']),
        ...[listPriceProblem(item.salePrice)].filter((problem): problem is string => Boolean(problem)),
      ];
    }
    return [
      ...(execution.snapshot.detailPage ? [] : [DETAIL_PAGE_REQUIRED]),
      ...validateWingProduct(wingProductForExecution(execution.snapshot, values)),
    ];
  },

  send,
};
