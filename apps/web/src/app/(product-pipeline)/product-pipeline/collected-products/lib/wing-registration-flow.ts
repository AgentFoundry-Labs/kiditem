import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import { productsApi, type ProductDetailResponse } from './sourcing-api';
import {
  buildWingRegistrationWorkbook,
  WING_TOY_WATERGUN_PRESET,
  type WingCategoryPreset,
  type WingProduct,
  type WingVariant,
} from './wing-registration-excel';

// 수집상품(SourcingCandidate) → 쿠팡 WING 일괄등록 엑셀 생성·다운로드 플로우.
// 쿠팡 Open API 를 쓰지 않고, 확장이 WING 일괄등록 화면에 올릴 엑셀을 만든다.
// MVP: 대표 완구 카테고리(물총) 프리셋 고정 + 단일 SKU + 상세=대표이미지 임시.
// TODO: 옵션(색상/수량) 실매핑, 상세페이지 HTML→이미지 URL, 카테고리 선택 UI, 확장 자동 업로드.

const TEMPLATE_URL = '/coupang-wing-bulk-template-v4.6.xlsm';

/** ProductBasics(수집상품 상세) → WingProduct 매핑. */
export function candidateToWingProduct(
  detail: ProductDetailResponse,
  preset: WingCategoryPreset = WING_TOY_WATERGUN_PRESET,
): WingProduct {
  const b = detail.basicInfo;
  const images = collectImages(detail);
  const repImage = b.selectedThumbnailUrl || images[0] || detail.thumbnailUrl || '';
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
    categoryCell: preset.categoryCell,
    productName: b.name || detail.name,
    brand: preset.defaultBrand,
    maker: preset.defaultMaker,
    searchKeyword: (b.keywords.length ? b.keywords : b.tags).slice(0, 20).join(','),
    searchOptions: preset.defaultSearchOptions,
    additionalImageUrls: images.filter((url) => url !== repImage).slice(0, 9),
    // 상세 설명은 필수(URL). 상세페이지 HTML→이미지 파이프라인 전까지는 대표이미지로 임시 대체.
    detailImageUrl: repImage,
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

  const products = details.map((detail) => candidateToWingProduct(detail, preset));
  const bytes = buildWingRegistrationWorkbook(templateBytes, products);
  return { bytes, productCount: products.length };
}

/**
 * 단일 상품 직접 등록: 확장이 쿠팡 WING 상품등록(formV2) 페이지를 열어 자동으로 채운다.
 * 엑셀을 거치지 않고 페이지를 직접 조작하는 경로(단일 작업용).
 * 실제 폼 채움은 확장 content-script(wing-registration-fill)가 수행한다.
 */
export async function registerSingleProductToWing(
  candidateId: string,
  preset: WingCategoryPreset = WING_TOY_WATERGUN_PRESET,
): Promise<void> {
  if (!isChromeExtensionRuntimeAvailable()) {
    throw new Error('쿠팡 WING 직접 등록은 Chrome 확장에서 실행됩니다. Chrome에서 이 페이지를 열고 다시 시도하세요.');
  }
  const extensionId = await detectExtensionId();
  if (!extensionId) {
    throw new Error('KidItem 확장을 찾지 못했습니다. 확장을 설치/리로드한 뒤 다시 시도하세요.');
  }
  const detail = await productsApi.getDetail(candidateId);
  const product = candidateToWingProduct(detail, preset);
  const res = await sendToExtension<{ ok?: boolean; error?: string }>(extensionId, {
    action: 'registerToWingForm',
    product,
  });
  if (!res?.ok) {
    throw new Error(res?.error || '쿠팡 WING 상품등록 페이지 열기에 실패했습니다. 확장을 리로드했는지 확인하세요.');
  }
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
