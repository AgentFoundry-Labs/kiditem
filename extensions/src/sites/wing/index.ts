import type {
  CoupangCatalogDetailProductV1,
  WingCatalogDeletionConfirmationItem,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { RuntimeError, isRuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED, createSiteCaller, type SiteCaller, type SiteRequestInit } from '../../core/site-caller';
import type { SiteDefinition } from '../site';
import {
  WingPayloadError,
  buildCatalogDetailProduct,
  buildWingCatalogSearchBody,
  buildWingProductIdSearchBody,
  normalizeWingCatalogSearchResponse,
  type WingInventoryPage,
} from './parse';
import { registerSite } from '../registry';
import { wingCallerWithLogin } from './login';

const ORIGIN = 'https://wing.coupang.com';
const SEARCH_URL = `${ORIGIN}/tenants/seller-web/v2/vendor-inventory/search`;
const DETAIL_URL = `${ORIGIN}/tenants/seller-web/v2/vendor-inventory/seller-product/`;
const EXCEL_BASE = `${ORIGIN}/tenants/seller-web/excel/request/download`;
const EXCEL_REQUEST_TYPE = 'EDITABLE_CATALOGUE';
/** [쿠팡상품정보] 양식의 항목 9개(Wing 엑셀 요청 화면 `getCatalogueTypes`, 2026-09-24 실측). */
const CATALOGUE_TYPES = [
  'DISPLAY_PRODUCT_NAME',
  'MANUFACTURE',
  'BRAND',
  'SEARCH_TAG',
  'ADULT_ONLY',
  'EXPOSE_ATTRIBUTE',
  'NON_EXPOSE_ATTRIBUTE',
  'MODEL_NO',
  'BARCODE',
] as const;
/**
 * 읽기 요청이 2xx JSON이 아닐 때(HTML 봇·레이트 페이지·429·5xx·연결 끊김·시간 초과) 다시 묻기 전 기다림. 옛 수집기 값
 * 그대로(KID-354 QA: 상세 20건 뒤 한 응답이 HTML이었고 몇 초 뒤 같은 상품은 200 JSON이었다). 로그인 판정은 다시 묻지 않는다.
 */
const READ_RETRY_DELAYS_MS = [2_000, 6_000] as const;
const NOT_FOUND = Symbol('wing-not-found');
/** 응답을 이만큼 기다리고 끊는다(끊기면 위 재시도를 탄다). */
const WING_TIMEOUT_MS = 30_000;
/** Wing 목록의 삭제 상품 `productStatus`. */
const WING_DELETED_STATUS = 'DELETED';

export const CATALOG_LIST_INCOMPLETE = 'CATALOG_LIST_INCOMPLETE' as const;
export const CATALOG_EXCEL_FAILED = 'CATALOG_EXCEL_FAILED' as const;
export const WING_CATALOG_PAYLOAD_INVALID = 'WING_CATALOG_PAYLOAD_INVALID' as const;

/**
 * 쿠팡 윙. 탭은 `account:<channelAccountId>` 잠금이 잡는다(입구의 `accountSite: 'wing'`). 봇 센서가 있어 요청은
 * 직렬·2초 간격이다. `XSRF-TOKEN` 쿠키가 있으면 모든 요청에 `X-XSRF-TOKEN`으로 싣고, 엑셀 계열 요청은 그것이 꼭
 * 필요하다(KID-351 실측). 로그인 판정은 응답(401·403·로그인 리다이렉트)으로 하고, 자동 로그인은 `./login`(KID-377).
 */
export const WING_SITE: SiteDefinition = {
  name: 'wing',
  origin: ORIGIN,
  caller: {
    minIntervalMs: 2_000,
    timeoutMs: WING_TIMEOUT_MS,
    displayName: '쿠팡 윙',
    xsrf: { cookieUrl: ORIGIN, cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
  },
};

export interface WingSiteDeps {
  sleep(ms: number): Promise<void>;
}

/** Wing 카탈로그 수집기 셋(목록·상세·엑셀)이 쓰는 Wing 읽기와, 사용자가 허용한 엑셀 생성 요청 하나. */
export function createWingSite(caller: SiteCaller, deps: WingSiteDeps) {
  /** 읽기 — 2xx JSON이 아니면 2초·6초 뒤 다시 묻는다. `notFoundIsAnswer`면 404는 다시 묻지 않고 `NOT_FOUND`를 돌려준다. */
  async function readJson(url: string, init?: SiteRequestInit, notFoundIsAnswer = false): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await caller.json(url, init);
      } catch (error) {
        const failed = isRuntimeError(error) && error.code === SITE_REQUEST_FAILED;
        if (failed && notFoundIsAnswer && error.details?.status === 404) return NOT_FOUND;
        const delay = READ_RETRY_DELAYS_MS[attempt];
        if (!failed) throw error;
        if (delay === undefined) throw withResponseHint(error);
        await deps.sleep(delay);
      }
    }
  }

  const postJson = (url: string, body: unknown, requireXsrf = false) =>
    caller.json(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      requireXsrf,
    });

  const searchJson = (body: unknown) => readJson(SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });

  async function productIdsOf(ids: readonly string[], displayDeletedProduct: boolean): Promise<Map<string, string | null>> {
    const response = await searchJson(buildWingProductIdSearchBody(ids, displayDeletedProduct));
    const rows = productRows(response);
    return new Map(rows.map((row) => [String(row.vendorInventoryId), typeof row.productStatus === 'string' ? row.productStatus : null]));
  }

  return {
    /** 목록 한 페이지(500개). 페이지 모양·행 수가 pagination과 맞지 않으면 `CATALOG_LIST_INCOMPLETE`. */
    async searchInventory(page: number, vendorId: string | null): Promise<WingInventoryPage> {
      const response = await searchJson(buildWingCatalogSearchBody(page));
      try {
        return normalizeWingCatalogSearchResponse(response, page, vendorId);
      } catch (error) {
        if (error instanceof WingPayloadError) throw new RuntimeError(CATALOG_LIST_INCOMPLETE, error.message, { page });
        throw error;
      }
    },

    /**
     * 상품 상세 하나. 없으면(404) null. 2xx JSON이 아니면 2초·6초 뒤 다시 묻고, 그래도 안 되면 `SITE_REQUEST_FAILED`
     * (details `status`·`reason`·`bodyHead`)를 넘긴다 — 건너뛸지는 수집기가 정한다.
     */
    async productDetail(externalProductId: string): Promise<CoupangCatalogDetailProductV1 | null> {
      const body = await readJson(`${DETAIL_URL}${encodeURIComponent(externalProductId)}`, undefined, true);
      if (body === NOT_FOUND) return null;
      let product: CoupangCatalogDetailProductV1;
      try {
        product = buildCatalogDetailProduct(body);
      } catch (error) {
        if (error instanceof WingPayloadError) throw new RuntimeError(error.code, error.message, { externalProductId });
        throw error;
      }
      if (product.externalProductId !== externalProductId) {
        throw new RuntimeError(WING_CATALOG_PAYLOAD_INVALID, `Wing 상세 상품 ID가 다릅니다(${externalProductId} / ${product.externalProductId}).`);
      }
      return product;
    },

    /**
     * 목록에서 사라진 상품(최대 100개)이 삭제됐는가(KID-351 실측): `PRODUCT_ID` 검색을 삭제 상품만(`displayDeletedProduct:
     * true`) 한 번, 남은 것을 일반 상품으로 한 번 묻는다. 삭제 검색에 나오면 deleted, 일반 검색에 나오면 present, 둘 다
     * 없으면 not_found(미확인 — 서버는 활성으로 두고 품질 보고에 남긴다).
     */
    async probeDeleted(externalProductIds: readonly string[]): Promise<WingCatalogDeletionConfirmationItem[]> {
      const found = await productIdsOf(externalProductIds, true);
      // 삭제 검색의 행도 삭제 상태(`DELETED`, 2026-09-24 실측 1,586건 전부)여야 삭제다 — 아니면 살아 있는 상품이다.
      const deleted = new Map([...found].filter(([, status]) => status === WING_DELETED_STATUS));
      const liveFromDeletedSearch = new Set([...found.keys()].filter((id) => !deleted.has(id)));
      const rest = externalProductIds.filter((id) => !found.has(id));
      const present = rest.length > 0 ? await productIdsOf(rest, false) : new Map<string, string | null>();
      for (const id of liveFromDeletedSearch) present.set(id, null);
      return externalProductIds.map((externalProductId) => {
        if (deleted.has(externalProductId)) return { externalProductId, outcome: 'deleted', productStatus: deleted.get(externalProductId) ?? null };
        if (present.has(externalProductId)) return { externalProductId, outcome: 'present', productStatus: null };
        return { externalProductId, outcome: 'not_found', productStatus: null };
      });
    },

    /**
     * [쿠팡상품정보] 엑셀(EDITABLE_CATALOGUE) 생성 요청 — 사용자가 허용한 유일한 몰 쓰기 요청(KID-351, 2026-09-24 20:32).
     * 전체 목록 조건을 그대로 쓰므로 먼저 전체 상품 수를 읽는다.
     */
    async requestCatalogExcel(description: string): Promise<void> {
      const condition = buildWingCatalogSearchBody(1);
      const totalCount = totalCountOf(await postJson(SEARCH_URL, condition));
      const response = await postJson(`${EXCEL_BASE}/create/vendor-inventory/all`, {
        searchCondition: { ...condition, totalCount },
        comment: 'KidItem 쿠팡상품정보 갱신',
        fileDescription: description,
        requestType: EXCEL_REQUEST_TYPE,
        selectedTypes: [...CATALOGUE_TYPES],
      }, true);
      const record = asRecord(response);
      if (record?.success !== true) {
        const message = typeof record?.message === 'string' && record.message ? `: ${record.message}` : '';
        throw new RuntimeError(CATALOG_EXCEL_FAILED, `쿠팡 윙이 상품정보 엑셀 생성을 거절했습니다${message}`);
      }
    },

    /** 다운로드 목록에서 이 설명으로 만든 요청. 아직 없으면 null. 중단된 요청은 `ABORTED`. */
    async catalogExcelRequest(description: string) {
      const response = await caller.json(`${EXCEL_BASE}/list?requestType=${EXCEL_REQUEST_TYPE}&page=1&countPerPage=10`, {
        headers: { accept: 'application/json' },
        requireXsrf: true,
      });
      const rows = asRecord(response)?.result;
      const row = Array.isArray(rows)
        ? rows.map(asRecord).find((candidate) => candidate?.fileDescription === description && candidate.isDeleted !== 'Y')
        : undefined;
      if (!row) return null;
      return {
        id: String(row.sellerRequestDownloadExcelId),
        status: row.isAbort === 'Y' ? 'ABORTED' : String(row.status ?? ''),
        executeCount: Number(row.executeCount) || 0,
        totalCount: Number(row.totalCount) || 0,
      };
    },

    downloadCatalogExcel(id: string): Promise<Uint8Array> {
      return caller.bytes(
        `${EXCEL_BASE}/file?requestType=${EXCEL_REQUEST_TYPE}&sellerRequestDownloadExcelId=${encodeURIComponent(id)}&sellerRequestDownloadExcelFileId=`,
        { requireXsrf: true },
      );
    },

    /** 폴링 사이 기다림. 취소되면 바로 돌아온다. */
    pause(ms: number, signal: AbortSignal): Promise<void> {
      return new Promise((resolve) => {
        if (signal.aborted) return resolve();
        const timer = setTimeout(done, ms);
        function done() {
          clearTimeout(timer);
          signal.removeEventListener('abort', done);
          resolve();
        }
        signal.addEventListener('abort', done, { once: true });
      });
    },
  };
}

