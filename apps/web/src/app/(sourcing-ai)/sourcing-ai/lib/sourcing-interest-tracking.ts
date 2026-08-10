import { apiClient } from '@/lib/api-client';

export type SourcingInterestTargetType = 'keyword' | 'category' | 'product';
export type SourcingInterestSource =
  | 'keyword_analysis'
  | 'today_recommendation'
  | 'wing_catalog'
  | 'manual';

export interface SourcingInterestTarget {
  id: string;
  type: SourcingInterestTargetType;
  label: string;
  source: SourcingInterestSource;
  keyword?: string;
  category?: string;
  productId?: string;
  itemId?: string | null;
  vendorItemId?: string | null;
  productName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourcingInterestObservation {
  targetId: string;
  observedAt: string;
  source: SourcingInterestSource;
  metrics?: Record<string, number | string | null>;
  note?: string;
}

export interface SourcingInterestTrackingSnapshotPayload {
  version: 1;
  input: { trackingWindowDays: number };
  result: {
    targets: SourcingInterestTarget[];
    observations: SourcingInterestObservation[];
  };
  meta: {
    generatedAt: string;
    generationSource: 'server';
    generatorVersion: 'sourcing-interest-target.v1';
  };
}

interface SourcingInterestTargetResponse {
  id: string;
  targetType: SourcingInterestTargetType;
  label: string;
  sourceKeys: string[];
  keyword: string | null;
  category: string | null;
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function addSourcingInterestTarget(input: {
  target: Omit<SourcingInterestTarget, 'createdAt' | 'updatedAt'>;
  observation?: Omit<SourcingInterestObservation, 'targetId' | 'observedAt'>;
  trackingWindowDays?: number;
}): Promise<SourcingInterestTrackingSnapshotPayload> {
  const target = input.target;
  await apiClient.post<SourcingInterestTargetResponse>('/api/sourcing/workspace/interests', {
    targetType: target.type,
    source: target.source,
    label: target.label,
    keyword: target.keyword,
    category: target.category,
    productId: target.productId,
    itemId: target.itemId,
    vendorItemId: target.vendorItemId,
    productName: target.productName,
  });
  return loadLatestInterestTrackingPayload(input.trackingWindowDays);
}

export async function removeSourcingInterestTarget(input: {
  targetId: string;
  trackingWindowDays?: number;
}): Promise<SourcingInterestTrackingSnapshotPayload> {
  await apiClient.delete(`/api/sourcing/workspace/interests/${encodeURIComponent(input.targetId)}`);
  return loadLatestInterestTrackingPayload(input.trackingWindowDays);
}

export async function loadLatestInterestTrackingPayload(
  trackingWindowDays = 3,
): Promise<SourcingInterestTrackingSnapshotPayload> {
  const rows = await apiClient.get<SourcingInterestTargetResponse[]>('/api/sourcing/workspace/interests');
  return toPayload(rows, trackingWindowDays);
}

export function createKeywordInterestTarget(input: {
  keyword: string;
  source: SourcingInterestSource;
}): Omit<SourcingInterestTarget, 'createdAt' | 'updatedAt'> {
  const keyword = input.keyword.trim();
  return {
    id: createKeywordInterestTargetId(keyword),
    type: 'keyword',
    label: keyword,
    keyword,
    source: input.source,
  };
}

export function createKeywordInterestTargetId(keyword: string): string {
  return `keyword:${compactInterestKey(keyword.trim())}`;
}

export function createCategoryInterestTarget(input: {
  category: string;
  source: SourcingInterestSource;
}): Omit<SourcingInterestTarget, 'createdAt' | 'updatedAt'> {
  const category = input.category.trim();
  return {
    id: createCategoryInterestTargetId(category),
    type: 'category',
    label: category,
    category,
    source: input.source,
  };
}

export function createCategoryInterestTargetId(category: string): string {
  return `category:${compactInterestKey(category.trim())}`;
}

export function createProductInterestTarget(input: {
  productId: string;
  productName: string;
  itemId?: string | null;
  vendorItemId?: string | null;
}): Omit<SourcingInterestTarget, 'createdAt' | 'updatedAt'> {
  return {
    id: `product:${input.productId}:${input.itemId ?? ''}:${input.vendorItemId ?? ''}`,
    type: 'product',
    label: input.productName,
    source: 'today_recommendation',
    productId: input.productId,
    itemId: input.itemId ?? null,
    vendorItemId: input.vendorItemId ?? null,
    productName: input.productName,
  };
}

function toPayload(
  rows: SourcingInterestTargetResponse[],
  trackingWindowDays: number,
): SourcingInterestTrackingSnapshotPayload {
  return {
    version: 1,
    input: { trackingWindowDays },
    result: {
      targets: rows.map((row) => ({
        id: row.id,
        type: row.targetType,
        label: row.label,
        source: sourceFrom(row.sourceKeys),
        keyword: row.keyword ?? undefined,
        category: row.category ?? undefined,
        productId: row.productId ?? undefined,
        itemId: row.itemId,
        vendorItemId: row.vendorItemId,
        productName: row.productName ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      observations: [],
    },
    meta: {
      generatedAt: new Date().toISOString(),
      generationSource: 'server',
      generatorVersion: 'sourcing-interest-target.v1',
    },
  };
}

function sourceFrom(sourceKeys: string[]): SourcingInterestSource {
  const source = sourceKeys[0];
  return source === 'keyword_analysis'
    || source === 'today_recommendation'
    || source === 'wing_catalog'
    || source === 'manual'
    ? source
    : 'manual';
}

function compactInterestKey(value: string): string {
  return value.replace(/\s+/g, '').toLocaleLowerCase('en-US');
}
