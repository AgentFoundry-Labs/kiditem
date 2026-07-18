import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import {
  renderCandidateDetailImage,
  type CandidateDetailImageResponse,
} from './detail-page-image-api';
import { productsApi, type ProductDetailResponse } from './sourcing-api';
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
  // 추가이미지에는 **썸네일만** 넣는다.
  // 원본 수집 이미지(role=source)나 1688 원본을 섞으면 규격도 안 맞고 사용자가 고른 것도
  // 아니다. 썸네일이 없으면 추가이미지는 비워 둔다 — 아무거나 채우지 않는다.
  const additionalImageUrls = (roleImages?.thumbnail ?? [])
    .filter((url) => url && url !== repImage)
    .slice(0, 9);
  // 상세설명은 렌더된 긴 이미지 **1장**이다.
  // role=detail 섹션 이미지를 낱장으로 올리면 쿠팡 상세설명이 조각조각 나뉜다 —
  // 라이브에서 확인된 오답이라 여기서는 쓰지 않는다.
  const detailImageUrls = detailImageUrl ? [detailImageUrl] : [];
  const salePrice = normalizePrice(b.salePrice || detail.price_krw || 0);
  const origPrice = normalizePrice(b.originalPrice || salePrice);
  const colorValue = b.colorVariantNames?.trim() || '단일';

  // 물총 필수 구매옵션 = 색상 + 수량. MVP 는 단일 SKU 로 채운다.
  const variant: WingVariant = {
    purchaseOptions: [
      { type: '색상', value: colorValue },
      { type: '수량', value: '1' },
    ],
    salePrice,
    origPrice,
    stock: 999,
    representativeImageUrl: repImage,
  };

  const noticeValues = [...preset.defaultNoticeValues];
  if (noticeValues.length > 0) noticeValues[0] = b.name || noticeValues[0]; // 품명 및 모델명

  return {
    categoryCell: categoryCell ?? preset.categoryCell,
    productName: b.name || detail.name,
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
}

/**
 * 단일 상품 직접 등록: 확장이 쿠팡 WING 상품등록(formV2) 페이지를 열어 자동으로 채운다.
 * 엑셀을 거치지 않고 페이지를 직접 조작하는 경로(단일 작업용).
 * 실제 폼 채움은 확장 content-script(wing-registration-fill)가 수행한다.
 *
 * 상세설명은 저장된 상세페이지를 780px(쿠팡 권장) 이미지 1장으로 렌더해 넘긴다.
 * 확장은 이 로컬 이미지를 CDN 업로드의 원본으로만 쓰고, WING 최종 상태는 HTML 로 만든다.
 */
export async function registerSingleProductToWing(
  candidateId: string,
  preset: WingCategoryPreset = WING_TOY_WATERGUN_PRESET,
): Promise<WingSingleRegistrationResult> {
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

  const product = candidateToWingProduct(detail, preset, categoryCell, detailImageUrl);
  const res = await sendToExtension<{ ok?: boolean; error?: string }>(extensionId, {
    action: 'registerToWingForm',
    product,
  }, WING_FORM_FILL_TIMEOUT_MS);
  if (!res?.ok) {
    throw new Error(res?.error || '쿠팡 WING 상품등록 페이지 열기에 실패했습니다. 확장을 리로드했는지 확인하세요.');
  }
  return { detailImage: { status: 'rendered', imageUrl: detailImageUrl } };
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
