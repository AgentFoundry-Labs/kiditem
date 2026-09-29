import { describe, expect, it } from 'vitest';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import { sellpiaPostTransferResult } from './sellpia-post-transfer-operation';

const steps = (payload: unknown[], sequence = 1): OperationStagedChunk => ({ chunkKind: 'post_transfer_steps', sequence, itemCount: payload.length, payload });

describe('셀피아 후처리 실행 result(KID-355 wave8b)', () => {
  it('등록·재고매칭 단계와 매칭 안 된 번호, 자동송장 대상 수를 남긴다', () => {
    const result = sellpiaPostTransferResult([
      steps([{ step: 'register', done: true, mallMessage: null }]),
      steps([{ step: 'stockmatch', done: true, mallMessage: '완료', unmatchedOrderNumbers: ['A-1', 'A-1', 'B-2'] }], 2),
    ], 7);
    expect(result).toEqual({ registered: true, stockMatched: true, unmatchedOrderNumbers: ['A-1', 'B-2'], invoiceTargetCount: 7 });
  });

  it('없는 단계는 하지 않은 것이다', () => {
    expect(sellpiaPostTransferResult([steps([{ step: 'register', done: false, mallMessage: '대기 없음' }])], 0))
      .toEqual({ registered: false, stockMatched: false, unmatchedOrderNumbers: [], invoiceTargetCount: 0 });
  });

  it('다른 청크나 모양이 틀린 단계는 거절한다', () => {
    expect(() => sellpiaPostTransferResult([{ ...steps([]), chunkKind: 'x' }], 0)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(() => sellpiaPostTransferResult([steps([{ step: 'invoice', done: true, mallMessage: null }])], 0)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });
});
