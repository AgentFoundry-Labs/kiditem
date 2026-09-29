import {
  SELLPIA_POST_TRANSFER_CHUNK_KIND,
  SELLPIA_POST_TRANSFER_KIND,
  SellpiaPostTransferScopeSchema,
  type SellpiaPostTransferResult,
  type SellpiaPostTransferScope,
  type SellpiaPostTransferStep,
} from '@kiditem/shared/orders-action-operations';
import { RuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish, Collector } from '../collector';
import { registerCollector } from '../index';

/** 후처리 한 번의 운영자 탭(`sites/sellpia` `post-transfer.ts`). 단계 실패는 던진다. */
export interface SellpiaPostTransferSession {
  register(): Promise<{ registered: number | null; message: string | null }>;
  stockmatch(): Promise<{ matched: number; unmatchedOrderNumbers: string[]; message: string | null }>;
  done(): Promise<void>;
}

export interface SellpiaPostTransferSite {
  openPostTransfer(): Promise<SellpiaPostTransferSession>;
}

type PostTransferResult = SellpiaPostTransferResult & Record<string, unknown>;

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;

const messageOf = (error: unknown): string | null => (error instanceof Error && error.message ? error.message.slice(0, 500) : null);

/**
 * `orders.sellpia_post_transfer`(KID-366 wave8b, 옛 `sellpiaPostTransfer`): 운영자 셀피아 탭에서 [등록] → 재고매칭 화면
 * [조회]·자동합포·자동재고매칭(화면 전체, 옛 규칙). 단계마다 `post_transfer_steps` 청크 하나를 내고, 실패한 단계도 `done:false`로
 * 남긴 뒤 그 오류로 실패한다(다음 단계는 하지 않는다). `invoiceTargetCount`는 owner finalize가 자동송장 대상 규칙으로 센다 —
 * 확장은 0을 싣는다.
 */
export const sellpiaPostTransferCollector: Collector<SellpiaPostTransferScope, PostTransferResult, SellpiaPostTransferSite> = {
  kind: SELLPIA_POST_TRANSFER_KIND,
  site: 'sellpia',
  async *collect(rawPlan, site): AsyncGenerator<CollectedChunk, CollectFinish<PostTransferResult>, undefined> {
    if (!SellpiaPostTransferScopeSchema.safeParse(rawPlan ?? {}).success || !site) {
      throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 후처리 계획이 올바르지 않습니다.', { kind: SELLPIA_POST_TRANSFER_KIND });
    }
    const step = (payload: SellpiaPostTransferStep): CollectedChunk => ({ chunkKind: SELLPIA_POST_TRANSFER_CHUNK_KIND, payload: [payload], progress: { step: payload.step } });
    const session = await site.openPostTransfer();
    try {
      let registered: { message: string | null };
      try {
        registered = await session.register();
      } catch (error) {
        yield step({ step: 'register', done: false, mallMessage: messageOf(error) });
        throw error;
      }
      yield step({ step: 'register', done: true, mallMessage: registered.message });
      let matched: { unmatchedOrderNumbers: string[]; message: string | null };
      try {
        matched = await session.stockmatch();
      } catch (error) {
        yield step({ step: 'stockmatch', done: false, mallMessage: messageOf(error) });
        throw error;
      }
      yield step({ step: 'stockmatch', done: true, mallMessage: matched.message, unmatchedOrderNumbers: matched.unmatchedOrderNumbers });
      return { result: { registered: true, stockMatched: true, unmatchedOrderNumbers: matched.unmatchedOrderNumbers, invoiceTargetCount: 0 } };
    } finally {
      await session.done();
    }
  },
};

registerCollector(sellpiaPostTransferCollector);
