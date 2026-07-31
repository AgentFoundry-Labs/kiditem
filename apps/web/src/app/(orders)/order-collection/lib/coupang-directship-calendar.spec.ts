import { describe, expect, it } from 'vitest';
import {
  buildDirectshipEddCalendar,
  directshipIntakeWindow,
  filterPosByEdd,
} from './coupang-directship-calendar';
import type { CoupangDirectPo } from './coupang-directship-api';

// 2026-07-28 화 / 07-29 수 / 07-30 목 / 07-31 금 / 08-01 토 / 08-02 일 / 08-03 월 / 08-04 화
describe('directshipIntakeWindow', () => {
  it('takes Tuesday intake through that Friday', () => {
    expect(directshipIntakeWindow('2026-07-28')).toEqual({
      intakeDate: '2026-07-28',
      intakeWeekday: '화',
      from: '2026-07-28',
      to: '2026-07-31',
    });
  });

  it('takes Thursday intake through the next Tuesday', () => {
    expect(directshipIntakeWindow('2026-07-30')).toEqual({
      intakeDate: '2026-07-30',
      intakeWeekday: '목',
      from: '2026-07-30',
      to: '2026-08-04',
    });
  });

  it.each([
    // 접수일이 아닌 날에 열면 다가오는 회차를 띄운다.
    ['2026-07-29', '2026-07-30', '목'], // 수: 화가 지났으니 목
    ['2026-07-31', '2026-08-04', '화'], // 금: 목이 지났으니 다음 화
    ['2026-08-01', '2026-08-04', '화'], // 토 → 다음 화
    ['2026-08-02', '2026-08-04', '화'], // 일 → 다음 화
    ['2026-08-03', '2026-08-04', '화'], // 월 → 다음 화
  ])('shows the upcoming intake day for %s', (today, intakeDate, weekday) => {
    const w = directshipIntakeWindow(today);
    expect(w.intakeDate).toBe(intakeDate);
    expect(w.intakeWeekday).toBe(weekday);
  });
});

function po(seq: string, transport: string, edd: string, qtys: number[]): CoupangDirectPo {
  return {
    seq,
    status: 'PA',
    center: '인천36',
    transport,
    edd,
    reg: '2026-07-28',
    items: qtys.map((qty, i) => ({
      skuId: `${seq}-${i}`, barcode: '', name: `상품${i}`, qty, amount: qty * 100,
    })),
  } as CoupangDirectPo;
}

describe('buildDirectshipEddCalendar', () => {
  const pos = [
    po('PO-1', 'MILKRUN', '2026-07-31', [2, 3]),
    po('PO-2', 'MILKRUN', '2026-07-31', [5]),
    po('PO-3', 'SHIPMENT', '2026-07-31', [1]),
    po('PO-4', 'MILKRUN', '2026-08-04', [4]),
  ];

  it('groups by delivery date and keeps transports apart', () => {
    const milkrun = buildDirectshipEddCalendar(pos, 'MILKRUN');
    expect(milkrun['2026-07-31']).toMatchObject({ poCount: 2, itemCount: 3, qty: 10 });
    expect(milkrun['2026-08-04']).toMatchObject({ poCount: 1, itemCount: 1, qty: 4 });
    expect(buildDirectshipEddCalendar(pos, 'SHIPMENT')['2026-07-31'])
      .toMatchObject({ poCount: 1, qty: 1 });
  });

  it('separates already-collected orders so only the pending ones remain', () => {
    const cells = buildDirectshipEddCalendar(pos, 'MILKRUN', {
      collectedSeqs: new Set(['PO-1']),
    });
    expect(cells['2026-07-31']).toMatchObject({
      poCount: 2,
      collectedPoCount: 1,
      pendingPoCount: 1,
    });
  });

  it('marks which delivery dates fall in this intake round', () => {
    const cells = buildDirectshipEddCalendar(pos, 'MILKRUN', {
      window: directshipIntakeWindow('2026-07-30'), // 목 → 08-04 까지
    });
    expect(cells['2026-07-31']?.inWindow).toBe(true);
    expect(cells['2026-08-04']?.inWindow).toBe(true);
  });

  it('counts urgent orders for the red marker', () => {
    const urgent = { ...po('PO-U', 'MILKRUN', '2026-07-31', [1]), urgent: true };
    const cells = buildDirectshipEddCalendar([...pos, urgent], 'MILKRUN');
    expect(cells['2026-07-31']?.urgentCount).toBe(1);
  });

  it('combines both transports when no transport is given', () => {
    const cells = buildDirectshipEddCalendar(pos, null);
    expect(cells['2026-07-31']).toMatchObject({
      poCount: 3,
      byTransport: { SHIPMENT: 1, MILKRUN: 2 },
    });
  });

  it('skips orders without a delivery date', () => {
    expect(buildDirectshipEddCalendar([po('PO-9', 'MILKRUN', '', [1])], 'MILKRUN'))
      .toEqual({});
  });
});

describe('filterPosByEdd', () => {
  it('keeps only the selected delivery dates of one transport', () => {
    const pos = [
      po('PO-1', 'MILKRUN', '2026-07-31', [1]),
      po('PO-2', 'MILKRUN', '2026-08-04', [1]),
      po('PO-3', 'SHIPMENT', '2026-07-31', [1]),
    ];
    expect(filterPosByEdd(pos, 'MILKRUN', ['2026-07-31']).map((p) => p.seq))
      .toEqual(['PO-1']);
  });
});
