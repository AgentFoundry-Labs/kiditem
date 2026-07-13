import type { StoredOrderCollectionFile } from './order-generated-file-store';

/**
 * 아이스크림몰 송장 업로드용 "주문번호 → 배송번호" 인덱스.
 * ⭐배송번호(deliNo)는 수집(배송조회) 때 이미 긁어온다. 송장 업로드 시점엔 그 주문이 배송조회에서
 * 빠져 있을 수 있으므로(이미 출고완료 등), 배송조회를 다시 긁지 않고 "수집 때 확보한 배송번호"와
 * 셀피아 송장을 주문번호로 매칭한다. 소스 = 수집 시 저장 인덱스 + 생성 파일(셀피아 xlsx) 백필.
 */

const KEY = 'kiditem-icecream-deli-index';
const MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000; // 21일 지나면 정리

interface DeliEntry {
  deliNo: string;
  items: string[]; // 상품번호들 (배송순번 파생용)
  at: number;
}
type DeliIndex = Record<string, DeliEntry>; // 주문번호 → entry

function loadRaw(): DeliIndex {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeliIndex) : {};
  } catch {
    return {};
  }
}

const norm = (value: unknown): string => String(value ?? '').trim();
const colIndex = (headers: string[], name: string): number =>
  headers.findIndex((h) => String(h ?? '').replace(/\s+/g, '') === name);

/** 수집(배송조회 원본 행) 시 주문번호→배송번호 인덱스를 누적 저장. */
export function saveIcecreamDeliveryIndex(headers: string[], rows: string[][]): void {
  if (typeof window === 'undefined') return;
  const oi = colIndex(headers, '주문번호');
  const di = colIndex(headers, '배송번호');
  const pi = colIndex(headers, '상품번호');
  if (oi < 0 || di < 0) return;

  const idx = loadRaw();
  const now = Date.now();
  for (const row of rows) {
    const ordNo = norm(row[oi]);
    const deliNo = norm(row[di]);
    if (!ordNo || !deliNo) continue;
    const item = pi >= 0 ? norm(row[pi]) : '';
    const cur = idx[ordNo] ?? { deliNo, items: [], at: now };
    cur.deliNo = deliNo;
    cur.at = now;
    if (item && !cur.items.includes(item)) cur.items.push(item);
    idx[ordNo] = cur;
  }
  const cutoff = now - MAX_AGE_MS;
  for (const k of Object.keys(idx)) if ((idx[k].at ?? 0) < cutoff) delete idx[k];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(idx));
  } catch {
    /* 용량 초과 등 무시 (송장 업로드 시 생성 파일 백필로도 복구 가능) */
  }
}

/** 생성된 아이스크림 파일(셀피아 xlsx) blob 을 파싱해 주문번호→배송번호/상품번호 백필. */
async function backfillFromFile(file: StoredOrderCollectionFile, into: DeliIndex): Promise<void> {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.blob.arrayBuffer(), { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!sheet) return;
    const aoa = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    if (aoa.length < 2) return;
    const headers = (aoa[0] as unknown[]).map((h) => String(h ?? ''));
    const oi = colIndex(headers, '주문번호');
    const di = colIndex(headers, '배송번호');
    const pi = colIndex(headers, '상품번호');
    if (oi < 0 || di < 0) return;
    const at = file.convertedAt ?? Date.now();
    for (const raw of aoa.slice(1)) {
      const row = raw as unknown[];
      const ordNo = norm(row[oi]);
      const deliNo = norm(row[di]);
      if (!ordNo || !deliNo) continue;
      const item = pi >= 0 ? norm(row[pi]) : '';
      const cur = into[ordNo] ?? { deliNo, items: [], at };
      cur.deliNo = deliNo;
      if (item && !cur.items.includes(item)) cur.items.push(item);
      into[ordNo] = cur;
    }
  } catch {
    /* 파싱 실패한 파일은 건너뜀 */
  }
}

/**
 * 주어진 주문번호들의 배송번호/상품번호를 모아 백엔드 조인용 원본 형태 {headers, rows} 로 반환.
 * (headers=['주문번호','배송번호','상품번호'], 상품번호 하나당 한 행 → 백엔드가 배송순번 파생 + 송장 조인.)
 * 인덱스에 없는 주문번호는 넘겨받은 아이스크림 생성 파일에서 백필. 못 찾으면 그 주문은 빠진다.
 */
export async function buildIcecreamDeliveryRows(
  ordNos: Set<string>,
  icecreamFiles: StoredOrderCollectionFile[],
): Promise<{ headers: string[]; rows: string[][]; matchedOrders: number; indexSize: number }> {
  const idx: DeliIndex = { ...loadRaw() };
  const stillMissing = () => [...ordNos].some((o) => !idx[o]);
  if (stillMissing()) {
    for (const file of icecreamFiles) {
      await backfillFromFile(file, idx);
      if (!stillMissing()) break; // 필요한 주문 다 찾으면 조기 종료
    }
  }

  const headers = ['주문번호', '배송번호', '상품번호'];
  const rows: string[][] = [];
  let matchedOrders = 0;
  for (const ordNo of ordNos) {
    const entry = idx[ordNo];
    if (!entry) continue;
    matchedOrders += 1;
    const items = entry.items.length ? entry.items : [''];
    for (const item of items) rows.push([ordNo, entry.deliNo, item]);
  }
  return { headers, rows, matchedOrders, indexSize: Object.keys(idx).length };
}
