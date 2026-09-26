import {
  WING_TRAFFIC_DAY_CHUNK_KIND,
  WING_TRAFFIC_KIND,
  WING_TRAFFIC_PERIOD_CHUNK_KIND,
  WING_TRAFFIC_ROWS_CHUNK_KIND,
  WING_VENDOR_IDENTITY_MISMATCH,
  WingTrafficPlanSchema,
  type AdTrafficAccountSummary,
  type WingTrafficDay,
  type WingTrafficPeriod,
  type WingTrafficPlan,
  type WingTrafficProgress,
  type WingTrafficRow,
} from '@kiditem/shared/advertising-operations';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, Collector } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 Wing에서 쓰는 것(`sites/wing/traffic.ts`의 `wing-traffic`가 구현, 입구가 넘긴다). */
export interface WingTrafficSite {
  /** 로그인한 Wing 세션의 판매자 식별자(업체코드). 근거가 없거나 모호하면 멈춘다. */
  readVendorId(): Promise<string>;
  readFreshness(now: Date): Promise<{ salesLatest: string; trafficLatest: string; viewableStart: string; viewableEnd: string }>;
  readDetailPage(input: { businessDate: string; pageNumber: number; vendorId: string }): Promise<{
    rows: Array<Omit<WingTrafficRow, 'businessDate' | 'productId'> & { productId: string | null }>;
    totalResults: number;
    totalPages: number;
    pageSize: number;
    pageNumber: number;
  }>;
  readSummary(input: { startDate: string; endDate: string }): Promise<AdTrafficAccountSummary>;
}

const PAGE_SIZE = 100;
const CHUNK_ITEMS = 1_000;
const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
export const WING_TRAFFIC_PAGE_LIMIT_REACHED = 'RUNTIME_PAGE_LIMIT_REACHED' as const;
export const WING_TRAFFIC_DATA_NOT_READY = 'WING_TRAFFIC_DATA_NOT_READY' as const;
const WING_TRAFFIC_PAGE_CONFLICT = 'WING_TRAFFIC_PAGE_CONFLICT' as const;

/**
 * `advertising.wing_traffic`(KID-362, 옛 content script `collectTrafficDailyV2`). 쿠팡은 트래픽과 매출을 따로 늦게
 * 공개하므로 먼저 공개 기간을 읽어 plan 범위를 확정 창으로 줄인다(앞날까지 공개가 없으면 멈춘다). 확정 창의 날마다
 * 상세 쪽을 끝까지 읽어 옵션-일 행을 `traffic_rows`로, 그날 계정 요약과 쪽·행 수를 `traffic_days` 표식으로 내고,
 * 끝에 확정 창 전체의 계정 요약을 `traffic_period`로 낸다. 완결 판정과 listing 맞춤은 서버 finalize가 한다.
 * 쪽 사이마다 progress를 올려 임대를 연장한다(100쪽 × 여러 날).
 */
