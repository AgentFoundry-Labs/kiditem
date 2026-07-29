import type { StoredOrderCollectionFile } from './order-generated-file-store';

/**
 * 아이스크림몰 송장 업로드용 "주문번호 → 배송번호" 인덱스.
 * ⭐배송번호(deliNo)는 수집(배송조회) 때 이미 긁어온다. 송장 업로드 시점엔 그 주문이 배송조회에서
 * 빠져 있을 수 있으므로(이미 출고완료 등), 배송조회를 다시 긁지 않고 "수집 때 확보한 배송번호"와
 * 셀피아 송장을 주문번호로 매칭한다. 소스 = 수집 시 저장 인덱스 + 생성 파일(셀피아 xlsx) 백필.
 */

const KEY = 'kiditem-icecream-deli-index';
const MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000; // 21일 지나면 정리

interface DeliRecord {
  deliNo: string;
  deliSeq: string;
}

interface DeliEntry {
  deliveries: DeliRecord[];
  at: number;
}
type DeliIndex = Record<string, DeliEntry>; // 주문번호 → entry

function loadRaw(): DeliIndex {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([ordNo, value]) => {
        const entry = normalizeEntry(value);
        return entry ? [[ordNo, entry]] : [];
      }),
    );
  } catch {
    return {};
  }
}

const norm = (value: unknown): string => String(value ?? '').trim();
const normSeq = (value: unknown): string => norm(value) || '1';
const colIndex = (headers: string[], name: string): number =>
  headers.findIndex((h) => String(h ?? '').replace(/\s+/g, '') === name);

function normalizeEntry(value: unknown): DeliEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as {
    deliveries?: unknown;
    deliNo?: unknown;
    deliSeq?: unknown;
    at?: unknown;
  };
  const deliveries = Array.isArray(raw.deliveries)
    ? raw.deliveries.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const record = item as { deliNo?: unknown; deliSeq?: unknown };
        const deliNo = norm(record.deliNo);
        return deliNo ? [{ deliNo, deliSeq: normSeq(record.deliSeq) }] : [];
      })
    : [];

  // v1 저장값({ deliNo, items })은 배송순번을 저장하지 않았다. 아이스크림몰의
  // 기본 배송순번 1로 한 번만 마이그레이션하고 이후에는 실제 배송순번을 보존한다.
  const legacyDeliNo = norm(raw.deliNo);
  if (deliveries.length === 0 && legacyDeliNo) {
    deliveries.push({ deliNo: legacyDeliNo, deliSeq: normSeq(raw.deliSeq) });
  }
  if (deliveries.length === 0) return null;

  return {
    deliveries: dedupeDeliveries(deliveries),
    at: Number.isFinite(Number(raw.at)) ? Number(raw.at) : Date.now(),
  };
}

function dedupeDeliveries(records: DeliRecord[]): DeliRecord[] {
  return [...new Map(records.map((record) => [
    `${record.deliNo}\u001f${record.deliSeq}`,
    record,
  ])).values()];
}

/** 수집(배송조회 원본 행) 시 주문번호→배송번호 인덱스를 누적 저장. */
export function saveIcecreamDeliveryIndex(headers: string[], rows: string[][]): void {
  if (typeof window === 'undefined') return;
  const oi = colIndex(headers, '주문번호');
  const di = colIndex(headers, '배송번호');
  const si = colIndex(headers, '배송순번');
  if (oi < 0 || di < 0) return;

  const idx = loadRaw();
  const now = Date.now();
  for (const row of rows) {
    const ordNo = norm(row[oi]);
    const deliNo = norm(row[di]);
    if (!ordNo || !deliNo) continue;
    const deliSeq = si >= 0 ? normSeq(row[si]) : '1';
    const cur = idx[ordNo] ?? { deliveries: [], at: now };
    cur.at = now;
    cur.deliveries = dedupeDeliveries([...cur.deliveries, { deliNo, deliSeq }]);
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

/** 생성된 아이스크림 파일 blob 을 파싱해 주문번호→배송번호/배송순번 백필. */
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
    const si = colIndex(headers, '배송순번');
    if (oi < 0 || di < 0) return;
    const at = file.convertedAt ?? Date.now();
    for (const raw of aoa.slice(1)) {
      const row = raw as unknown[];
      const ordNo = norm(row[oi]);
      const deliNo = norm(row[di]);
      if (!ordNo || !deliNo) continue;
      const deliSeq = si >= 0 ? normSeq(row[si]) : '1';
      const cur = into[ordNo] ?? { deliveries: [], at };
      cur.deliveries = dedupeDeliveries([...cur.deliveries, { deliNo, deliSeq }]);
      cur.at = Math.max(cur.at, at);
      into[ordNo] = cur;
    }
  } catch {
    /* 파싱 실패한 파일은 건너뜀 */
  }
}

/**
 * 주어진 주문번호들의 배송번호/배송순번을 모아 출고완료 파일 조인용 원본 형태로 반환.
 * 상품 행 수가 아니라 (배송번호, 배송순번) 기준으로 한 번만 반환한다.
 * 인덱스에 없는 주문번호는 넘겨받은 아이스크림 생성 파일에서 백필. 못 찾으면 그 주문은 빠진다.
 */
export async function buildIcecreamDeliveryRows(
  ordNos: Set<string>,
  icecreamFiles: StoredOrderCollectionFile[],
): Promise<{
  headers: string[];
  rows: string[][];
  matchedOrders: number;
  missingOrderNumbers: string[];
  indexSize: number;
}> {
  const idx: DeliIndex = { ...loadRaw() };
  const stillMissing = () => [...ordNos].some((o) => !idx[o]);
  if (stillMissing()) {
    for (const file of icecreamFiles) {
      await backfillFromFile(file, idx);
      if (!stillMissing()) break; // 필요한 주문 다 찾으면 조기 종료
    }
  }

  const headers = ['주문번호', '배송번호', '배송순번'];
  const rows: string[][] = [];
  let matchedOrders = 0;
  const missingOrderNumbers: string[] = [];
  for (const ordNo of ordNos) {
    const entry = idx[ordNo];
    if (!entry) {
      missingOrderNumbers.push(ordNo);
      continue;
    }
    matchedOrders += 1;
    for (const delivery of entry.deliveries) {
      rows.push([ordNo, delivery.deliNo, delivery.deliSeq]);
    }
  }
  return {
    headers,
    rows,
    matchedOrders,
    missingOrderNumbers,
    indexSize: Object.keys(idx).length,
  };
}
