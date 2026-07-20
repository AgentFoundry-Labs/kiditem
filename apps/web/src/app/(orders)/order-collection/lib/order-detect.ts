/**
 * 신규 주문 감지(diff)용 클라이언트 저장소 + 비교 로직.
 * 수집한 주문 행을 "이미 본 행"과 비교해 신규 행만 가려낸다. 저장은 localStorage(로컬 전용 도메인).
 */

import { safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browser-storage';

const LEGACY_SEEN_PREFIX = 'kiditem-order-seen:';
const SEEN_STORAGE_VERSION = 'v2';
const SEEN_PREFIX = `${LEGACY_SEEN_PREFIX}${SEEN_STORAGE_VERSION}:`;
const MAX_KEYS_PER_MALL = 8000;
const ROW_KEY_SEP = '';

export interface OrderDiff {
  /** 이전에 본 적 없는 신규 행 */
  newRows: string[][];
  /** 신규 행의 키 (seen 저장용) */
  newRowKeys: string[];
  /** 신규 행에 포함된 서로 다른 주문번호 개수 (헤더에 주문번호가 있을 때) */
  newOrderCount: number;
}

/** 몰별로 이미 본 주문 행 키 집합을 불러온다. */
export function loadSeenOrderKeys(mallKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const storageKey = SEEN_PREFIX + mallKey;
    const legacyKey = LEGACY_SEEN_PREFIX + mallKey;
    const raw = safeStorageGet('local', storageKey);
    if (!raw) {
      const legacyRaw = safeStorageGet('local', legacyKey);
      if (!legacyRaw) return new Set();
      const migrated = parseSeenOrderKeys(legacyRaw);
      persistSeenOrderKeys(mallKey, migrated);
      safeStorageRemove('local', legacyKey);
      return new Set(migrated);
    }
    return new Set(parseSeenOrderKeys(raw));
  } catch {
    return new Set();
  }
}

function parseSeenOrderKeys(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string')
      : [];
  } catch {
    return [];
  }
}

function persistSeenOrderKeys(mallKey: string, keys: string[]): void {
  safeStorageSet('local', SEEN_PREFIX + mallKey, JSON.stringify(keys));
}

/** 본 주문 행 키를 추가 저장한다. 오래된 키부터 잘라 최대 개수를 유지한다. */
export function addSeenOrderKeys(mallKey: string, keys: string[]): void {
  if (typeof window === 'undefined' || keys.length === 0) return;
  try {
    const seen = loadSeenOrderKeys(mallKey);
    for (const key of keys) seen.add(key);
    let next = [...seen];
    if (next.length > MAX_KEYS_PER_MALL) {
      next = next.slice(next.length - MAX_KEYS_PER_MALL);
    }
    persistSeenOrderKeys(mallKey, next);
  } catch {
    // localStorage 용량 초과 등은 무시 (감지 실패해도 수집 자체엔 영향 없음)
  }
}

/** 각 행을 고유 키로 변환 (셀 전체 결합 — 스크래퍼의 dedup 키와 동일 방식). */
export function rowKeysOf(rows: string[][]): string[] {
  return rows.map((row) => row.map((cell) => (cell ?? '').trim()).join(ROW_KEY_SEP));
}

/**
 * 수집한 행에서 서로 다른 주문번호를 뽑는다 (헤더에 '주문번호' 컬럼이 있을 때).
 * 카운트 집계에서 재수집한 같은 주문번호를 한 번만 세기 위한 dedup 기준.
 * 주문번호 컬럼이 없으면 빈 배열(호출부가 카운트 폴백을 쓰도록).
 */
export function distinctOrderNumbers(headers: string[], rows: string[][]): string[] {
  const idx = headers.findIndex((header) => header.replace(/\s+/g, '') === '주문번호');
  if (idx < 0) return [];
  const set = new Set<string>();
  for (const row of rows) {
    const orderNo = (row[idx] ?? '').trim();
    if (orderNo) set.add(orderNo);
  }
  return [...set];
}

/** seen 에 없는 신규 행만 가려낸다. */
export function diffNewOrderRows(headers: string[], rows: string[][], seen: Set<string>): OrderDiff {
  const orderNoIndex = headers.findIndex((header) => header.replace(/\s+/g, '') === '주문번호');
  const allKeys = rowKeysOf(rows);
  const newRows: string[][] = [];
  const newRowKeys: string[] = [];
  const newOrderNumbers = new Set<string>();

  rows.forEach((row, index) => {
    const key = allKeys[index];
    if (seen.has(key)) return;
    newRows.push(row);
    newRowKeys.push(key);
    if (orderNoIndex >= 0) {
      const orderNo = (row[orderNoIndex] ?? '').trim();
      if (orderNo) newOrderNumbers.add(orderNo);
    }
  });

  return {
    newRows,
    newRowKeys,
    newOrderCount: orderNoIndex >= 0 ? newOrderNumbers.size : newRows.length,
  };
}
