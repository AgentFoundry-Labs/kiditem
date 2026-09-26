import {
  SABANGNET_MALL_LISTINGS_CHUNK_KIND,
  SABANGNET_MALL_LISTINGS_KIND,
  SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND,
} from '@kiditem/shared/channels-operations';
import {
  SABANGNET_MALL_LISTING_PAGE_LIMIT,
  SABANGNET_MALL_LISTING_ROW_LIMIT,
  SabangnetMallListingsPlanSchema,
  type SabangnetMallListingRow,
  type SabangnetMallListingsPlan,
  type SabangnetMallListingsScan,
} from '@kiditem/shared/sabangnet-mall-listings';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 사방넷 목록 행에서 사이트가 복사해 준 칸(원문 그대로). */
export interface SabangnetListItem {
  shmaId: unknown;
  prdRegsTrnmSrno: unknown;
  shmaPrdNo: unknown;
  prdNo: unknown;
  prdNm: unknown;
  prdSplyStsCdNm: unknown;
  modlNm: unknown;
  onsfPrdCd: unknown;
  sepr: unknown;
  prdRegsFstTrnmDt: unknown;
}

/** 이 수집기가 사방넷에서 쓰는 것(`sites/sabangnet`이 구현). 쪽 사이 간격은 사이트가 둔다. */
export interface SabangnetListingsSite {
  mallListingPage(
    query: { listPath: string; dateFrom: string; dateTo: string; pageSize: number },
    currentPage: number,
  ): Promise<{ total: number; items: SabangnetListItem[] }>;
  close(): Promise<void>;
}

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
const MALL_CONTRACT_CHANGED = 'MALL_CONTRACT_CHANGED' as const;
const SOURCE_SNAPSHOT_INVALID = 'SOURCE_SNAPSHOT_INVALID' as const;
const CHUNK_ROWS = 500;

function drift(stage: string): never {
  throw new RuntimeError(MALL_CONTRACT_CHANGED, `사방넷 목록 형식이 바뀌어 가져오기를 멈췄습니다. [${stage}]`, { stage });
}

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function digits(value: unknown, maximum: number): string | null {
  const normalized = text(value, maximum);
  return normalized && /^\d+$/.test(normalized) ? normalized : null;
}

function price(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000_000_000 ? parsed : null;
}

function sentAt(value: unknown): string | null {
  const normalized = text(value, 20);
  return normalized && /^\d{8} \d{2}:\d{2}$/.test(normalized) ? normalized : null;
}

/**
 * `channels.sabangnet_mall_listings`(KID-363 L1): 옛 `sabangnet-mall-listings.js`를 옮겼다. 서버 plan의 기간으로 사방넷
 * "쇼핑몰상품수정" 목록을 끝까지 읽는다(쪽 크기 500, 쪽 사이 800ms는 사이트). 읽는 사이 전체 수가 바뀌거나 마지막이 아닌
 * 쪽이 덜 차면 멈춘다. 계획의 쇼핑몰 행만 `listing_rows`로 내고(다른 쇼핑몰은 세기만), 끝에 읽은 증거 `listing_scan`
 * 하나를 낸다. 송신 기록 전체인지는 서버 finalize가 판정한다. 쪽마다 progress를 올려 임대를 연장한다.
 */
