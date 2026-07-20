import { apiClient } from '@/lib/api-client';
import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import {
  renderCandidateDetailImage,
  type CandidateDetailImageResponse,
} from './detail-page-image-api';
import { candidatesApi, productsApi, type ProductDetailResponse } from './sourcing-api';
import {
  buildUnresolvedCategoryError,
  collectUnresolvedNames,
  resolveWingCategories,
} from './wing-category-resolution';
import {
  buildWingRegistrationWorkbook,
  WING_TOY_WATERGUN_PRESET,
  type WingCategoryPreset,
  type WingProduct,
  type WingVariant,
} from './wing-registration-excel';

// 수집상품(SourcingCandidate) → 쿠팡 WING 일괄등록 엑셀 생성·다운로드 플로우.
// 쿠팡 Open API 를 쓰지 않고, 확장이 WING 일괄등록 화면에 올릴 엑셀을 만든다.
//
// 카테고리는 기존 리스팅 코퍼스 추론(`resolveWingCategories`)으로 상품별로 정한다.
// 확신이 낮으면 임의 카테고리로 대체하지 않고 등록을 막는다 — 잘못된 카테고리는
// 수수료율과 판매 정책을 바꾸기 때문이다. 프리셋은 카테고리 외 기본값(고시·브랜드)만 담당한다.
//
// 상세설명은 **렌더된 긴 이미지 1장**이다(`renderCandidateDetailImage`).
// 확장이 이를 쿠팡 CDN 에 올리고, 최종 상세설명은 `HTML 작성` 탭의 중앙 정렬 <img> 로
// 저장한다. 섹션 이미지(role=detail) 낱장을 올리는 것이 아니다.
//
// TODO: 카테고리별 옵션(색상/수량) 실매핑.

const TEMPLATE_URL = '/coupang-wing-bulk-template-v4.6.xlsm';

/**
 * WING formV2 는 카테고리 로딩과 이미지 CDN 업로드를 순차 실행한다.
 * 실제 채움은 15초를 쉽게 넘기므로 extension-bridge 기본 제한을 쓰면
 * 폼이 계속 채워지는 중인데 웹만 먼저 실패한다.
 */
export const WING_FORM_FILL_TIMEOUT_MS = 180_000;

/**
 * 판매가는 `ProductPreparation.registrationInput.salePrice` 하나에서만 온다.
 * 등록준비 폼에서 값을 넣지 않으면 0 이 되고, 그대로 보내면 확장이 '판매가 일괄입력'을
 * 건너뛰어 WING 옵션표가 0원인 채로 남는다. 화면상으로는 "안 채워진" 것처럼 보이지만
 * 실제로는 우리 데이터가 비어 있는 것이라, 조용히 넘기지 말고 여기서 막는다.
 *
 * 셀피아 가격을 자동으로 끌어오는 배선은 아직 없다(재기획서 B6 참조).
 */
export function requireSalePrice(salePrice: number, productName: string): number {
  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    throw new Error(
      `"${productName}" 의 판매가가 비어 있습니다(0원). 등록준비에서 판매가를 입력한 뒤 다시 시도하세요. `
      + '판매가 없이 등록하면 쿠팡 옵션표가 0원으로 남습니다.',
    );
  }
  return salePrice;
}

export function requireRenderedDetailImage(
  rendered: CandidateDetailImageResponse,
): string {
  if (rendered.status !== 'rendered') {
    throw new Error(
      `${rendered.message} 저장한 상세페이지가 준비된 상품만 WING 직접등록을 시작할 수 있습니다.`,
    );
  }
  return rendered.imageUrl;
}

/** 노출상품명 상한(쿠팡 WING). */
export const WING_DISPLAY_NAME_MAX = 100;

/**
 * 선행 가격 숫자를 떼어낸다.
 *
 * 셀피아 수집명은 `4000과일바구니딸깍이키링` 처럼 **매입가를 접두어로** 달고 온다.
 * 이 숫자는 판매자 내부 코드지 구매자용 정보가 아니므로 노출상품명에서는 제거한다.
 * (등록상품명(판매자관리용)에는 원본 그대로 남긴다 — `sellerProductName`)
 *
 * 3~6자리 숫자가 **맨 앞**에 있고 뒤에 숫자가 아닌 글자가 이어질 때만 떼어낸다.
 * `2단 필통` 처럼 1~2자리 수식어나 `3000` 만 있는 이름은 건드리지 않는다.
 */
