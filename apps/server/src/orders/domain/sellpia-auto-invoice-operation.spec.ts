import { describe, expect, it } from 'vitest';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  readSellpiaInvoiceOperatorConfirmation,
  sellpiaAutoInvoicePlan,
  sellpiaAutoInvoiceResult,
  sellpiaInvoiceIssued,
  sellpiaTransferAccepted,
} from './sellpia-auto-invoice-operation';

const plan = { targetOrderNumbers: ['A-1', 'A-2', 'A-3'] };
const rows = (payload: unknown[]): OperationStagedChunk => ({ chunkKind: 'invoice_rows', sequence: 1, itemCount: payload.length, payload });
const row = (orderNo: string, trackingNumber = `T-${orderNo}`) => ({ orderNo, trackingNumber, courier: 'CJ대한통운' });

describe('셀피아 자동송장 실행 규칙(KID-355 wave8b)', () => {
  it('대상이 없으면 시작하지 않는다', () => {
    expect(() => sellpiaAutoInvoicePlan([])).toThrow(expect.objectContaining({ code: 'ORDERS_SELLPIA_INVOICE_NO_TARGETS' }));
    expect(sellpiaAutoInvoicePlan(['A-1'])).toEqual({ targetOrderNumbers: ['A-1'] });
  });

  it('발급 행과 선택한 대상, 그리드에 없던 대상을 남긴다', () => {
    expect(sellpiaAutoInvoiceResult([rows([row('A-2'), row('A-1'), row('A-2')])], plan, null)).toEqual({
      issued: [row('A-2'), row('A-1')],
      selectedOrderNumbers: ['A-1', 'A-2', 'A-3'],
      notFoundOrderNumbers: ['A-3'],
    });
  });

  it('대상 밖 번호가 발급됐다고 오면 거절한다(대기 행 전체 채번 금지)', () => {
    expect(() => sellpiaAutoInvoiceResult([rows([row('Z-9')])], plan, null)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('운영자 확인은 그가 본 발급 행을 쓰고, 안 주면 확장이 읽은 행을 쓴다', () => {
    expect(sellpiaAutoInvoiceResult([], plan, { issued: [row('A-3')] }).issued).toEqual([row('A-3')]);
    expect(sellpiaAutoInvoiceResult([rows([row('A-1')])], plan, {}).issued).toEqual([row('A-1')]);
    expect(readSellpiaInvoiceOperatorConfirmation({ operatorConfirmation: {} })).toEqual({});
    expect(readSellpiaInvoiceOperatorConfirmation({ issued: [] })).toBeNull();
  });

  it('송장 result에서 빼는 번호는 실제 발급된 번호뿐이다 — 못 찾은 번호는 다시 대상이 된다', () => {
    expect(sellpiaInvoiceIssued({ issued: [row('A-1')], selectedOrderNumbers: ['A-1', 'A-2'], notFoundOrderNumbers: ['A-2'] }))
      .toEqual({ issuedOrderNumbers: ['A-1'] });
    expect(sellpiaInvoiceIssued({ broken: true })).toBeNull();
  });

  it('성공 전송 result에서 받아들여진 번호를 읽고, 모양이 틀리면 무시한다', () => {
    const at = new Date('2026-09-29T00:00:00Z');
    expect(sellpiaTransferAccepted({ outcome: 'submitted', acceptedOrderNumbers: ['A-1'], targetOrderCount: 2 }, at))
      .toEqual({ finishedAt: at, acceptedOrderNumbers: ['A-1'] });
    expect(sellpiaTransferAccepted({ rowCount: 3 }, at)).toBeNull();
  });
});
