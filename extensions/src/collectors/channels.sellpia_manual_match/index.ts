import {
  MAX_SELLPIA_MANUAL_MATCH_ROWS,
  SellpiaManualMatchPlanSchema,
  type SellpiaManualMatchPlan,
  type SellpiaManualMatchRow,
} from '@kiditem/shared/sellpia-manual-match';
import { SELLPIA_MANUAL_MATCH_CHUNK_KIND, SELLPIA_MANUAL_MATCH_KIND } from '@kiditem/shared/sellpia-operations';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 검색 후보 하나(`sites/sellpia` 수동매칭이 준다). */
export interface ManualMatchCandidate {
  productCode: string;
  aliasTitle: string;
  matchMd5: string;
  itemCount: number;
}

/** 이 수집기가 셀피아에서 쓰는 것(`sites/sellpia`의 `manual-match.ts`가 구현). */
export interface SellpiaManualMatchSite {
  manualMatchSearch(codes: readonly string[]): Promise<ManualMatchCandidate[]>;
  manualMatchStatus(matchMd5s: readonly string[]): Promise<Record<string, 'M' | 'P' | 'E'>>;
  closeManualMatch(): Promise<void>;
}

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
const MALL_CONTRACT_CHANGED = 'MALL_CONTRACT_CHANGED' as const;
const SOURCE_SNAPSHOT_INVALID = 'SOURCE_SNAPSHOT_INVALID' as const;
/** 검색 한 번에 넘기는 대상 코드 수(처리기가 그 안에서 동시 4로 부른다). */
const SEARCH_BATCH = 100;
/** 상태 조회 한 번의 md5 수(옛 수집기와 같다). */
const STATUS_BATCH = 100;
const CHUNK_ROWS = 2_000;

function identity(row: Pick<SellpiaManualMatchRow, 'productCode' | 'aliasTitle' | 'itemCount' | 'matchedType'>): string {
  return [row.productCode, row.aliasTitle, String(row.itemCount).padStart(10, '0'), row.matchedType].join('\u0000');
}

/**
 * `channels.sellpia_manual_match`(KID-363 L3): 옛 `sellpia-manual-match.js`를 옮겼다. 서버가 얼린 대상 코드를 100개씩
 * 검색하고(묶음 사이 progress), 같은 md5 안의 (코드·제목) 중복은 수량이 같을 때만 합친다. 모은 md5를 100개씩 상태
 * 조회해 매칭 종류를 붙이고, (코드·제목·수량·종류)마다 받은 후보 수를 근거 수로 세어 정렬한 줄을 `match_results`로 낸다.
 * 셀피아에는 읽기 요청만 한다. 별칭으로 남길지는 서버 finalize가 현재 리스팅 이름으로 정한다.
 */
export const sellpiaManualMatchCollector: Collector<SellpiaManualMatchPlan, Record<string, unknown>, SellpiaManualMatchSite> = {
  kind: SELLPIA_MANUAL_MATCH_KIND,
  site: 'sellpia',
  async *collect(rawPlan, site, { signal, report }) {
    const parsed = SellpiaManualMatchPlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 수동매칭 계획이 올바르지 않습니다.', { kind: SELLPIA_MANUAL_MATCH_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 사이트를 쓸 수 없습니다.', { kind: SELLPIA_MANUAL_MATCH_KIND });
    const { targetCodes } = parsed.data;
    try {
      const byMd5 = new Map<string, ManualMatchCandidate[]>();
      // 근거 수는 받은 후보마다 하나다(옛 수집기와 같다) — md5별 묶음은 상태 조회할 md5를 고르는 데만 쓴다.
      const received: ManualMatchCandidate[] = [];
      let candidates = 0;
      for (let offset = 0; offset < targetCodes.length; offset += SEARCH_BATCH) {
        if (signal.aborted) return;
        const found = await site.manualMatchSearch(targetCodes.slice(offset, offset + SEARCH_BATCH));
        for (const candidate of found) {
          const group = byMd5.get(candidate.matchMd5) ?? [];
          const existing = group.find((value) => value.productCode === candidate.productCode && value.aliasTitle === candidate.aliasTitle);
          if (existing && existing.itemCount !== candidate.itemCount) {
            throw new RuntimeError(MALL_CONTRACT_CHANGED, '셀피아 수동상품매칭 수량이 서로 다릅니다.', { stage: `search-quantity-conflict:${candidate.productCode}` });
          }
          candidates += 1;
          received.push(candidate);
          if (!existing) group.push(candidate);
          byMd5.set(candidate.matchMd5, group);
        }
        if (candidates > MAX_SELLPIA_MANUAL_MATCH_ROWS) {
          throw new RuntimeError(SOURCE_SNAPSHOT_INVALID, '셀피아 수동상품매칭 근거가 한 번에 받을 수 있는 수를 넘습니다.', { candidates });
        }
        await report?.({ searched: Math.min(offset + SEARCH_BATCH, targetCodes.length), targets: targetCodes.length, candidates });
      }

      const md5s = [...byMd5.keys()].sort();
      const typeByMd5 = new Map<string, 'M' | 'P' | 'E'>();
      for (let offset = 0; offset < md5s.length; offset += STATUS_BATCH) {
        if (signal.aborted) return;
        const batch = md5s.slice(offset, offset + STATUS_BATCH);
        const types = await site.manualMatchStatus(batch);
        for (const matchMd5 of batch) {
          const matchedType = types[matchMd5];
          if (matchedType !== 'M' && matchedType !== 'P' && matchedType !== 'E') {
            throw new RuntimeError(MALL_CONTRACT_CHANGED, '셀피아 수동상품매칭 상태 응답이 예상과 다릅니다.', { stage: `status-target:${matchMd5.slice(0, 12)}` });
          }
          typeByMd5.set(matchMd5, matchedType);
        }
      }

      const aggregated = new Map<string, SellpiaManualMatchRow>();
      for (const candidate of received) {
        const matchedType = typeByMd5.get(candidate.matchMd5)!;
        const key = identity({ ...candidate, matchedType });
        const previous = aggregated.get(key);
        aggregated.set(key, previous
          ? { ...previous, evidenceCount: previous.evidenceCount + 1 }
          : { productCode: candidate.productCode, aliasTitle: candidate.aliasTitle, itemCount: candidate.itemCount, matchedType, evidenceCount: 1 });
      }
      const rows = [...aggregated.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([, row]) => row);
      const progress = { searched: targetCodes.length, targets: targetCodes.length, candidates, rows: rows.length };
      const buffer = new ChunkBuffer<SellpiaManualMatchRow>({ maxItems: CHUNK_ROWS, label: '셀피아 수동매칭 근거 한 줄' });
      for (const row of rows) {
        const full = buffer.push(row);
        if (full) yield { chunkKind: SELLPIA_MANUAL_MATCH_CHUNK_KIND, payload: full, progress };
      }
      const rest = buffer.flush();
      if (rest) yield { chunkKind: SELLPIA_MANUAL_MATCH_CHUNK_KIND, payload: rest, progress };
    } finally {
      await site.closeManualMatch();
    }
  },
};

registerCollector(sellpiaManualMatchCollector);
