import { describe, expect, it } from 'vitest';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import { coupangShipmentListPlan, coupangShipmentListResult } from './coupang-shipment-list-operation';

const rows = (payload: unknown[], sequence = 1): OperationStagedChunk => ({ chunkKind: 'shipment_rows', sequence, itemCount: payload.length, payload });
const row = (seq: string, center = '안성', boxes = 1) => ({ seq, center, outbound: '2026-09-29', boxes, status: null });

describe('쿠팡 배송 목록 실행 규칙(KID-355 wave8b)', () => {
  it('plan은 발송일과 쪽 상한 60이다', () => {
    expect(coupangShipmentListPlan({ date: '2026-09-29' })).toEqual({ date: '2026-09-29', maxPages: 60 });
    expect(() => coupangShipmentListPlan({ date: '2026-9-29' })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('seq 중복은 처음 행 하나, 쪽 수·멈춘 이유는 finish result에서 읽는다', () => {
    const result = coupangShipmentListResult(
      [rows([row('S-1'), row('S-2', '천안')]), rows([row('S-1', '안성', 9)], 2)],
      { date: '2026-09-29', maxPages: 60 },
      { scannedPages: 3, stopReason: 'past_date_block' },
    );
    expect(result).toEqual({ date: '2026-09-29', shipments: [row('S-1'), row('S-2', '천안')], scannedPages: 3, stopReason: 'past_date_block' });
  });

  it('다른 발송일 행, 쪽 상한을 넘은 쪽 수, 빠진 finish result는 거절한다', () => {
    const plan = { date: '2026-09-29', maxPages: 60 };
    const scan = { scannedPages: 1, stopReason: 'short_page' };
    expect(() => coupangShipmentListResult([rows([{ ...row('S-1'), outbound: '2026-09-28' }])], plan, scan)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(() => coupangShipmentListResult([], plan, { scannedPages: 61, stopReason: 'max_pages' })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(() => coupangShipmentListResult([], plan, null)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });
});