export function stripLeadingPriceCode(rawName: string): string {
  const name = (rawName ?? '').trim();
  const stripped = name.replace(/^\d{3,6}(?=\D)/, '').trim();
  return stripped || name;
}

/**
 * 노출상품명 조립: `{상품명} {수량}p  {용도·특징 키워드}` (최대 100자).
 *
 * 라이브 판매중 상품 실측 형식:
 *   `선인장 딸깍 키링 1p  휴대용 열쇠고리 핸드토이 스트레스해소`
 * 수량 토큰 뒤는 **공백 두 칸**이다(라이브 그대로 유지).
 *
 * ⚠️ 없는 정보는 지어내지 않는다. 키워드가 하나도 없으면 형식을 만들 수 없으므로
 *    선행 가격만 제거한 원본을 그대로 쓴다.
 */
export function buildWingDisplayName(
  rawName: string,
  keywords: readonly string[],
  quantity = 1,
): string {
  const base = stripLeadingPriceCode(rawName);
  if (!base) return '';

  const compact = (value: string) => value.replace(/\s+/g, '');
  const baseCompact = compact(base);
  const seen = new Set<string>();
  const usable = keywords
    .map((keyword) => (keyword ?? '').trim())
    .filter((keyword) => {
      if (!keyword) return false;
      // 상품명에 이미 들어 있는 말을 뒤에 또 붙이면 어색하고 100자만 잡아먹는다.
      if (baseCompact.includes(compact(keyword))) return false;
      const key = compact(keyword);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (usable.length === 0) return base.slice(0, WING_DISPLAY_NAME_MAX);

  const count = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  const head = `${base} ${count}p`;
  if (head.length >= WING_DISPLAY_NAME_MAX) return head.slice(0, WING_DISPLAY_NAME_MAX);

  // 키워드는 잘린 조각을 남기지 않도록 **통째로 들어가는 것까지만** 붙인다.
  let out = head;
  for (const [index, keyword] of usable.entries()) {
    const next = index === 0 ? `${out}  ${keyword}` : `${out} ${keyword}`;
    if (next.length > WING_DISPLAY_NAME_MAX) break;
    out = next;
  }
  return out === head ? head : out;
}

/**
 * ProductBasics(수집상품 상세) → WingProduct 매핑.
 *
 * `categoryCell` 을 넘기면 그 값이 카테고리가 된다. 넘기지 않으면 프리셋 값으로 떨어지므로,
 * 실제 등록 경로는 반드시 추론 결과를 넘겨야 한다(아래 두 함수가 그렇게 한다).
 *
 * `detailImageUrl` 은 저장된 상세페이지를 780px 로 렌더한 **긴 이미지 1장**의 URL 이다.
 * 넘기지 않으면 상세설명은 빈 채로 남는다 — 대표이미지나 role=detail 섹션 이미지로
 * 대신 채우지 않는다.
 */
export function candidateToWingProduct(
  detail: ProductDetailResponse,
  preset: WingCategoryPreset = WING_TOY_WATERGUN_PRESET,
  categoryCell?: string,
  detailImageUrl?: string | null,
): WingProduct {
  const b = detail.basicInfo;
  const roleImages = b.registrationImages;
  // 폴백 이미지는 수집 원본(sourcing_candidates.image_url 계열)이라 규격(1,000x1,000)이
  // 맞지 않는다. role 자산이 있으면 항상 그쪽이 우선이다.
  const fallbackImages = collectImages(detail);
  const repImage =
    roleImages?.primary[0]
    || b.selectedThumbnailUrl
    || fallbackImages[0]
    || detail.thumbnailUrl
    || '';
  // 추가이미지에는 **사용자가 고른 썸네일만** 넣는다.
  //
  // 썸네일은 두 곳에 나뉘어 산다. 워크스페이스의 "썸네일 미리보기 이미지"는
  // `thumbnailPreviewUrls`(= ProductPreparation.registrationInput.thumbnailUrls)이고,
  // `registrationImages.thumbnail` 은 ContentAsset.role 로 태깅된 별도 집합이다.
  // 예전에는 후자만 읽어서, 화면에 썸네일이 보이는데도 추가이미지가 0/9 로 비었다.
  // 사용자가 실제로 고른 쪽이 앞이므로 앞을 우선하고 뒤를 덧붙인다.
  //
  // 원본 수집 이미지(role=source)나 1688 원본은 섞지 않는다 — 규격도 안 맞고
  // 사용자가 고른 것도 아니다. 둘 다 비면 추가이미지는 비워 둔다.
  //
  // ⚠️ `b.thumbnailUrls`(= 상품 이미지 전체)로 폴백하지 않는다. 추가이미지는
  // **저장된 썸네일 구성에서 대표 1장을 뺀 나머지**이지, 상품 이미지 전부가 아니다.
  // 비어 있다면 저장이 안 된 것이고, 고칠 곳은 저장 경로(워크스페이스 썸네일 갤러리)다.
  const additionalImageUrls = [
    ...new Set([...(b.thumbnailPreviewUrls ?? []), ...(roleImages?.thumbnail ?? [])]),
  ]
    .filter((url) => url && url !== repImage)
    .slice(0, 9);
  // 상세설명은 렌더된 긴 이미지 **1장**이다.
  // role=detail 섹션 이미지를 낱장으로 올리면 쿠팡 상세설명이 조각조각 나뉜다 —
  // 라이브에서 확인된 오답이라 여기서는 쓰지 않는다.
  const detailImageUrls = detailImageUrl ? [detailImageUrl] : [];
  const salePrice = normalizePrice(b.salePrice || detail.price_krw || 0);
  const origPrice = normalizePrice(b.originalPrice || salePrice);
  const colorValue = b.colorVariantNames?.trim() || '단일';
  const quantity = 1;

  // 물총 필수 구매옵션 = 색상 + 수량. MVP 는 단일 SKU 로 채운다.
  const variant: WingVariant = {
    purchaseOptions: [
      { type: '색상', value: colorValue },
      { type: '수량', value: String(quantity) },
    ],
    salePrice,
    origPrice,
    stock: 999,
    representativeImageUrl: repImage,
  };

  const noticeValues = [...preset.defaultNoticeValues];
  if (noticeValues.length > 0) noticeValues[0] = b.name || noticeValues[0]; // 품명 및 모델명

  const rawName = b.name || detail.name;
  return {
    categoryCell: categoryCell ?? preset.categoryCell,
    // 노출상품명은 구매자용이라 셀피아 수집명을 그대로 쓰지 않는다.
    // `{상품명} {수량}p  {키워드}` 로 조립하고 선행 가격 코드를 뗀다.
    productName: buildWingDisplayName(
      rawName,
      b.keywords.length ? b.keywords : b.tags,
      quantity,
    ),
    // 등록상품명(판매자관리용)에는 편집 전 원본 수집명을 넣는다. 노출상품명(`b.name`)은
    // 판매용으로 다듬어진 이름이라 판매자 내부 조회에는 원본이 더 쓸모 있다.
    // 둘이 같아지는 경우(편집 전)는 그대로 둔다 — 빈 값보다 낫다.
    sellerProductName: detail.name || b.name,
    brand: preset.defaultBrand,
    maker: preset.defaultMaker,
    searchKeyword: (b.keywords.length ? b.keywords : b.tags).slice(0, 20).join(','),
    searchOptions: preset.defaultSearchOptions,
    additionalImageUrls,
    detailImageUrls,
    noticeCategory: preset.noticeCategory,
    noticeValues,
    variants: [variant],
  };
}

/** 선택한 수집상품들로 WING 일괄등록 엑셀 바이트 생성. */
export async function generateWingExcelForCandidates(
  candidateIds: string[],
  preset: WingCategoryPreset = WING_TOY_WATERGUN_PRESET,
): Promise<{ bytes: Uint8Array; productCount: number }> {
  if (candidateIds.length === 0) throw new Error('선택한 상품이 없습니다.');

  const [templateBytes, details] = await Promise.all([
    fetch(TEMPLATE_URL).then((res) => {
      if (!res.ok) throw new Error(`WING 양식 템플릿 로드 실패 (${res.status})`);
      return res.arrayBuffer();
    }),
    Promise.all(candidateIds.map((id) => productsApi.getDetail(id))),
  ]);

  // 카테고리는 상품별로 추론한다. 확신이 낮은 건이 하나라도 있으면 엑셀을 만들지 않는다.
  const names = details.map((detail) => detail.basicInfo.name || detail.name);
  const resolved = await resolveWingCategories(names);
  const unresolved = collectUnresolvedNames(names, resolved);
  if (unresolved.length > 0) throw new Error(buildUnresolvedCategoryError(unresolved, resolved));

  // 일괄등록 엑셀 경로는 상세설명 이미지를 채우지 않는다. 상세설명은 상품별로 서버
  // 래스터라이즈가 필요한데(단일 직접 등록 경로가 그렇게 한다), 엑셀은 그 배선이 없다.
  // 없는 것을 아무 이미지로 채우느니 비워 둔다.
  const products = details.map((detail, index) =>
    candidateToWingProduct(detail, preset, resolved.get(names[index].trim())?.categoryCell ?? undefined),
  );
  const bytes = buildWingRegistrationWorkbook(templateBytes, products);
  return { bytes, productCount: products.length };
}

/**
 * 단일 직접 등록은 저장된 상세페이지가 준비된 상품만 WING 으로 넘긴다.
 * 이번 경로에서 상세설명은 선택값이 아니라 필수 계약이다.
 */
export interface WingSingleRegistrationResult {
  detailImage: { status: 'rendered'; imageUrl: string };
  /** `autoSubmit` 을 켠 경우의 제출 결과. 끈 경우 `{ attempted: false }`. */
  submission: WingSubmissionResult;
}

/**
 * 확장이 돌려주는 제출 결과.
 *
 * `status`
 *  - `not_attempted` : 옵트인을 켜지 않아 제출 버튼을 찾지도 않았다(기본).
 *  - `no_button`     : 제출 버튼을 못 찾아 아무것도 누르지 않았다.
 *  - `registered`    : 완료 안내를 확인했다. 이때만 등록상품으로 올린다.
 *  - `unknown`       : 눌렀지만 완료를 확증하지 못했다. **성공으로 취급하지 않는다.**
 */
export interface WingSubmissionResult {
  attempted: boolean;
  clicked?: boolean;
  ok?: boolean;
  status?: 'no_button' | 'registered' | 'unknown';
  label?: string;
  externalListingId?: string | null;
  error?: string;
  executionId?: string;
  evidence?: Record<string, unknown>;
}

/** 등록상품으로 올려도 되는 확증된 성공인지. 추측은 전부 false. */
export function isConfirmedWingRegistration(
  submission: WingSubmissionResult | undefined,
): submission is WingSubmissionResult & {
  externalListingId: string;
  evidence: { wingVendorId: string; wingIdentitySource: string };
} {
  return (
    submission?.ok === true
    && submission.status === 'registered'
    && typeof submission.externalListingId === 'string'
    && submission.externalListingId.trim().length > 0
    && typeof submission.evidence?.wingVendorId === 'string'
    && typeof submission.evidence?.wingIdentitySource === 'string'
  );
}

/**
 * 등록 확인 모달이 사용자에게 보여주고 **고치게 하는** 값들.
 *
 * 확장으로 넘어가기 직전의 마지막 편집 지점이다. WING 폼이 열린 뒤에는
 * 자동채움이 끝날 때까지 사용자가 개입할 수 없어서, 노출상품명/옵션/가격/재고를
 * 여기서 확정받는다.
 *
 * 가격·재고는 문자열이 아니라 숫자다 — 입력 컴포넌트가 문자열을 다루더라도
 * 이 경계에서는 파싱이 끝나 있어야 검증 규칙이 한곳에 모인다.
 */
export interface WingRegistrationOverrides {
  /** 노출상품명(구매자에게 보이는 이름). 100자 이하. */
  productName: string;
  /** 등록상품명(판매자관리용). 기본값은 원본 수집명. */
  sellerProductName: string;
  /** 구매옵션 `색상` 값. */
  colorValue: string;
  /** 구매옵션 `수량` 값. */
  quantityValue: string;
  /** 판매가(원). 10원 단위, 0보다 커야 한다. */
  salePrice: number;
  /** 정상가(할인율 기준가, 원). 0이면 판매가를 그대로 쓴다. */
  origPrice: number;
  /** 재고수량. 0 이상 정수. */
  stock: number;
}

/** 확장으로 넘기기 전 확인 모달이 필요로 하는 전체 컨텍스트. */
export interface WingRegistrationDraft {
  candidateId: string;
  /** 모달을 닫기 전까지 유지하는 pre-intent 재시도 키. */
  idempotencyKey: string;
  /** 자동 조립된 등록 payload. 사용자가 고친 값은 아직 반영 전이다. */
  product: WingProduct;
  /** 모달 기본값. `product` 에서 뽑아낸 편집 가능한 부분집합. */
  overrides: WingRegistrationOverrides;
  /** 확장 메시지를 받을 확장 ID. prepare 단계에서 이미 확인해 둔다. */
  extensionId: string;
  /**
   * 등록 대상 쿠팡 WING 채널 계정.
   * 등록 성공 후 `ChannelListing` 을 만들 때 필요하다 — 계정 없이는 등록상품 정체성이 없다.
   */
  channelAccountId: string;
  /** 렌더된 상세설명 이미지 URL(이 경로의 필수값). */
  detailImageUrl: string;
}

const PURCHASE_OPTION_COLOR = '색상';
const PURCHASE_OPTION_QUANTITY = '수량';

const findOptionValue = (product: WingProduct, type: string): string =>
  product.variants[0]?.purchaseOptions.find((option) => option.type === type)?.value ?? '';

/**
 * 자동 조립된 `WingProduct` 에서 모달 기본값을 뽑아낸다.
 *
 * 노출상품명은 `buildWingDisplayName()` 결과, 등록상품명은 원본 수집명,
 * 나머지는 첫 variant 값이다. 여기서 값을 지어내지 않는다 — 비어 있으면
 * 비어 있는 채로 보여주고 사용자가 채우게 한다.
 */
export function buildWingRegistrationOverrides(product: WingProduct): WingRegistrationOverrides {
  const variant = product.variants[0];
  return {
    productName: product.productName ?? '',
    sellerProductName: product.sellerProductName ?? '',
    colorValue: findOptionValue(product, PURCHASE_OPTION_COLOR),
    quantityValue: findOptionValue(product, PURCHASE_OPTION_QUANTITY),
    salePrice: variant?.salePrice ?? 0,
    origPrice: variant?.origPrice ?? 0,
    stock: variant?.stock ?? 0,
  };
}

/**
 * 모달 입력 검증. 확인 버튼을 누르기 전에 전부 통과해야 한다.
 *
 * 반환값은 사람이 읽는 한국어 메시지 목록이고, 빈 배열이면 통과다.
 * WING 폼이 열린 뒤에 실패하면 원인을 알기 어려우니 여기서 전부 막는다.
 */
export function validateWingRegistrationOverrides(
  overrides: WingRegistrationOverrides,
): string[] {
  const errors: string[] = [];
  const productName = overrides.productName.trim();
  if (!productName) errors.push('노출상품명을 입력하세요.');
  else if (productName.length > WING_DISPLAY_NAME_MAX) {
    errors.push(`노출상품명은 ${WING_DISPLAY_NAME_MAX}자 이하여야 합니다 (현재 ${productName.length}자).`);
  }
  if (!overrides.sellerProductName.trim()) errors.push('등록상품명(판매자관리용)을 입력하세요.');

  if (!Number.isFinite(overrides.salePrice) || overrides.salePrice <= 0) {
    errors.push('판매가는 0원보다 커야 합니다.');
  } else if (overrides.salePrice % 10 !== 0) {
    errors.push('판매가는 10원 단위여야 합니다.');
  }
  if (!Number.isFinite(overrides.origPrice) || overrides.origPrice < 0) {
    errors.push('정상가는 0원 이상이어야 합니다.');
  } else if (overrides.origPrice % 10 !== 0) {
    errors.push('정상가는 10원 단위여야 합니다.');
  }

  if (!Number.isFinite(overrides.stock) || overrides.stock < 0 || !Number.isInteger(overrides.stock)) {
    errors.push('재고수량은 0 이상의 정수여야 합니다.');
  }
  return errors;
}

/**
 * 사용자가 고친 값을 등록 payload 에 실제로 반영한다.
 *
 * ⚠️ 이 함수를 건너뛰고 원본 `product` 를 보내면 모달은 장식이 된다.
 * 확인 경로는 반드시 이 결과를 확장에 넘겨야 한다.
 *
 * 옵션은 첫 variant 의 `색상`/`수량` 만 덮어쓴다. 값이 비면 그 옵션 자체를 뺀다 —
 * 빈 문자열 옵션은 WING 에서 유효하지 않다.
 */
export function applyWingRegistrationOverrides(
  product: WingProduct,
  overrides: WingRegistrationOverrides,
): WingProduct {
  const variant = product.variants[0];
  if (!variant) return product;
  const salePrice = overrides.salePrice;
  const purchaseOptions = [
    ...(overrides.colorValue.trim()
      ? [{ type: PURCHASE_OPTION_COLOR, value: overrides.colorValue.trim() }]
      : []),
    ...(overrides.quantityValue.trim()
      ? [{ type: PURCHASE_OPTION_QUANTITY, value: overrides.quantityValue.trim() }]
      : []),
  ];
  return {
    ...product,
    productName: overrides.productName.trim(),
    sellerProductName: overrides.sellerProductName.trim(),
    variants: [
      {
        ...variant,
        purchaseOptions,
        salePrice,
        // 정상가를 비워 두면 할인율 기준가가 없다는 뜻이므로 판매가를 그대로 쓴다.
        origPrice: overrides.origPrice > 0 ? overrides.origPrice : salePrice,
        stock: overrides.stock,
      },
      ...product.variants.slice(1),
    ],
  };
}

/**
 * 등록 확인 모달에 넘길 초안을 만든다. **확장 탭을 열지 않는다.**
 *
 * 카테고리 추론과 상세설명 렌더는 실패 가능성이 있어 모달을 띄우기 전에 끝낸다 —
 * 사용자가 값을 다 고친 뒤에 "카테고리를 못 정했다" 로 막히면 입력이 버려진다.
 *
 * 판매가 0 은 여기서 막지 않는다. 모달에서 사용자가 채울 수 있게 된 값이라,
 * 조회 시점에 차단하면 고칠 기회 자체가 사라진다.
 */
export async function prepareWingRegistration(
  candidateId: string,
  preset: WingCategoryPreset = WING_TOY_WATERGUN_PRESET,
): Promise<WingRegistrationDraft> {
  if (!isChromeExtensionRuntimeAvailable()) {
    throw new Error('쿠팡 WING 직접 등록은 Chrome 확장에서 실행됩니다. Chrome에서 이 페이지를 열고 다시 시도하세요.');
  }
  const extensionId = await detectExtensionId();
  if (!extensionId) {
    throw new Error('KidItem 확장을 찾지 못했습니다. 확장을 설치/리로드한 뒤 다시 시도하세요.');
  }
  const detail = await productsApi.getDetail(candidateId);
  const name = detail.basicInfo.name || detail.name;
  const resolved = await resolveWingCategories([name]);
  const categoryCell = resolved.get(name.trim())?.categoryCell;
  if (!categoryCell) throw new Error(buildUnresolvedCategoryError([name], resolved));

  // 상세설명은 이 직접등록 경로의 필수값이다. 없으면 WING 탭을 열기 전에 중단한다.
  // 대표이미지·원본 수집 이미지로 대체하지 않는다 — 잘못된 상세페이지가 등록되는 것이
  // 등록을 멈추는 것보다 나쁘다.
  const rendered = await renderCandidateDetailImage(candidateId);
  const detailImageUrl = requireRenderedDetailImage(rendered);

  // 등록 성공 시 ChannelListing 을 만들 계정을 미리 확정한다. 활성 쿠팡 Wing 계정이
  // 없으면 WING 탭을 열기 전에 멈춘다 — 등록만 되고 우리 목록에 못 올리는 상태를 막는다.
  const channelAccountId = await resolveWingChannelAccountId();

  const product = candidateToWingProduct(detail, preset, categoryCell, detailImageUrl);
  return {
    candidateId,
    idempotencyKey: crypto.randomUUID(),
    product,
    overrides: buildWingRegistrationOverrides(product),
    extensionId,
    channelAccountId,
    detailImageUrl,
  };
}

/**
 * 등록 대상 쿠팡 Wing 채널 계정을 고른다.
 *
 * Wing 과 Rocket 은 별개의 `ChannelAccount` 행이다. 계정 표시명으로 채널을 추측하지
 * 않고 `channel === 'coupang'` 만 본다(rocket 은 별도 채널값).
 */
async function resolveWingChannelAccountId(): Promise<string> {
  const accounts = await apiClient.get<Array<{ id: string; channel: string; name: string }>>(
    '/api/channels/accounts',
  );
  const wing = accounts.find((account) => account.channel === 'coupang');
  if (!wing) {
    throw new Error(
      '활성화된 쿠팡 Wing 채널 계정이 없습니다. 설정에서 쿠팡 계정을 먼저 연결하세요.',
    );
  }
  return wing.id;
}

/**
 * 확인된 값으로 확장에 등록을 넘긴다.
 *
 * 실제 폼 채움은 확장 content-script(wing-registration-fill)가 수행한다.
 * 상세설명은 저장된 상세페이지를 780px(쿠팡 권장) 이미지 1장으로 렌더해 넘긴다.
 * 확장은 이 로컬 이미지를 CDN 업로드의 원본으로만 쓰고, WING 최종 상태는 HTML 로 만든다.
 */
export async function submitWingRegistration(
  draft: WingRegistrationDraft,
  overrides: WingRegistrationOverrides,
  /**
   * 옵트인. `true` 일 때만 확장이 WING 의 '상품등록' 버튼까지 누른다.
   * ⚠️ 엄격한 `=== true` 로만 켠다 — 기본값·누락·다른 truthy 값은 전부 "누르지 않음".
   */
  autoSubmit = false,
): Promise<WingSingleRegistrationResult> {
  const errors = validateWingRegistrationOverrides(overrides);
  if (errors.length > 0) throw new Error(errors.join(' '));
  const product = applyWingRegistrationOverrides(draft.product, overrides);
  // 판매가 0 은 WING 탭을 열기 전에 막는다. 모달 검증이 이미 걸러내지만,
  // 확장으로 나가는 마지막 지점이라 방어적으로 한 번 더 확인한다.
  requireSalePrice(product.variants[0]?.salePrice ?? 0, product.productName);
  let execution: { executionId: string; expectedVendorId: string } | null = null;
  try {
    execution = await candidatesApi.prepareExternalWingRegistration(draft.candidateId, {
      channelAccountId: draft.channelAccountId,
      displayName: product.productName,
      registrationInput: { source: 'coupang-wing-extension', wingProduct: product },
      idempotencyKey: draft.idempotencyKey,
    });
    await candidatesApi.startExternalWingRegistration(draft.candidateId, execution.executionId);
  } catch (error) {
    throw error instanceof Error ? error : new Error('WING 등록 실행 준비에 실패했습니다.');
  }
  let res;
  try {
    res = await sendToExtension<{
    ok?: boolean;
    error?: string;
    submission?: WingSubmissionResult;
    evidence?: Record<string, unknown>;
  }>(draft.extensionId, {
    action: 'registerToWingForm',
    product,
    autoSubmit: autoSubmit === true,
    executionId: execution.executionId,
    expectedVendorId: execution.expectedVendorId,
  }, WING_FORM_FILL_TIMEOUT_MS);
  } catch (error) {
    await candidatesApi.markExternalWingRegistrationUnresolved(
      draft.candidateId, execution.executionId, { reason: 'extension_throw', message: String(error) },
    ).catch(() => undefined);
    throw error;
  }
  if (!res?.ok) {
    await candidatesApi.markExternalWingRegistrationUnresolved(
      draft.candidateId, execution.executionId, { reason: 'extension_error', error: res?.error ?? null },
    ).catch(() => undefined);
    throw new Error(res?.error || '쿠팡 WING 상품등록 페이지 열기에 실패했습니다. 확장을 리로드했는지 확인하세요.');
  }
  if (res.submission?.status === 'unknown' || res.submission?.attempted === true && !isConfirmedWingRegistration(res.submission)) {
    await candidatesApi.markExternalWingRegistrationUnresolved(
      draft.candidateId, execution.executionId, { reason: 'unknown', extensionEvidence: res.evidence ?? null },
    ).catch(() => undefined);
  }
  const detailImageUrl = draft.detailImageUrl;
  return {
    detailImage: { status: 'rendered', imageUrl: detailImageUrl },
    submission: { ...(res.submission ?? { attempted: false }), executionId: execution.executionId, evidence: res.evidence },
  };
}

/**
 * 등록 확정 직후, 등록상품 목록에 **실제로 올라왔는지** 폴링해서 확인한다.
 *
 * `confirm-external` 이 200 을 돌려줘도 그것만으로 목록 반영을 단정하지 않는다.
 * 목록은 별도 조회 경로(`/api/channels/listings`)를 타고, 사용자가 실제로 보는 것은
 * 그쪽이다. 확정 응답만 믿고 등록상품 화면으로 보내면 "성공했다더니 빈 목록"이
 * 나올 수 있어서, 조회 경로에서 한 번 더 확인한 뒤에만 이동한다.
 *
 * `externalListingId` 로 검색한다(백엔드 `search` 가 `externalId` 를 포함한다).
 * 시간 안에 못 찾으면 **예외를 던지지 않고 `false`** 를 돌려준다 — 쿠팡 등록은 이미
 * 끝난 상태라 여기서 실패를 던지면 등록 자체가 실패한 것처럼 보인다.
 */
export const REGISTERED_LISTING_POLL_INTERVAL_MS = 1_000;
export const REGISTERED_LISTING_POLL_TIMEOUT_MS = 20_000;

export interface WaitForRegisteredListingDeps {
  /** 목록 조회. 기본값은 `/api/channels/listings` 검색. */
  fetchListings?: (externalListingId: string) => Promise<{ items: Array<{ externalId: string }> }>;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  timeoutMs?: number;
}

const defaultFetchListings = (externalListingId: string) => {
  const qs = new URLSearchParams({
    page: '1',
    limit: '5',
    tab: 'registered',
    search: externalListingId,
  });
  return apiClient.get<{ items: Array<{ externalId: string }> }>(
    `/api/channels/listings?${qs}`,
  );
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForRegisteredListing(
  externalListingId: string,
  deps: WaitForRegisteredListingDeps = {},
): Promise<boolean> {
  const id = externalListingId.trim();
  if (!id) return false;
  const fetchListings = deps.fetchListings ?? defaultFetchListings;
  const sleep = deps.sleep ?? defaultSleep;
  const intervalMs = deps.intervalMs ?? REGISTERED_LISTING_POLL_INTERVAL_MS;
  const timeoutMs = deps.timeoutMs ?? REGISTERED_LISTING_POLL_TIMEOUT_MS;
  // 최소 1회는 조회한다. timeout 이 0 이어도 "확인조차 안 함"이 되지 않도록 한다.
  const attempts = Math.max(1, Math.ceil(timeoutMs / Math.max(1, intervalMs)));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetchListings(id);
      if (res.items.some((item) => item.externalId === id)) return true;
    } catch {
      // 조회 실패는 재시도한다. 등록은 이미 끝났고, 목록 조회가 잠깐 흔들렸을 뿐일 수 있다.
    }
    if (attempt < attempts - 1) await sleep(intervalMs);
  }
  return false;
}

/** 브라우저 다운로드. */
export function downloadWingExcel(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function collectImages(detail: ProductDetailResponse): string[] {
  const urls = [
    ...(detail.basicInfo.thumbnailUrls ?? []),
    ...(detail.image_urls ?? []),
    detail.thumbnailUrl ?? '',
  ].filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url));
  return [...new Set(urls)];
}

function normalizePrice(value: number): number {
  const n = Math.max(0, Math.round(value));
  // 쿠팡 최소 10원 단위
  return Math.round(n / 10) * 10;
}
