import type { CoupangDirectPo, CoupangTransport } from './coupang-directship-api';

/**
 * 쿠팡직배송 주문은 화요일·목요일에만 접수한다. 접수 요일에 따라 그 회차에서 처리할
 * 입고예정일 범위가 정해진다.
 *
 * - 화요일 접수 → 그 주 금요일까지 입고예정인 발주
 * - 목요일 접수 → 다음주 화요일까지 입고예정인 발주
 *
 * 기준일이 화·목이 아니면 다가오는 접수일의 회차로 본다. 목요일이 지나갔으면 다음 화요일,
 * 화요일이 지나갔으면 그 주 목요일이다. 지난 회차가 아니라 지금 준비할 회차를 띄운다.
 */
export interface DirectshipIntakeWindow {
  /** 회차 기준 접수일(화 또는 목) */
  intakeDate: string;
  intakeWeekday: '화' | '목';
  /** 입고예정일 하한(접수일 당일) */
  from: string;
  /** 입고예정일 상한(포함) */
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
}

function shift(ymd: string, days: number): string {
  return toYmd(new Date(parseYmd(ymd).getTime() + days * DAY_MS));
}

/** 다가오는 접수 회차(화/목)와, 그 회차가 처리할 입고예정일 범위. */
export function directshipIntakeWindow(today: string): DirectshipIntakeWindow {
  const dow = parseYmd(today).getDay(); // 0=일 … 2=화, 4=목
  // 다가오는 접수일까지 나아간다. 오늘이 화·목이면 오늘이 곧 그 회차다.
  const forwardTo = (target: number) => (target - dow + 7) % 7;
  const toTue = forwardTo(2);
  const toThu = forwardTo(4);
  const useTue = toTue <= toThu;
  const intakeDate = shift(today, useTue ? toTue : toThu);
  return useTue
    // 화요일 접수분은 그 주 금요일(+3)까지.
    ? { intakeDate, intakeWeekday: '화', from: intakeDate, to: shift(intakeDate, 3) }
    // 목요일 접수분은 다음주 화요일(+5)까지.
    : { intakeDate, intakeWeekday: '목', from: intakeDate, to: shift(intakeDate, 5) };
}

export interface DirectshipDayCell {
  /** 이 날짜에 입고예정인 발주 수 */
  poCount: number;
  /** 품목(행) 수 */
  itemCount: number;
  /** 총 수량 */
  qty: number;
  /** 아직 처리하지 않은 발주의 수량 — 셀에 보이는 "N건"과 짝이 맞아야 한다. */
  pendingQty: number;
  /** 셀피아로 전송 요청한 발주 수(= 처리 끝난 것) */
  collectedPoCount: number;
  /** 아직 처리하지 않은 발주 수 = poCount - collectedPoCount */
  pendingPoCount: number;
  /** 긴급 발주 수 — 빨간 표시 대상 */
  urgentCount: number;
  /** 운송유형별 발주 건수(합산 표시의 내역) */
  byTransport: { SHIPMENT: number; MILKRUN: number };
  /** 이번 회차 처리 범위에 드는 날짜인지 */
  inWindow: boolean;
}

/**
 * 입고예정일(edd) 기준 달력 데이터. 운송유형별로 따로 만든다.
 *
 * 전송 요청한 발주는 지우지 않고 `collectedPoCount` 로 분리한다. 소거법으로 남은
 * `pendingPoCount` 가 0 이면 그 날짜는 처리할 게 없다는 뜻이다.
 */
export function buildDirectshipEddCalendar(
  pos: readonly CoupangDirectPo[],
  /** 특정 운송유형만 볼 때 지정. 생략하면 쉽먼트+밀크런을 합산한다. */
  transport: CoupangTransport | null,
  options: {
    collectedSeqs?: ReadonlySet<string>;
    window?: { from: string; to: string };
  } = {},
): Record<string, DirectshipDayCell> {
  const collected = options.collectedSeqs ?? new Set<string>();
  const cells: Record<string, DirectshipDayCell> = {};
  for (const po of pos) {
    if (transport && String(po.transport ?? '').toUpperCase() !== transport) continue;
    const edd = String(po.edd ?? '').slice(0, 10);
    if (!edd) continue;
    const cell = cells[edd] ?? {
      poCount: 0,
      itemCount: 0,
      qty: 0,
      pendingQty: 0,
      collectedPoCount: 0,
      pendingPoCount: 0,
      urgentCount: 0,
      byTransport: { SHIPMENT: 0, MILKRUN: 0 },
      inWindow: options.window
        ? edd >= options.window.from && edd <= options.window.to
        : true,
    };
    const items = po.items ?? [];
    const qty = items.reduce((sum, item) => sum + (item?.qty ?? 0), 0);
    const isCollected = collected.has(String(po.seq ?? ''));
    cell.poCount += 1;
    cell.itemCount += items.length;
    cell.qty += qty;
    if (isCollected) cell.collectedPoCount += 1;
    else cell.pendingQty += qty;
    if (po.urgent) cell.urgentCount += 1;
    const tr = String(po.transport ?? '').toUpperCase();
    if (tr === 'SHIPMENT' || tr === 'MILKRUN') cell.byTransport[tr] += 1;
    cell.pendingPoCount = cell.poCount - cell.collectedPoCount;
    cells[edd] = cell;
  }
  return cells;
}

/** 달력에서 고른 날짜들에 해당하는 발주만 남긴다. */
export function filterPosByEdd(
  pos: readonly CoupangDirectPo[],
  transport: CoupangTransport,
  eddDates: readonly string[],
): CoupangDirectPo[] {
  const wanted = new Set(eddDates);
  return pos.filter((po) =>
    String(po.transport ?? '').toUpperCase() === transport
    && wanted.has(String(po.edd ?? '').slice(0, 10)));
}
