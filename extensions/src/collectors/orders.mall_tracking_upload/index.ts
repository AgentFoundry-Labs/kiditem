import {
  MALL_TRACKING_UPLOAD_CHUNK_KIND,
  MALL_TRACKING_UPLOAD_KIND,
  MallTrackingUploadPlanSchema,
  type MallTrackingUploadPlan,
  type MallTrackingUploadResult,
  type MallTrackingUploadRow,
  type MallTrackingUploadRowResult,
} from '@kiditem/shared/orders-action-operations';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, CollectFinish, Collector } from '../collector';
import { registerCollector } from '../index';

/** 몰 한 곳의 업로더(`sites/<mall>/tracking-upload.ts`). `confirmedByMall`: 몰이 행마다 받았다고 답했는가. */
export interface MallTrackingUploader {
  uploadTracking(rows: readonly MallTrackingUploadRow[]): Promise<{ rows: MallTrackingUploadRowResult[]; confirmedByMall: boolean }>;
}

/** 이 수집기가 쓰는 사이트: 몰 키 → 그 몰 업로더(`sites/mall-tracking`이 업로드를 받는 몰만 찾아 준다). */
export interface MallTrackingUploadSite {
  uploader(mallKey: string): Partial<MallTrackingUploader> | null;
}

type UploadResult = MallTrackingUploadResult & Record<string, unknown>;

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
const CHUNK_ROWS = 500;

/**
 * `orders.mall_tracking_upload`(KID-366 wave8b, 옛 워커의 온채널·키드키즈 송장 업로드 액션 — kind 하나, 몰 차이는 site
 * 어댑터). owner plan이 셀피아 송장 조회 캡처에서 고른 그 몰 행을 운영자 몰 탭에서 올린다. 행 결과는 `upload_results` 청크,
 * 상태별 합계는 result. 몰이 제출만 확인해 주면(키드키즈 출고완료 — 성공 코드 없음) `reconciling`으로 멈춘다.
 */
export const mallTrackingUploadCollector: Collector<MallTrackingUploadPlan, UploadResult, MallTrackingUploadSite> = {
  kind: MALL_TRACKING_UPLOAD_KIND,
  site: 'mall-tracking',
  async *collect(rawPlan, site): AsyncGenerator<CollectedChunk, CollectFinish<UploadResult>, undefined> {
    const parsed = MallTrackingUploadPlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '송장 업로드 계획이 올바르지 않습니다.', { kind: MALL_TRACKING_UPLOAD_KIND, mallKey: null });
    const plan = parsed.data;
    const uploader = site?.uploader(plan.mallKey) ?? null;
    if (!uploader?.uploadTracking) {
      throw new RuntimeError(RUNTIME_PLAN_INVALID, `이 확장에 ${plan.mallKey} 송장 업로드 모듈이 없습니다.`, { kind: MALL_TRACKING_UPLOAD_KIND, mallKey: plan.mallKey });
    }
    const { rows, confirmedByMall } = await uploader.uploadTracking(plan.rows);
    const count = (status: MallTrackingUploadRowResult['status']) => rows.filter((row) => row.status === status).length;
    const totals = { uploaded: count('uploaded'), alreadyUploaded: count('already_uploaded'), notInList: count('not_in_list'), failed: count('failed') };
    const buffer = new ChunkBuffer<MallTrackingUploadRowResult>({ maxItems: CHUNK_ROWS, label: '송장 업로드 결과 한 줄' });
    for (const row of rows) {
      const full = buffer.push(row);
      if (full) yield { chunkKind: MALL_TRACKING_UPLOAD_CHUNK_KIND, payload: full, progress: totals };
    }
    const rest = buffer.flush();
    if (rest) yield { chunkKind: MALL_TRACKING_UPLOAD_CHUNK_KIND, payload: rest, progress: totals };
    const result: UploadResult = { ...totals, rows };
    return confirmedByMall ? { result } : { outcome: 'reconciling', result };
  },
};

registerCollector(mallTrackingUploadCollector);
