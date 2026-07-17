import { formatNumber } from '@/lib/utils';
import type { StoredOrderCollectionFile } from './order-generated-file-store';
import type { OrderCollectionMallAccount } from './order-mall-account-api';

export type ConversionState = 'idle' | 'ready' | 'converting' | 'success' | 'error';
export type ConversionHistoryItem = StoredOrderCollectionFile;

export interface MallAccountDraft {
  loginId: string;
  password: string;
  siteUrl: string;
  memo: string;
  enabled: boolean;
}

export const ACCEPTED_EXTENSIONS = '.txt,.tsv,.csv,.xls,.xlsx';
export const ICECREAM_MALL_KEY = 'icecream-mall';
export const MAX_HISTORY_ITEMS = 1000;
export const MALL_ACCOUNT_GRID_CLASS =
  'grid min-w-[760px] grid-cols-[minmax(150px,1.6fr)_minmax(96px,1fr)_80px_112px_88px_148px] gap-2';

export const EMPTY_MALL_DRAFT: MallAccountDraft = {
  loginId: '',
  password: '',
  siteUrl: '',
  memo: '',
  enabled: true,
};

export function stateMessage(state: ConversionState, file: File | null, error: string | null): string {
  if (state === 'converting') return '변환 중';
  if (state === 'success') return '다운로드 완료';
  if (state === 'error') return error ?? '변환 실패';
  if (file) return '변환 대기';
  return '파일 대기';
}

export function countLabel(value: number | null): string {
  return value === null ? '-' : formatNumber(value);
}

export function getOrderCount(result: ConversionHistoryItem | null): number | null {
  if (!result || result.outputRows === null || result.productRows === null) return null;
  const orderCount = result.outputRows - result.productRows;
  return orderCount >= 0 ? orderCount : null;
}

export function hasSellpiaTransmissionRequest(item: ConversionHistoryItem): boolean {
  return item.transmissionRequestedAt !== undefined;
}

export function groupHistoryByDay(items: ConversionHistoryItem[]): Array<{
  key: string;
  label: string;
  items: ConversionHistoryItem[];
}> {
  const groups: Array<{ key: string; label: string; items: ConversionHistoryItem[] }> = [];
  const byKey = new Map<string, { key: string; label: string; items: ConversionHistoryItem[] }>();

  for (const item of items) {
    const key = item.collectionDate ?? dayKey(item.convertedAt);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: dayLabel(key), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}

export function fileSizeLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function mallStatus(account: OrderCollectionMallAccount): { label: string; tone: 'empty' | 'paused' | 'ready' } {
  if (!account.configured) return { label: '미설정', tone: 'empty' };
  if (!account.enabled) return { label: '중지', tone: 'paused' };
  return { label: '사용', tone: 'ready' };
}

export function isBrowserCollectableMall(account: OrderCollectionMallAccount): boolean {
  // 확장 세션 스크래핑 몰 — 계정설정(ID/비번) 없이도 로그인 세션으로 수집 가능.
  if (account.key === 'kidsnote') return true;
  if (account.key === 'kkomangse') return true;
  if (account.key === 'onch') return true;
  if (account.key === 'kakao') return true;
  if (account.key === 'domeggook') return true;
  if (account.key === 'kidkids') return true;
  if (account.key === 'lotte-on') return true;
  if (account.key === 'gs-shop') return true;
  if (account.key === 'always') return true;
  if (account.key === 'boribori') return true;
  if (account.key === 'teacher-mall') return true;
  if (account.key === 'coupang-direct') return true;
  if (account.key === 'art09') return true;
  return account.key === ICECREAM_MALL_KEY && account.configured && account.enabled;
}

export function isAutoDetectableMall(account: OrderCollectionMallAccount): boolean {
  return account.enabled && isBrowserCollectableMall(account);
}

export function formatMallCollectionTime(timestamp: number): string {
  const value = new Date(timestamp);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hours}:${minutes}`;
}

export function draftFromMallAccount(account: OrderCollectionMallAccount): MallAccountDraft {
  return {
    loginId: account.loginId ?? '',
    password: '',
    siteUrl: account.siteUrl ?? '',
    memo: account.memo ?? '',
    enabled: account.enabled,
  };
}

export function todayYmd(): string {
  const now = new Date();
  return dayKey(now.getTime());
}

export function dayKey(timestamp: number): string {
  const now = new Date(timestamp);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayLabel(key: string): string {
  const [year, month, day] = key.split('-');
  return `${year}. ${month}. ${day}.`;
}
