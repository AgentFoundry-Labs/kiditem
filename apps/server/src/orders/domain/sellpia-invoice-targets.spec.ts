import { describe, expect, it } from 'vitest';
import { sellpiaInvoiceTargets } from './sellpia-invoice-targets';

const now = new Date('2026-09-29T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe('자동송장 대상 규칙 — 최근 24시간 성공 전송의 받아들여진 번호 − 이미 시도한 번호(KID-355 wave8b)', () => {
  it('24시간 안 전송만, 끝난 순서로, 같은 번호는 한 번만', () => {
    const targets = sellpiaInvoiceTargets({
      now,
      invoices: [],
      transfers: [
        { finishedAt: hoursAgo(2), acceptedOrderNumbers: ['B-2', ' A-1 '] },
        { finishedAt: hoursAgo(23), acceptedOrderNumbers: ['A-1', 'C-3'] },
        { finishedAt: hoursAgo(25), acceptedOrderNumbers: ['OLD-9'] },
      ],
    });
    expect(targets).toEqual(['A-1', 'C-3', 'B-2']);
  });

  it('송장이 발급된 번호는 다시 고르지 않고(비가역 보호), 그리드에 없어 못 찾은 번호는 24시간 안이면 다시 대상이다', () => {
    const targets = sellpiaInvoiceTargets({
      now,
      transfers: [{ finishedAt: hoursAgo(1), acceptedOrderNumbers: ['A-1', 'B-2', 'C-3'] }],
      // C-3은 앞 송장 실행에서 못 찾은 번호였다(issued에 없음) → 다시 대상
      invoices: [{ issuedOrderNumbers: ['B-2'] }, { issuedOrderNumbers: [' A-1 '] }],
    });
    expect(targets).toEqual(['C-3']);
  });

  it('대상이 없으면 빈 배열 — owner plan이 ORDERS_SELLPIA_INVOICE_NO_TARGETS로 거절할 근거', () => {
    expect(sellpiaInvoiceTargets({ now, transfers: [], invoices: [] })).toEqual([]);
    expect(sellpiaInvoiceTargets({ now, transfers: [{ finishedAt: hoursAgo(30), acceptedOrderNumbers: ['X'] }], invoices: [] })).toEqual([]);
  });

  it('미래 시각의 전송(시계 오차)은 대상에서 뺀다', () => {
    expect(sellpiaInvoiceTargets({ now, transfers: [{ finishedAt: hoursAgo(-1), acceptedOrderNumbers: ['F'] }], invoices: [] })).toEqual([]);
  });
});
