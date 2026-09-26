import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import { cookieBloat, loginRequired, responseInvalid, type PageFetch, type SupplierPage } from './page';

/** 쉽먼트 화면(탭을 여는 곳). 목록 API는 같은 출처라 supplier의 어느 경로에서도 읽힌다. */
export const COUPANG_SHIPMENT_URL = 'https://supplier.coupang.com/ibs/asn/active';

/** 택배 쉽먼트 한 행(옛 `scrapeCoupangShipmentDateSummary`와 같은 세 칸). */
export interface ParcelRow {
  seq: string;
  /** 발송일 칸 그대로(`YYYY-MM-DD HH:mm`). */
  outbound: string;
  /** 박스수 칸 그대로(`3 박스`). */
  boxes: string;
}

export function parcelListPath(pageNumber: number): string {
  return `/ibs/shipment/parcel/list?pageNumber=${pageNumber}&centerCode=&carrierCode=&estimatedDeliveryDate=&shipmentSeq=&purchaseOrderSeq=`;
}

const INVALID = '쿠팡 쉽먼트 목록 응답 형식이 예상과 다릅니다. 확장 프로그램을 새로고침한 뒤 다시 조회해 주세요.';

/** 쉽먼트 목록 한 쪽을 읽는다(`X-Requested-With: XMLHttpRequest`, 옛 요청과 같다). */
export async function readParcelPage(page: SupplierPage, pageNumber: number): Promise<ParcelRow[]> {
  const fetched = await page.fetch(parcelListPath(pageNumber), { headers: { 'X-Requested-With': 'XMLHttpRequest' }, tables: true });
  return parseParcelPage(fetched, pageNumber);
}

/**
 * 옛 규칙 그대로: 400/413/431은 쿠키 과다, 401/403·로그인 주소로 튕김·표 없는 로그인 화면은 로그인 필요,
 * 그 밖의 2xx 아님은 요청 실패. `parcel-tab` 표의 머리(쉽먼트 번호·발송일·박스수)가 없거나 행이 모자라면 형식 오류 —
 * 빈 배열로 줄여 "없음"으로 보고하지 않는다. 한 칸짜리 행(정상 빈 결과 안내)은 건너뛴다.
 */
export function parseParcelPage(fetched: PageFetch, pageNumber: number): ParcelRow[] {
  const path = parcelListPath(pageNumber);
  if (fetched.status < 200 || fetched.status >= 300) {
    if (fetched.status === 400 || fetched.status === 413 || fetched.status === 431) throw cookieBloat(path, fetched.status);
    if (fetched.status === 401 || fetched.status === 403) throw loginRequired(fetched.url);
    throw new RuntimeError(SITE_REQUEST_FAILED, `쉽먼트 목록 조회 실패 (${pageNumber}쪽, HTTP ${fetched.status})`, {
      status: fetched.status,
      url: path,
      reason: 'http',
      bodyHead: null,
    });
  }
  if (fetched.redirected || /\/(?:login|sign-in|signin)(?:[/?#]|$)/i.test(fetched.url)) throw loginRequired(fetched.url);
  const table = fetched.tables?.find((candidate) => candidate.id === 'parcel-tab');
  if (!table) {
    if (/(?:로그인|login|sign[ -]?in)/i.test(fetched.text)) throw loginRequired(fetched.url);
    throw responseInvalid(path, INVALID);
  }
  const heads = table.rows.filter((row) => row.section === 'thead').flatMap((row) => row.cells.filter((cell) => cell.header).map((cell) => cell.text.trim()));
  const index = (name: string) => heads.findIndex((head) => head.includes(name));
  const iSeq = index('쉽먼트 번호');
  const iOut = index('발송일');
  const iBox = index('박스수');
  if ([iSeq, iOut, iBox].some((position) => position < 0)) throw responseInvalid(path, INVALID);
  const required = Math.max(iSeq, iOut, iBox) + 1;
  const rows: ParcelRow[] = [];
  for (const row of table.rows) {
    if (row.section !== 'tbody') continue;
    const cells = row.cells.filter((cell) => !cell.header).map((cell) => cell.text.trim());
    if (cells.length <= 1) continue;
    if (cells.length < required) throw responseInvalid(path, INVALID);
    const seq = cells[iSeq]!;
    const outbound = cells[iOut]!;
    if (!seq || !/^\d{4}-\d{2}-\d{2}/.test(outbound)) throw responseInvalid(path, INVALID);
    rows.push({ seq, outbound, boxes: cells[iBox]! });
  }
  return rows;
}
