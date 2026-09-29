import { describe, expect, it } from 'vitest';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import { sellpiaOrderSnapshotResult } from './sellpia-order-snapshot-operation';

const rows = (payload: unknown[], sequence = 1): OperationStagedChunk => ({ chunkKind: 'snapshot_rows', sequence, itemCount: payload.length, payload });
const row = (orderNo: string, source: 'pending' | 'stockmatch') => ({ orderNo, receiver: '가', provider: '온채널', source });

describe('셀피아 주문 스냅샷 result(KID-355 wave8b)', () => {
  it('두 화면의 주문을 주문번호로 합치고(먼저 온 행), finish result의 partial을 싣는다', () => {
    const result = sellpiaOrderSnapshotResult(
      [rows([row('A-1', 'pending'), row('B-2', 'pending')]), rows([row('A-1', 'stockmatch'), row('C-3', 'stockmatch')], 2)],
      { partial: true },
    );
    expect(result).toEqual({ orderCount: 3, rows: [row('A-1', 'pending'), row('B-2', 'pending'), row('C-3', 'stockmatch')], partial: true });
  });

  it('finish result가 없으면 partial은 false, 빈 스냅샷도 성공이다', () => {
    expect(sellpiaOrderSnapshotResult([], null)).toEqual({ orderCount: 0, rows: [], partial: false });
  });

  it('상한 1만 행을 넘으면 거절한다(잘라 버리지 않는다)', () => {
    const many = Array.from({ length: 10_001 }, (_, index) => row(`N-${index}`, 'pending'));
    expect(() => sellpiaOrderSnapshotResult([rows(many)], null)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });
});
