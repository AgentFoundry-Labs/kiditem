import { salesProductApi } from '@/lib/sales-product-api';
import { getWingCategoryDefinition } from './wing-category-presets';
import { resolveWingCategorySelections, salesProductToWingProduct } from './wing-product';
import {
  requestWingRegistrationWorkbook,
  WING_PRODUCT_DRAFT_DEFAULTS,
  type WingProductDraftDefaults,
} from './wing-registration-excel';

/**
 * 쿠팡 WING 일괄등록 엑셀(쿠팡 어댑터의 파일 경로). 쿠팡 Open API 를 쓰지 않고 WING 일괄등록 화면에 올릴 파일을
 * 만든다. 파일을 만든 것은 등록이 아니다 — 등록 실행을 열지 않는다.
 *
 * 상세설명은 담지 않는다. 상품마다 서버 래스터라이즈가 필요한데 파일 경로에는 그 배선이 없다 — 없는 것을
 * 아무 이미지로 채우지 않고 비워 둔다.
 */
const TEMPLATE_URL = '/coupang-wing-bulk-template-v4.6.xlsm';

export async function generateWingExcelForSalesProducts(
  salesProductIds: string[],
  defaults: WingProductDraftDefaults = WING_PRODUCT_DRAFT_DEFAULTS,
): Promise<{ bytes: Uint8Array; fileName: string; productCount: number }> {
  if (salesProductIds.length === 0) throw new Error('선택한 상품이 없습니다.');
  const products = await Promise.all(salesProductIds.map((id) => salesProductApi.get(id)));
  const categoryKeys = await resolveWingCategorySelections(products);

  const templateResponse = await fetch(TEMPLATE_URL);
  if (!templateResponse.ok) throw new Error(`WING 양식 템플릿 로드 실패 (${templateResponse.status})`);
  const templateBytes = await templateResponse.arrayBuffer();

  const rows = products.map((product, index) => salesProductToWingProduct(
    product,
    {
      wingCategoryKey: getWingCategoryDefinition(categoryKeys[index]!)?.key ?? '',
      brand: defaults.defaultBrand,
      maker: defaults.defaultMaker,
    },
    defaults,
  ));
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const generated = await requestWingRegistrationWorkbook(templateBytes, rows, `쿠팡WING_일괄등록_${stamp}.xlsx`);
  return { ...generated, productCount: rows.length };
}

/** 브라우저 다운로드. */
export function downloadWingExcel(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
