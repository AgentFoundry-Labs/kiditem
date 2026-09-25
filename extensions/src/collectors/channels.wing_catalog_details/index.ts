import type {
  CoupangCatalogDetailProductV1,
  WingCatalogDeletionConfirmationItem,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { WING_CATALOG_CHUNK_KINDS, WING_CATALOG_DETAILS_KIND } from '@kiditem/shared/coupang-catalog-snapshot';
import { RuntimeError, isRuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, Collector } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 Wing에서 쓰는 것(`sites/wing`이 구현, 입구가 넘긴다). */
export interface WingCatalogDetailsSite {
  /** 상품 상세 하나. Wing에 그 상품이 없으면(404) null. */
  productDetail(externalProductId: string): Promise<CoupangCatalogDetailProductV1 | null>;
  /** 사라진 상품 최대 100개의 삭제 여부. 입력 순서대로 하나씩 돌려준다. */
  probeDeleted(externalProductIds: readonly string[]): Promise<WingCatalogDeletionConfirmationItem[]>;
}

export interface WingCatalogDetailsPlan {
  channelAccountId: string;
  detailTargetProductIds: string[];
  absentProductIds: string[];
}

const DETAILS_PER_CHUNK = 20;
/** 상세 하나가 상품 상한(512KiB)이나 청크 상한(1MiB)을 넘었다 — 그 상품만 건너뛴다. */
const TOO_LARGE_CODES = new Set(['WING_CATALOG_PAYLOAD_TOO_LARGE', 'RUNTIME_CHUNK_TOO_LARGE']);

/**
 * 받지 못한 상세 하나. `not_found`(404)·`too_large`(상한 초과), 또는 다시 물어도 2xx JSON이 아니었던 것 —
 * `not_json`·`http_<status>`·`network`(연결 끊김·시간 초과). 요청 실패에는 응답 본문 앞 120자(`bodyHead`)를 붙인다.
 */
export type MissingDetail =
  | { externalProductId: string; reason: 'not_found' | 'too_large' }
  | { externalProductId: string; reason: 'not_json' | `http_${number}` | 'network'; bodyHead: string | null };

export const CATALOG_DETAILS_UNREACHABLE = 'CATALOG_DETAILS_UNREACHABLE' as const;
/** 상세 요청이 연달아 이만큼 실패하면 한 건의 일시 오류가 아니라 Wing에 닿지 못하는 것으로 보고 멈춘다. */
const MAX_CONSECUTIVE_DETAIL_FAILURES = 10;
const PROBE_BATCH = 100;

/**
 * `channels.wing_catalog_details`(KID-354·351 작업 ①·③): 서버 plan이 정한 대상만 상세를 받아 `full_details`로,
 * 목록에서 사라진 상품은 100개씩 삭제 여부를 물어 `deletion_confirmation`으로 보낸다. 대상 계산·반영은 서버가 한다.
 * 상세가 없거나(404) 상한을 넘는 대상은 건너뛰고 사유를 progress에 남긴다 — 서버가 그 상품을 그대로 두어 다음
 * 동기화가 다시 잡는다.
 */
export const wingCatalogDetailsCollector: Collector<WingCatalogDetailsPlan, Record<string, unknown>, WingCatalogDetailsSite> = {
  kind: WING_CATALOG_DETAILS_KIND,
  site: 'wing',
  async *collect(plan, site, { signal }) {
    const targets = plan.detailTargetProductIds;
    const absent = plan.absentProductIds;
    const missing: MissingDetail[] = [];
    let consecutiveFailures = 0;
    let detailsDone = 0;
    let absentChecked = 0;
    const progress = () => ({
      detailsDone,
      detailTargets: targets.length,
      absentChecked,
      absentTotal: absent.length,
      detailsMissing: [...missing],
    });
    const details = new ChunkBuffer<CoupangCatalogDetailProductV1>({ maxItems: DETAILS_PER_CHUNK, label: 'Wing 상세 상품' });
    const chunk = (chunkKind: string, payload: unknown[]): CollectedChunk => ({ chunkKind, payload, progress: progress() });
    for (const externalProductId of targets) {
      if (signal.aborted) return;
      let product: CoupangCatalogDetailProductV1 | null;
      let full: CoupangCatalogDetailProductV1[] | null;
      try {
        product = await site.productDetail(externalProductId);
        consecutiveFailures = 0;
        if (!product) {
          missing.push({ externalProductId, reason: 'not_found' });
          continue;
        }
        full = details.push(product);
      } catch (error) {
        // 너무 큰 상세 하나가 동기화 전체를 영구히 실패시키지 않게 그 상품만 건너뛴다 — 서버는 그대로 두고 다음 동기화가
        // 다시 잡는다(progress에 사유를 남긴다).
        if (isRuntimeError(error) && TOO_LARGE_CODES.has(error.code)) {
          missing.push({ externalProductId, reason: 'too_large' });
          continue;
        }
        // 사이트가 다시 물어도 JSON을 주지 않은 상세 한 건(봇·레이트 페이지 등)도 건너뛴다 — 다음 목록이 다시 잡는다.
        // 연달아 실패하면 일시 오류가 아니므로 멈춘다. 로그인 만료는 그대로 멈춘다.
        if (isRuntimeError(error) && error.code === SITE_REQUEST_FAILED) {
          const bodyHead = typeof error.details?.bodyHead === 'string' ? error.details.bodyHead : null;
          missing.push({ externalProductId, reason: requestFailureReason(error.details), bodyHead });
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_DETAIL_FAILURES) {
            throw new RuntimeError(
              CATALOG_DETAILS_UNREACHABLE,
              `쿠팡 윙 상품 상세를 연속 ${consecutiveFailures}건 받지 못했습니다${bodyHead ? `: ${bodyHead}` : '.'}`,
              { consecutiveFailures, lastExternalProductId: externalProductId, lastBodyHead: bodyHead, lastStatus: error.details?.status ?? null },
              error,
            );
          }
          continue;
        }
        throw error;
      }
      detailsDone += 1;
      if (full) yield chunk(WING_CATALOG_CHUNK_KINDS.fullDetails, full);
    }
    const rest = details.flush();
    if (rest) yield chunk(WING_CATALOG_CHUNK_KINDS.fullDetails, rest);
    for (let offset = 0; offset < absent.length; offset += PROBE_BATCH) {
      if (signal.aborted) return;
      const confirmations = await site.probeDeleted(absent.slice(offset, offset + PROBE_BATCH));
      absentChecked += confirmations.length;
      yield chunk(WING_CATALOG_CHUNK_KINDS.deletionConfirmation, confirmations);
    }
  },
};

function requestFailureReason(details: Record<string, unknown> | null): 'not_json' | `http_${number}` | 'network' {
  if (details?.reason === 'not_json') return 'not_json';
  return typeof details?.status === 'number' ? `http_${details.status}` : 'network';
}

registerCollector(wingCatalogDetailsCollector);
