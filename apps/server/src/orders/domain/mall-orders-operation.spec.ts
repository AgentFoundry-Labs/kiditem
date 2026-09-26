import { describe, expect, it } from 'vitest';
import { icecreamContinuation, mallOrdersCapture, readMallOrdersPlan } from './mall-orders-operation';

const plan = (patch: Record<string, unknown> = {}) => readMallOrdersPlan({
  channelAccountId: '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11',
  mallKey: 'icecream-mall',
  mallName: '아이스크림몰',
  collectionDate: '2026-09-10',
  collectionMode: 'browser',
  ...patch,
});
const chunk = (chunkKind: string, sequence: number, payload: unknown[]) => ({ chunkKind, sequence, itemCount: payload.length, payload });

describe('mall orders capture rules (KID-359 H3)', () => {
  it('아이스크림몰 continuation: 보관 캡처에서 화면이 쓰는 칸만 돌려준다(몰이 준 파일 이름 등은 내지 않는다)', () => {
    const bytes = Buffer.from(JSON.stringify({
      headers: ['주문번호', '배송번호', '배송순번'],
      rows: [['selected-1', 'delivery-1', '1']],
      originalRows: [['seen-1', 'delivery-0', '1'], ['selected-1', 'delivery-1', '1']],
      selectedRows: [['selected-1', 'delivery-1', '1']],
      selectedRowKeys: ['selected-1\u001fdelivery-1\u001f1'],
      selectionMode: 'automatic',
      fileName: 'provider-private-name',
    }));
    expect(icecreamContinuation('icecream-mall', bytes)).toEqual({
      mallKey: 'icecream-mall',
      headers: ['주문번호', '배송번호', '배송순번'],
      originalRows: [['seen-1', 'delivery-0', '1'], ['selected-1', 'delivery-1', '1']],
      selectedRows: [['selected-1', 'delivery-1', '1']],
      selectedRowKeys: ['selected-1\u001fdelivery-1\u001f1'],
      selectionMode: 'automatic',
      sourceRows: 1,
    });
    expect(() => icecreamContinuation('kidsnote', bytes)).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'continuation_unsupported' }) }));
    expect(() => icecreamContinuation('icecream-mall', Buffer.from('{"headers":[]}'))).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'continuation_unavailable' }) }));
  });

  it('아이스크림몰 캡처: 수동 선택은 모든 행, 행이 있는데 머리글이 없으면 거절, 한 continuation만 받는다', () => {
    const manual = mallOrdersCapture(plan(), [chunk('order_rows', 1, [['A', ' 1 '], ['B', '2']]), chunk('continuation', 1, [{ headers: ['h1', 'h2'] }])]);
    expect(manual.captured).toBe(2);
    expect(JSON.parse(manual.source.bytes.toString('utf8'))).toMatchObject({ selectionMode: 'manual', selectedRowKeys: ['A\u001f1', 'B\u001f2'] });
    expect(() => mallOrdersCapture(plan(), [chunk('order_rows', 1, [['A']])]))
      .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'continuation_missing' }) }));
    expect(() => mallOrdersCapture(plan(), [chunk('continuation', 1, [{ headers: ['h'] }]), chunk('continuation', 2, [{ headers: ['h'] }])]))
      .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'unexpected_chunk_kind' }) }));
  });

  it('키즈노트 캡처: 옛 변환 본문 {orders} 그대로 보관하고 주문번호(ono)를 센다, 주문번호·품목이 없는 원소는 거절', () => {
    const order = (ono: string) => ({ ono, orderedAt: '2026-09-10 10:00:00', buyer: '박영희', receiver: '행복유치원', items: [{ productName: '색종이', qty: 1, option: '', shipFee: 0 }] });
    const capture = mallOrdersCapture(plan({ mallKey: 'kidsnote', mallName: '키즈노트' }), [chunk('order_rows', 1, [order('20260910-1'), order('20260910-2')])]);
    expect(capture.captured).toBe(2);
    expect(capture.orderNumbers).toEqual(['20260910-1', '20260910-2']);
    expect(capture.source.contentType).toBe('application/json');
    expect(JSON.parse(capture.source.bytes.toString('utf8'))).toEqual({ orders: [order('20260910-1'), order('20260910-2')] });
    expect(() => mallOrdersCapture(plan({ mallKey: 'kidsnote', mallName: '키즈노트' }), [chunk('order_rows', 1, [{ ono: 'x' }])]))
      .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'invalid_order_rows' }) }));
  });
});
