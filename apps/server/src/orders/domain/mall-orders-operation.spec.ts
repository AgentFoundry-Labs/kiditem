import { describe, expect, it } from 'vitest';
import { icecreamContinuation, mallOrdersCapture, mallOrdersScope, readMallOrdersPlan } from './mall-orders-operation';

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

  it('온채널 캡처: 옛 변환 본문 {orders} 그대로(상세를 못 읽은 주문도) 보관하고 주문코드(orderCode)를 센다, 주문코드 없는 원소는 거절', () => {
    const onch = plan({ mallKey: 'onch', mallName: '온채널' });
    const orders = [
      { orderCode: 'OC-2', date: '2026-09-10 14:00:00', productName: '색종이', qty: 2, productPrice: 12000, shippingFee: 3000 },
      { orderCode: 'OC-1', date: '2026-09-10 09:30:00' },
    ];
    const capture = mallOrdersCapture(onch, [chunk('order_rows', 1, orders)]);
    expect(capture.captured).toBe(2);
    expect(capture.orderNumbers).toEqual(['OC-2', 'OC-1']);
    expect(JSON.parse(capture.source.bytes.toString('utf8'))).toEqual({ orders });
    expect(() => mallOrdersCapture(onch, [chunk('order_rows', 1, [{ date: '2026-09-10' }])]))
      .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'invalid_order_rows' }) }));
  });

  it('해법몰 캡처: 상품행을 옛 변환 본문 {orders}로 보관하고 서로 다른 주문번호(orderNo)를 센다, 주문번호 없는 원소는 거절', () => {
    const haebub = plan({ mallKey: 'haebub-mall', mallName: '해법몰' });
    const rows = [
      { orderNo: '1001', regNo: 'B-1', productName: '색종이', qty: 2, sellAmount: 10000, shipFee: 2000 },
      { orderNo: '1001', regNo: 'B-2', productName: '풀', qty: 1, sellAmount: 1000, shipFee: 0 },
      { orderNo: '1002', regNo: 'B-3', productName: '크레파스', qty: 1, sellAmount: 3000, shipFee: 3000 },
    ];
    const capture = mallOrdersCapture(haebub, [chunk('order_rows', 1, rows)]);
    expect(capture.captured).toBe(3);
    expect(capture.orderNumbers).toEqual(['1001', '1002']);
    expect(JSON.parse(capture.source.bytes.toString('utf8'))).toEqual({ orders: rows });
    expect(() => mallOrdersCapture(haebub, [chunk('order_rows', 1, [{ regNo: 'B-1' }])]))
      .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'invalid_order_rows' }) }));
  });
  it('수동 업로드(KID-380 T4): 올린 파일 조각을 이어 그 파일 그대로(이름·확장자 형식) 보관한다 — 아이스크림몰도 행이 아니라 파일이다', () => {
    const upload = plan({ collectionMode: 'manual-upload', collectionDate: null });
    const bytes = Buffer.from('주문번호\tqty\nA\t1\n', 'utf8').toString('base64');
    const capture = mallOrdersCapture(upload, [
      chunk('order_rows', 2, [{ fileName: '배송목록.xlsx', part: 1, parts: 2, base64: bytes.slice(8) }]),
      chunk('order_rows', 1, [{ fileName: '배송목록.xlsx', part: 0, parts: 2, base64: bytes.slice(0, 8) }]),
    ]);
    expect(capture.captured).toBe(1);
    expect(capture.source).toEqual({
      bytes: Buffer.from('주문번호\tqty\nA\t1\n', 'utf8'),
      fileName: '배송목록.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const csv = mallOrdersCapture(plan({ mallKey: 'domeggook', mallName: '도매꾹', collectionMode: 'manual-upload', collectionDate: null }), [
      chunk('order_rows', 1, [{ fileName: 'ORDER.csv', part: 0, parts: 1, base64: 'YQ==' }]),
    ]);
    expect(csv.source.contentType).toBe('text/csv');
    expect(() => mallOrdersCapture(upload, [chunk('continuation', 1, [{ headers: ['h'] }])]))
      .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'unexpected_chunk_kind' }) }));
    expect(() => mallOrdersCapture(upload, []))
      .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'upload_file_missing' }) }));
  });

  it('수동 업로드 scope: 옛 업로드 화면이 받던 몰(도매꾹·GS샵·아이스크림몰)만, 다른 몰은 VALIDATION_FAILED(manual_upload_unsupported)', () => {
    const scope = (mallKey: string) => ({
      channelAccountId: '5F0C2F7E-7A9E-4F3F-9D61-0A4B2B8F1C11',
      mallKey,
      collectionDate: null,
      collectionMode: 'manual-upload',
    });
    for (const mallKey of ['domeggook', 'gs-shop', 'icecream-mall']) {
      expect(mallOrdersScope(scope(mallKey))).toMatchObject({ mallKey, collectionMode: 'manual-upload', channelAccountId: '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11' });
    }
    expect(() => mallOrdersScope(scope('kidkids')))
      .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'manual_upload_unsupported' }) }));
  });
});
