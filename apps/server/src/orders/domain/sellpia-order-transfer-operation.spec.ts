import { describe, expect, it } from 'vitest';
import { withOperatorConfirmation } from './orders-action-operation-input';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  readSellpiaTransferOperatorConfirmation,
  sellpiaTransferResult,
  sellpiaTransferScope,
  sellpiaTransferTransport,
  sameOrderNumbers,
  sellpiaTransferResendOf,
} from './sellpia-order-transfer-operation';

const SOURCE = '11111111-1111-4111-8111-111111111111';
const plan = { sourceOperationId: SOURCE, shopName: '아이스크림몰', transport: null, resendOf: null, fileName: 'a.xlsx', targetOrderNumbers: ['A-1', 'A-2', 'A-3'] };

function evidence(payload: Record<string, unknown>, sequence = 1): OperationStagedChunk {
  return {
    chunkKind: 'transfer_evidence',
    sequence,
    itemCount: 1,
    payload: [{ acceptedOrderNumbers: [], baselineRows: 10, afterRows: 13, mallMessage: null, ...payload }],
  };
}

describe('셀피아 전송 실행 규칙(KID-355 wave8b)', () => {
  it('scope는 원천 실행 id·판매처 이름만, 다른 칸은 거절', () => {
    expect(sellpiaTransferScope({ sourceOperationId: SOURCE, shopName: ' 온채널 ' })).toEqual({ sourceOperationId: SOURCE, shopName: '온채널' });
    expect(() => sellpiaTransferScope({ sourceOperationId: SOURCE, shopName: 'x', file: 'base64' })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('운송유형은 직배송 원천에만 있고 거기서는 필수다', () => {
    expect(sellpiaTransferTransport('orders.mall_orders', undefined)).toBeNull();
    expect(sellpiaTransferTransport('orders.coupang_directship', 'MILKRUN')).toBe('MILKRUN');
    expect(() => sellpiaTransferTransport('orders.mall_orders', 'SHIPMENT')).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(() => sellpiaTransferTransport('orders.coupang_directship', undefined)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(() => sellpiaTransferTransport('orders.coupang_reviews', undefined)).toThrow(expect.objectContaining({ code: 'ORDERS_TRANSFER_SOURCE_UNAVAILABLE' }));
  });

  it('접수 확인(submitted)은 받아들여진 번호와 대상 수를 result로 남긴다', () => {
    expect(sellpiaTransferResult([evidence({ outcome: 'submitted', acceptedOrderNumbers: ['A-2', 'A-1', 'A-1'] })], plan, null)).toEqual({
      outcome: 'submitted',
      acceptedOrderNumbers: ['A-2', 'A-1'],
      targetOrderCount: 3,
    });
  });

  it('대상 밖 번호가 받아들여졌다고 오면 거절한다(자동송장이 대상 밖을 채번하지 않게)', () => {
    expect(() => sellpiaTransferResult([evidence({ outcome: 'submitted', acceptedOrderNumbers: ['Z-9'] })], plan, null))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('확인 못 한 전송(unknown·not_submitted)은 성공 finish로 받지 않는다', () => {
    expect(() => sellpiaTransferResult([evidence({ outcome: 'unknown', acceptedOrderNumbers: ['A-1'] })], plan, null))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(() => sellpiaTransferResult([evidence({ outcome: 'not_submitted' })], plan, null))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('증거 청크는 정확히 하나다', () => {
    expect(() => sellpiaTransferResult([], plan, null)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    const one = evidence({ outcome: 'submitted' });
    expect(() => sellpiaTransferResult([one, evidence({ outcome: 'submitted' }, 2)], plan, null)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('운영자 확인: 번호를 주면 그 번호, 안 주면 대상 전부가 받아들여진 것이다', () => {
    const unknown = [evidence({ outcome: 'unknown', acceptedOrderNumbers: ['A-1'] })];
    expect(sellpiaTransferResult(unknown, plan, { acceptedOrderNumbers: ['A-3'] }).acceptedOrderNumbers).toEqual(['A-3']);
    expect(sellpiaTransferResult(unknown, plan, {}).acceptedOrderNumbers).toEqual(['A-1', 'A-2', 'A-3']);
    expect(() => sellpiaTransferResult(unknown, plan, { acceptedOrderNumbers: ['Z-9'] })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('운영자 확인은 확인 서비스가 붙인 표시에서만 읽고, 확장 finish result의 같은 이름 칸은 버린다', () => {
    expect(readSellpiaTransferOperatorConfirmation(null)).toBeNull();
    expect(readSellpiaTransferOperatorConfirmation({ outcome: 'unknown' })).toBeNull();
    expect(readSellpiaTransferOperatorConfirmation({ operatorConfirmation: {} })).toBeNull();
    expect(readSellpiaTransferOperatorConfirmation(JSON.parse(JSON.stringify(withOperatorConfirmation({}))))).toBeNull();
    expect(readSellpiaTransferOperatorConfirmation({ outcome: 'unknown', ...withOperatorConfirmation({ acceptedOrderNumbers: ['A-1'] }) }))
      .toEqual({ acceptedOrderNumbers: ['A-1'] });
    expect(() => readSellpiaTransferOperatorConfirmation(withOperatorConfirmation({ acceptedOrderNumbers: 'A-1' })))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('다시 만든 파일의 번호가 plan과 같은지는 순서와 무관하게 본다', () => {
    expect(sameOrderNumbers(['A-2', 'A-1'], ['A-1', 'A-2'])).toBe(true);
    expect(sameOrderNumbers(['A-1'], ['A-1', 'A-2'])).toBe(false);
  });

  it('같은 원천의 성공 전송이 있으면 재전송 표시(resend) 없이는 거절하고, 있으면 그 실행 id를 resendOf로 남긴다', () => {
    const previous = '55555555-5555-4555-8555-555555555555';
    expect(sellpiaTransferResendOf(null, undefined)).toBeNull();
    expect(sellpiaTransferResendOf(null, true)).toBeNull();
    expect(sellpiaTransferResendOf(previous, true)).toBe(previous);
    expect(() => sellpiaTransferResendOf(previous, undefined)).toThrow(expect.objectContaining({ code: 'ORDERS_TRANSFER_ALREADY_SENT' }));
    expect(() => sellpiaTransferResendOf(previous, false)).toThrow(expect.objectContaining({ code: 'ORDERS_TRANSFER_ALREADY_SENT' }));
  });
});