export type WingSite = ReturnType<typeof createWingSite>;

/** 끝내 실패한 요청의 문장에 status와 본문 앞부분을 붙인다 — 실행 실패 문장만 보고도 봇·레이트 페이지인지 안다. */
function withResponseHint(error: RuntimeError): RuntimeError {
  const status = error.details?.status;
  const bodyHead = error.details?.bodyHead;
  const hint = `status ${typeof status === 'number' ? status : '없음'}${typeof bodyHead === 'string' && bodyHead ? ` · ${bodyHead}` : ''}`;
  return new RuntimeError(error.code, `${error.message} — ${hint}`, error.details, error);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function productRows(response: unknown): Array<Record<string, unknown>> {
  const data = asRecord(asRecord(response)?.data);
  const list = data?.productList;
  if (!Array.isArray(list)) throw new RuntimeError(WING_CATALOG_PAYLOAD_INVALID, 'Wing 상품 검색 응답이 올바르지 않습니다.');
  return list.map((row) => asRecord(row) ?? {});
}

function totalCountOf(response: unknown): number {
  const total = asRecord(asRecord(asRecord(response)?.data)?.pagination)?.totalCount;
  if (!Number.isSafeInteger(total) || (total as number) < 0) {
    throw new RuntimeError(WING_CATALOG_PAYLOAD_INVALID, 'Wing 전체 상품 수를 읽지 못했습니다.');
  }
  return total as number;
}

registerSite({
  name: WING_SITE.name,
  origin: WING_SITE.origin,
  // 로그인 화면이면 실행의 저장 자격으로 한 번 로그인하고 다시 묻는다(KID-377, `./login`).
  create: (deps, lease) => createWingSite(wingCallerWithLogin(createSiteCaller(WING_SITE.caller, deps), deps, lease), { sleep: deps.sleep }),
});
