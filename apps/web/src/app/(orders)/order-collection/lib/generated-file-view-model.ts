import { getOrderCount, type ConversionHistoryItem } from './order-collection-page-model';
import {
  ORDER_COLLECTION_MALL_LABELS,
  resolveOrderCollectionMallKey,
  resolveOrderCollectionMallName,
} from './order-collection-malls';

export type GeneratedFileSendFilter = 'all' | 'sent' | 'unsent';
export type GeneratedFileSortKey = 'newest' | 'oldest' | 'orders-desc' | 'products-desc';

export interface GeneratedFileFilters {
  search?: string;
  mallKey?: string;
  sendFilter?: GeneratedFileSendFilter;
  sortKey?: GeneratedFileSortKey;
}

export interface GeneratedFileMallOption {
  key: string;
  name: string;
}

export interface GeneratedFilePage {
  items: ConversionHistoryItem[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}

export function filterAndSortGeneratedFiles(
  items: ConversionHistoryItem[],
  filters: GeneratedFileFilters,
): ConversionHistoryItem[] {
  const searchTokens = normalizeSearch(filters.search).split(/\s+/).filter(Boolean);
  const sendFilter = filters.sendFilter ?? 'all';
  const sortKey = filters.sortKey ?? 'newest';
  const matches: Array<{ item: ConversionHistoryItem; index: number }> = [];

  items.forEach((item, index) => {
    if (filters.mallKey && resolveOrderCollectionMallKey(item) !== filters.mallKey) return;
    if (sendFilter === 'sent' && !item.sentAt) return;
    if (sendFilter === 'unsent' && item.sentAt) return;

    if (searchTokens.length > 0) {
      const searchable = generatedFileSearchText(item);
      if (!searchTokens.every((token) => searchable.includes(token))) return;
    }

    matches.push({ item, index });
  });

  return matches
    .sort((left, right) => compareGeneratedFiles(left.item, right.item, sortKey) || left.index - right.index)
    .map(({ item }) => item);
}

export function buildGeneratedFileMallOptions(
  items: ConversionHistoryItem[],
): GeneratedFileMallOption[] {
  const options = new Map<string, string>();

  for (const item of items) {
    const key = resolveOrderCollectionMallKey(item);
    if (!key || options.has(key)) continue;
    const name = resolveOrderCollectionMallName(item) ?? ORDER_COLLECTION_MALL_LABELS[key] ?? key;
    options.set(key, name);
  }

  return Array.from(options, ([key, name]) => ({ key, name })).sort(
    (left, right) => left.name.localeCompare(right.name, 'ko') || left.key.localeCompare(right.key),
  );
}

export function paginateGeneratedFiles(
  items: ConversionHistoryItem[],
  requestedPage: number,
  requestedPageSize: number,
): GeneratedFilePage {
  const pageSize = Math.max(1, Math.floor(requestedPageSize) || 1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page,
    pageCount,
    pageSize,
    total: items.length,
  };
}

function generatedFileSearchText(item: ConversionHistoryItem): string {
  const previewCells = item.previewRows.flatMap((row) => row);
  return normalizeSearch(
    [
      item.sourceName,
      item.fileName,
      item.mallName ?? '',
      ...(item.orderNumbers ?? []),
      ...previewCells,
    ].join(' '),
  );
}

function normalizeSearch(value: string | undefined): string {
  return (value ?? '').normalize('NFC').trim().toLocaleLowerCase('ko');
}

function compareGeneratedFiles(
  left: ConversionHistoryItem,
  right: ConversionHistoryItem,
  sortKey: GeneratedFileSortKey,
): number {
  if (sortKey === 'oldest') return left.convertedAt - right.convertedAt;
  if (sortKey === 'orders-desc') return numericValue(getOrderCount(right)) - numericValue(getOrderCount(left));
  if (sortKey === 'products-desc') return numericValue(right.productRows) - numericValue(left.productRows);
  return right.convertedAt - left.convertedAt;
}

function numericValue(value: number | null | undefined): number {
  return value ?? -1;
}
