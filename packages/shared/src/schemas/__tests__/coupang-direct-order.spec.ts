import { describe, expect, it } from 'vitest';
import { CoupangDirectOrderCollectionRequestSchema } from '../coupang-direct-order';

const CHANNEL_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function validRequest() {
  return {
    channelAccountId: CHANNEL_ACCOUNT_ID,
    pos: [
      {
        seq: 'PO-1',
        status: 'PA',
        center: '덕평센터',
        transport: 'SHIPMENT',
        edd: '2026-07-20',
        reg: '2026-07-18T00:00:00.000Z',
        items: [
          {
            skuId: 'SKU-1',
            barcode: '880000000001',
            name: '상품 1',
            qty: 10,
            amount: 12_000,
          },
        ],
      },
    ],
    centers: {
      덕평센터: {
        addr: '경기도 이천시',
        zip: '12345',
        contact: '010-0000-0000',
      },
    },
    transport: 'SHIPMENT',
  };
}

describe('CoupangDirectOrderCollectionRequestSchema', () => {
  it('accepts PA and 발주확정 purchase orders', () => {
    const pa = validRequest();
    expect(CoupangDirectOrderCollectionRequestSchema.parse(pa)).toEqual(pa);

    const confirmed = validRequest();
    confirmed.pos[0]!.status = '발주확정';
    expect(CoupangDirectOrderCollectionRequestSchema.parse(confirmed)).toEqual(
      confirmed,
    );
  });

  it.each([
    ['empty seq', (request: ReturnType<typeof validRequest>) => {
      request.pos[0]!.seq = ' ';
    }],
    ['empty skuId', (request: ReturnType<typeof validRequest>) => {
      request.pos[0]!.items[0]!.skuId = '';
    }],
    ['negative quantity', (request: ReturnType<typeof validRequest>) => {
      request.pos[0]!.items[0]!.qty = -1;
    }],
  ])('rejects %s', (_label, mutate) => {
    const request = validRequest();
    mutate(request);
    expect(() => CoupangDirectOrderCollectionRequestSchema.parse(request)).toThrow();
  });

  it('rejects duplicate (seq, skuId) lines', () => {
    const request = validRequest();
    request.pos[0]!.items.push({
      ...request.pos[0]!.items[0]!,
      name: '중복 상품명',
    });

    expect(() => CoupangDirectOrderCollectionRequestSchema.parse(request)).toThrow(
      /duplicate/i,
    );
  });

  it('rejects unknown order statuses', () => {
    const request = validRequest();
    request.pos[0]!.status = 'READY';

    expect(() => CoupangDirectOrderCollectionRequestSchema.parse(request)).toThrow();
  });

  // 확장 수집 원본에서 흔한 빈 정보 필드는 데이터 무결성과 무관하므로 흡수한다.
  it('absorbs blank informational fields (null center fields, blank edd)', () => {
    const request = validRequest();
    request.centers.덕평센터 = { addr: null, zip: null, contact: null } as never;
    request.pos[0]!.edd = '';

    const parsed = CoupangDirectOrderCollectionRequestSchema.parse(request);
    expect(parsed.centers.덕평센터).toEqual({});
    expect(parsed.pos[0]!.edd).toBe('');
    // 식별자·수량·품목은 그대로 유지된다.
    expect(parsed.pos[0]!.items).toHaveLength(1);
  });

  it('allows a purchase order whose item details failed to collect (empty items)', () => {
    const request = validRequest();
    request.pos[0]!.items = [];

    const parsed = CoupangDirectOrderCollectionRequestSchema.parse(request);
    expect(parsed.pos[0]!.items).toEqual([]);
  });
});
