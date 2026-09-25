import { WING_CATALOG_EXCEL_KIND } from '@kiditem/shared/coupang-catalog-snapshot';
import { RuntimeError } from '../../core/errors';
import type { CollectedChunk, Collector } from '../collector';
import { registerCollector } from '../index';

/** Wing 다운로드 목록의 요청 하나. */
export interface WingCatalogExcelRequest {
  id: string;
  status: string;
  executeCount: number;
  totalCount: number;
}

/** 이 수집기가 Wing에서 쓰는 것(`sites/wing`이 구현, 입구가 넘긴다). */
export interface WingCatalogExcelSite {
  /** [쿠팡상품정보] 엑셀(EDITABLE_CATALOGUE) 생성을 요청한다 — 사용자가 허용한 몰 쓰기 요청(KID-351, 2026-09-24). */
  requestCatalogExcel(description: string): Promise<void>;
  /** 다운로드 목록에서 이 설명으로 요청한 항목. 아직 목록에 없으면 null. */
  catalogExcelRequest(description: string): Promise<WingCatalogExcelRequest | null>;
  downloadCatalogExcel(id: string): Promise<Uint8Array>;
  pause(ms: number, signal: AbortSignal): Promise<void>;
}

export const CATALOG_EXCEL_FAILED = 'CATALOG_EXCEL_FAILED' as const;
export const CATALOG_EXCEL_TIMEOUT = 'CATALOG_EXCEL_TIMEOUT' as const;
/** 청크 하나의 base64 글자 수 — 서버 `WING_CATALOG_WORKBOOK_PART_CHARS`와 같다(JSON `["…"]`가 1MiB 아래). */
export const WORKBOOK_PART_CHARS = 900_000;
const WORKBOOK_CHUNK_KIND = 'workbook';
/** 진행률 청크. payload가 비어 서버는 보관하지 않고 임대만 연장한다. */
const PROGRESS_CHUNK_KIND = 'excel_progress';
const POLL_INTERVAL_MS = 10_000;
/** 1,260개 생성에 6분 37초(실측). 넉넉히 40분까지 기다린다. */
const MAX_POLLS = 240;

/**
 * `channels.wing_catalog_excel`(KID-351 작업 ② 쿠팡상품정보 갱신): Wing에 엑셀 생성을 요청하고 다운로드 목록으로
 * 진행률을 보다가, 끝나면 파일을 받아 `workbook` 청크(base64 조각)로 보낸다. 반영(엑셀 파싱·upsert)은 서버가 한다 —
 * 웹 업로드와 같은 kind·같은 청크다. 요청 상태의 원천은 Wing 다운로드 목록이다.
 */
export const wingCatalogExcelCollector: Collector<{ channelAccountId: string }, Record<string, unknown>, WingCatalogExcelSite> = {
  kind: WING_CATALOG_EXCEL_KIND,
  site: 'wing',
  async *collect(_plan, site, { signal }) {
    const description = `kiditem_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
    await site.requestCatalogExcel(description);
    const progress = (value: Record<string, unknown>): CollectedChunk => ({ chunkKind: PROGRESS_CHUNK_KIND, payload: [], progress: value });
    yield progress({ status: 'REQUESTED', executeCount: 0, totalCount: null });
    let completed: WingCatalogExcelRequest | null = null;
    for (let poll = 0; poll < MAX_POLLS && !completed; poll += 1) {
      if (signal.aborted) return;
      if (poll > 0) await site.pause(POLL_INTERVAL_MS, signal);
      const request = await site.catalogExcelRequest(description);
      if (!request) continue;
      yield progress({ status: request.status, executeCount: request.executeCount, totalCount: request.totalCount });
      if (request.status === 'COMPLETED') completed = request;
      else if (/FAIL|ABORT|CANCEL|ERROR/i.test(request.status)) {
        throw new RuntimeError(CATALOG_EXCEL_FAILED, `쿠팡 윙이 상품정보 엑셀 생성을 멈췄습니다(${request.status}). 다시 시도해 주세요.`, { status: request.status });
      }
    }
    if (!completed) {
      if (signal.aborted) return;
      throw new RuntimeError(CATALOG_EXCEL_TIMEOUT, '쿠팡 윙 상품정보 엑셀이 제시간에 만들어지지 않았습니다. 잠시 뒤 다시 시도해 주세요.');
    }
    const bytes = await site.downloadCatalogExcel(completed.id);
    const encoded = base64(bytes);
    for (let offset = 0; offset < encoded.length; offset += WORKBOOK_PART_CHARS) {
      if (signal.aborted) return;
      yield {
        chunkKind: WORKBOOK_CHUNK_KIND,
        payload: [encoded.slice(offset, offset + WORKBOOK_PART_CHARS)],
        progress: { status: 'DOWNLOADED', bytes: bytes.byteLength },
      };
    }
  },
};

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

registerCollector(wingCatalogExcelCollector);