export const sabangnetMallListingsCollector: Collector<SabangnetMallListingsPlan, Record<string, unknown>, SabangnetListingsSite> = {
  kind: SABANGNET_MALL_LISTINGS_KIND,
  site: 'sabangnet',
  async *collect(rawPlan, site, { signal, report }) {
    const parsed = SabangnetMallListingsPlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '사방넷 가져오기 계획이 올바르지 않습니다.', { kind: SABANGNET_MALL_LISTINGS_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '사방넷 사이트를 쓸 수 없습니다.', { kind: SABANGNET_MALL_LISTINGS_KIND });
    const plan = parsed.data;
    const planned = new Set(plan.malls.flatMap((mall) => mall.sabangnetShopIds));
    const query = { listPath: plan.listPath, dateFrom: plan.dateFrom, dateTo: plan.dateTo, pageSize: plan.pageSize };
    const buffer = new ChunkBuffer<SabangnetMallListingRow>({ maxItems: CHUNK_ROWS, label: '사방넷 송신 기록 한 줄' });
    const seen = new Set<string>();
    const skippedByShop: Record<string, number> = {};
    let missingMallCode = 0;
    let recordsRead = 0;
    let rows = 0;
    let pagesRead = 0;
    let totalRecords: number | null = null;
    let totalPages = 1;
    try {
      for (let currentPage = 1; currentPage <= totalPages; currentPage += 1) {
        if (signal.aborted) return;
        const page = await site.mallListingPage(query, currentPage);
        if (totalRecords === null) {
          totalRecords = page.total;
          if (totalRecords > SABANGNET_MALL_LISTING_ROW_LIMIT) {
            throw new RuntimeError(SOURCE_SNAPSHOT_INVALID, '사방넷 송신 기록이 한 번에 가져올 수 있는 수를 넘습니다.', { stage: 'row_limit', totalRecords });
          }
          totalPages = Math.max(1, Math.ceil(totalRecords / plan.pageSize));
          if (totalPages > SABANGNET_MALL_LISTING_PAGE_LIMIT) {
            throw new RuntimeError(SOURCE_SNAPSHOT_INVALID, '사방넷 송신 기록 쪽 수가 너무 많습니다.', { stage: 'page_limit', totalPages });
          }
        } else if (page.total !== totalRecords) {
          throw new RuntimeError(SOURCE_SNAPSHOT_INVALID, '읽는 사이 사방넷 송신 기록이 늘었습니다. 잠시 뒤 다시 가져와 주세요.', { stage: 'total_changed' });
        }
        pagesRead += 1;
        for (const item of page.items) {
          const shopId = text(item.shmaId, 20);
          if (!shopId || !/^shop\d{4}$/.test(shopId)) drift('shop');
          const sendSerial = digits(item.prdRegsTrnmSrno, 30);
          if (!sendSerial) drift('send_serial');
          if (seen.has(sendSerial)) continue;
          seen.add(sendSerial);
          recordsRead += 1;
          if (!planned.has(shopId)) {
            skippedByShop[shopId] = (skippedByShop[shopId] ?? 0) + 1;
            continue;
          }
          const mallProductCode = text(item.shmaPrdNo, 60);
          if (!mallProductCode) {
            missingMallCode += 1;
            continue;
          }
          const sabangnetProductNo = digits(item.prdNo, 30);
          const productName = text(item.prdNm, 400);
          const supplyStatus = text(item.prdSplyStsCdNm, 20);
          if (!sabangnetProductNo) drift('product_no');
          if (!productName) drift('product_name');
          if (!supplyStatus) drift('supply_status');
          rows += 1;
          const full = buffer.push({
            sendSerial,
            sabangnetShopId: shopId,
            mallProductCode,
            sabangnetProductNo,
            modelName: text(item.modlNm, 120),
            ownProductCode: text(item.onsfPrdCd, 120),
            productName,
            salePrice: price(item.sepr),
            supplyStatus,
            firstSentAt: sentAt(item.prdRegsFstTrnmDt),
          });
          if (full) yield { chunkKind: SABANGNET_MALL_LISTINGS_CHUNK_KIND, payload: full, progress: { pagesRead, totalPages, rows } };
        }
        // 마지막 쪽이 아니면 꽉 차 있어야 한다. 서버가 쪽 크기를 줄였으면 목록을 믿지 않는다(실패 이력 줄은 사이트가 뺐다).
        const expected = currentPage < totalPages ? plan.pageSize : totalRecords - plan.pageSize * (totalPages - 1);
        if (page.items.length !== expected) drift('page_size');
        await report?.({ pagesRead, totalPages, rows });
      }
      const rest = buffer.flush();
      if (rest) yield { chunkKind: SABANGNET_MALL_LISTINGS_CHUNK_KIND, payload: rest, progress: { pagesRead, totalPages, rows } };
      const scan: SabangnetMallListingsScan = {
        collection: {
          totalRecords: totalRecords ?? 0,
          recordsRead,
          pagesRead,
          totalPages,
          truncated: false,
          skippedByShop,
          missingMallCode,
        },
        proof: { dateFrom: plan.dateFrom, dateTo: plan.dateTo, pageSize: plan.pageSize, validatedList: true },
      };
      yield { chunkKind: SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND, payload: [scan], progress: { pagesRead, totalPages, rows } };
    } finally {
      await site.close();
    }
  },
};

registerCollector(sabangnetMallListingsCollector);
