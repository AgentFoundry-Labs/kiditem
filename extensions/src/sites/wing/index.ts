import type {
  CoupangCatalogDetailProductV1,
  WingCatalogDeletionConfirmationItem,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { RuntimeError, isRuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED, type SiteCaller } from '../../core/site-caller';
import type { SiteDefinition } from '../site';
import {
  WingPayloadError,
  buildCatalogDetailProduct,
  buildWingCatalogSearchBody,
  buildWingProductIdSearchBody,
  normalizeWingCatalogSearchResponse,
  type WingInventoryPage,
} from './parse';

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
/** 상세 일시 오류(429·5xx·연결 끊김)를 다시 묻기 전 기다림. 옛 수집기 값 그대로. */
const DETAIL_RETRY_DELAYS_MS = [2_000, 6_000] as const;

export const CATALOG_LIST_INCOMPLETE = 'CATALOG_LIST_INCOMPLETE' as const;
export const CATALOG_EXCEL_FAILED = 'CATALOG_EXCEL_FAILED' as const;
export const WING_CATALOG_PAYLOAD_INVALID = 'WING_CATALOG_PAYLOAD_INVALID' as const;

/**
 * 쿠팡 윙. 탭은 `account:<channelAccountId>` 잠금이 잡는다(입구의 `accountSite: 'wing'`). 봇 센서가 있어 요청은
 * 직렬·2초 간격이다. `XSRF-TOKEN` 쿠키가 있으면 모든 요청에 `X-XSRF-TOKEN`으로 싣고, 엑셀 계열 요청은 그것이 꼭
 * 필요하다(KID-351 실측). 로그인 판정은 응답(401·403·로그인 리다이렉트)으로 한다 — 로그인 자동화는 KID-359.
 */
export const WING_SITE: SiteDefinition = {
  name: 'wing',
  origin: ORIGIN,
  caller: {
    minIntervalMs: 2_000,
    displayName: '쿠팡 윙',
    xsrf: { cookieUrl: ORIGIN, cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
  },
};

export interface WingSiteDeps {
  sleep(ms: number): Promise<void>;
}

/** Wing 카탈로그 수집기 셋(목록·상세·엑셀)이 쓰는 Wing 읽기와, 사용자가 허용한 엑셀 생성 요청 하나. */
export function createWingSite(caller: SiteCaller, deps: WingSiteDeps) {
  const postJson = (url: string, body: unknown, requireXsrf = false) =>
    caller.json(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      requireXsrf,
    });

  async function productIdsOf(ids: readonly string[], displayDeletedProduct: boolean): Promise<Map<string, string | null>> {
    const response = await postJson(SEARCH_URL, buildWingProductIdSearchBody(ids, displayDeletedProduct));
    const rows = productRows(response);
    return new Map(rows.map((row) => [String(row.vendorInventoryId), typeof row.productStatus === 'string' ? row.productStatus : null]));
  }

  return {
    /** 목록 한 페이지(500개). 페이지 모양·행 수가 pagination과 맞지 않으면 `CATALOG_LIST_INCOMPLETE`. */
    async searchInventory(page: number, vendorId: string | null): Promise<WingInventoryPage> {
      const response = await postJson(SEARCH_URL, buildWingCatalogSearchBody(page));
      try {
        return normalizeWingCatalogSearchResponse(response, page, vendorId);
      } catch (error) {
        if (error instanceof WingPayloadError) throw new RuntimeError(CATALOG_LIST_INCOMPLETE, error.message, { page });
        throw error;
      }
    },

    /** 상품 상세 하나. 없으면(404) null. 429·5xx·연결 끊김은 2초·6초 뒤 다시 묻는다. */
    async productDetail(externalProductId: string): Promise<CoupangCatalogDetailProductV1 | null> {
      const url = `${DETAIL_URL}${encodeURIComponent(externalProductId)}`;
      for (let attempt = 0; ; attempt += 1) {
        let body: unknown;
        try {
          body = await caller.json(url);
        } catch (error) {
          const status = isRuntimeError(error) && error.code === SITE_REQUEST_FAILED ? error.details?.status : undefined;
          if (status === 404) return null;
          const transient = status === null || status === 429 || (typeof status === 'number' && status >= 500);
          const delay = DETAIL_RETRY_DELAYS_MS[attempt];
          if (!transient || delay === undefined) throw error;
          await deps.sleep(delay);
          continue;
        }
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
      }
    },

    /**
     * 목록에서 사라진 상품(최대 100개)이 삭제됐는가(KID-351 실측): `PRODUCT_ID` 검색을 삭제 상품만(`displayDeletedProduct:
     * true`) 한 번, 남은 것을 일반 상품으로 한 번 묻는다. 삭제 검색에 나오면 deleted, 일반 검색에 나오면 present, 둘 다
     * 없으면 not_found(미확인 — 서버는 활성으로 두고 품질 보고에 남긴다).
     */
    async probeDeleted(externalProductIds: readonly string[]): Promise<WingCatalogDeletionConfirmationItem[]> {
      const deleted = await productIdsOf(externalProductIds, true);
      const rest = externalProductIds.filter((id) => !deleted.has(id));
      const present = rest.length > 0 ? await productIdsOf(rest, false) : new Map<string, string | null>();
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