export const wingTrafficCollector: Collector<WingTrafficPlan, Record<string, unknown>, WingTrafficSite> = {
  kind: WING_TRAFFIC_KIND,
  site: 'wing-traffic',
  async *collect(rawPlan, site, { signal, report }) {
    const parsed = WingTrafficPlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '트래픽 수집 계획이 올바르지 않습니다.', { kind: WING_TRAFFIC_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, 'Wing 사이트를 쓸 수 없습니다.', { kind: WING_TRAFFIC_KIND });
    const plan = parsed.data;
    if (signal.aborted) return;
    // 다른 Wing 계정으로 로그인한 세션이면 아무것도 읽지 않는다 — 빈 날의 행은 판매자 식별자를 싣지 않으므로 먼저 확인하고,
    // 읽은 식별자를 기간 표식에 실어 서버도 대조한다.
    const vendorId = await site.readVendorId();
    if (vendorId !== plan.vendorId) {
      throw new RuntimeError(WING_VENDOR_IDENTITY_MISMATCH, 'Wing에 다른 계정으로 로그인돼 있습니다. 수집할 계정으로 다시 로그인한 뒤 시작해 주세요.', {
        plannedVendorId: plan.vendorId,
        observedVendorId: vendorId,
      });
    }
    const freshness = await site.readFreshness(new Date());
    const confirmedEnd = [freshness.salesLatest, freshness.trafficLatest, plan.endDate].reduce((earliest, date) => (date < earliest ? date : earliest));
    const dates = plan.expectedDates.filter((date) => date <= confirmedEnd);
    if (dates.length === 0) {
      throw new RuntimeError(
        WING_TRAFFIC_DATA_NOT_READY,
        `쿠팡이 ${plan.startDate} 이후 트래픽을 아직 공개하지 않았습니다. 트래픽 ${freshness.trafficLatest} · 매출 ${freshness.salesLatest}까지 집계돼 있습니다.`,
        { latestTrafficDate: freshness.trafficLatest, latestSalesDate: freshness.salesLatest },
      );
    }
    if (plan.startDate < freshness.viewableStart || confirmedEnd > freshness.viewableEnd) {
      throw new RuntimeError(WING_TRAFFIC_DATA_NOT_READY, '쿠팡 매출분석이 요청한 날짜 범위를 제공하지 않습니다.', {
        viewableStart: freshness.viewableStart,
        viewableEnd: freshness.viewableEnd,
      });
    }
    let rowTotal = 0;
    for (const [index, businessDate] of dates.entries()) {
      const progress = (current: string | null): WingTrafficProgress => ({ current, confirmedDays: index, plannedDays: dates.length, rows: rowTotal });
      const buffer = new ChunkBuffer<WingTrafficRow>({ maxItems: CHUNK_ITEMS, label: '트래픽 행' });
      let totalResults: number | null = null;
      let totalPages = 1;
      let pages = 0;
      let rows = 0;
      for (let pageNumber = 0; pageNumber < totalPages; pageNumber += 1) {
        if (signal.aborted) return;
        if (pageNumber >= plan.maxPagesPerDay) {
          throw new RuntimeError(WING_TRAFFIC_PAGE_LIMIT_REACHED, `${businessDate} 트래픽이 ${plan.maxPagesPerDay}쪽을 넘습니다.`, { businessDate });
        }
        const page = await site.readDetailPage({ businessDate, pageNumber, vendorId: plan.vendorId });
        if (page.pageNumber !== pageNumber || page.pageSize !== PAGE_SIZE || page.totalResults < 0) throw pageConflict(businessDate, pageNumber);
        if (totalResults === null) {
          totalResults = page.totalResults;
          totalPages = totalResults === 0 ? 1 : Math.ceil(totalResults / PAGE_SIZE);
          if (page.totalPages !== (totalResults === 0 ? 0 : totalPages)) throw pageConflict(businessDate, pageNumber);
          if (totalPages > plan.maxPagesPerDay) {
            throw new RuntimeError(WING_TRAFFIC_PAGE_LIMIT_REACHED, `${businessDate} 트래픽이 ${plan.maxPagesPerDay}쪽을 넘습니다.`, { businessDate });
          }
        } else if (page.totalResults !== totalResults || page.totalPages !== totalPages) {
          throw pageConflict(businessDate, pageNumber);
        }
        const expectedRows = totalResults === 0 ? 0 : Math.min(PAGE_SIZE, totalResults - pageNumber * PAGE_SIZE);
        if (page.rows.length !== expectedRows) throw pageConflict(businessDate, pageNumber);
        pages += 1;
        for (const option of page.rows) {
          rows += 1;
          const full = buffer.push({ businessDate, ...option });
          if (full) yield rowsChunk(full);
        }
        rowTotal += page.rows.length;
        await report?.({ ...progress(businessDate) });
      }
      const rest = buffer.flush();
      if (rest) yield rowsChunk(rest);
      if (signal.aborted) return;
      const accountSummary = await site.readSummary({ startDate: businessDate, endDate: businessDate });
      const day: WingTrafficDay = { businessDate, pages, rows, explicitEmpty: rows === 0, capturedAt: new Date().toISOString(), accountSummary };
      yield { chunkKind: WING_TRAFFIC_DAY_CHUNK_KIND, payload: [day], progress: { current: businessDate, confirmedDays: index + 1, plannedDays: dates.length, rows: rowTotal } };
    }
    if (signal.aborted) return;
    const periodSummary = await site.readSummary({ startDate: dates[0]!, endDate: dates[dates.length - 1]! });
    const period: WingTrafficPeriod = { startDate: dates[0]!, endDate: dates[dates.length - 1]!, capturedAt: new Date().toISOString(), vendorId, accountSummary: periodSummary };
    yield { chunkKind: WING_TRAFFIC_PERIOD_CHUNK_KIND, payload: [period], progress: { current: null, confirmedDays: dates.length, plannedDays: dates.length, rows: rowTotal } };
  },
};

function rowsChunk(payload: WingTrafficRow[]): CollectedChunk {
  return { chunkKind: WING_TRAFFIC_ROWS_CHUNK_KIND, payload };
}

function pageConflict(businessDate: string, pageNumber: number): RuntimeError {
  return new RuntimeError(WING_TRAFFIC_PAGE_CONFLICT, 'Wing 트래픽 쪽 정보가 바뀌었거나 일부만 왔습니다. 잠시 뒤 다시 수집해 주세요.', { businessDate, pageNumber });
}

registerCollector(wingTrafficCollector);
