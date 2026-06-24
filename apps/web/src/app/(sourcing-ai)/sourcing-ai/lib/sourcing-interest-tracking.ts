import {
  createManualSourcingWorkspaceSnapshotMeta,
  getRecentSourcingWorkspaceSnapshots,
  saveTodaySourcingWorkspaceSnapshot,
  type SourcingWorkspaceSnapshotMeta,
} from './sourcing-workspace-snapshot-api';

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
  input: {
    trackingWindowDays: number;
  };
  result: {
    targets: SourcingInterestTarget[];
    observations: SourcingInterestObservation[];
  };
  meta: SourcingWorkspaceSnapshotMeta;
}

export async function addSourcingInterestTarget(input: {
  target: Omit<SourcingInterestTarget, 'createdAt' | 'updatedAt'>;
  observation?: Omit<SourcingInterestObservation, 'targetId' | 'observedAt'>;
  trackingWindowDays?: number;
}): Promise<SourcingInterestTrackingSnapshotPayload> {
  const trackingWindowDays = input.trackingWindowDays ?? 3;
  const existing = await loadLatestInterestTrackingPayload(trackingWindowDays);
  const now = new Date().toISOString();
  const targets = mergeInterestTargets(existing.result.targets, {
    ...input.target,
    createdAt: now,
    updatedAt: now,
  });
  const observations = input.observation
    ? [
      {
        ...input.observation,
        targetId: input.target.id,
        observedAt: now,
      },
      ...existing.result.observations,
    ].slice(0, 5_000)
    : existing.result.observations;

  const payload: SourcingInterestTrackingSnapshotPayload = {
    version: 1,
    input: {
      trackingWindowDays,
    },
    result: {
      targets,
      observations,
    },
    meta: createManualSourcingWorkspaceSnapshotMeta(),
  };

  await saveTodaySourcingWorkspaceSnapshot('interest_tracking', payload);
  return payload;
}

export async function removeSourcingInterestTarget(input: {
  targetId: string;
  trackingWindowDays?: number;
}): Promise<SourcingInterestTrackingSnapshotPayload> {
  const trackingWindowDays = input.trackingWindowDays ?? 3;
  const existing = await loadLatestInterestTrackingPayload(trackingWindowDays);
  const payload: SourcingInterestTrackingSnapshotPayload = {
    version: 1,
    input: {
      trackingWindowDays,
    },
    result: {
      targets: existing.result.targets.filter((target) => target.id !== input.targetId),
      observations: existing.result.observations.filter((observation) => observation.targetId !== input.targetId),
    },
    meta: createManualSourcingWorkspaceSnapshotMeta(),
  };

  await saveTodaySourcingWorkspaceSnapshot('interest_tracking', payload);
  return payload;
}

export async function loadLatestInterestTrackingPayload(
  trackingWindowDays = 3,
): Promise<SourcingInterestTrackingSnapshotPayload> {
  const response = await getRecentSourcingWorkspaceSnapshots<SourcingInterestTrackingSnapshotPayload>(
    'interest_tracking',
    trackingWindowDays,
  );
  const latest = response.snapshots
    .map((snapshot) => snapshot.payload)
    .find(isSourcingInterestTrackingSnapshotPayload);
  return latest ?? createEmptyInterestTrackingPayload(trackingWindowDays);
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

function mergeInterestTargets(
  currentTargets: SourcingInterestTarget[],
  nextTarget: SourcingInterestTarget,
): SourcingInterestTarget[] {
  const targets = new Map(currentTargets.map((target) => [target.id, target]));
  const current = targets.get(nextTarget.id);
  targets.set(nextTarget.id, {
    ...current,
    ...nextTarget,
    createdAt: current?.createdAt ?? nextTarget.createdAt,
    updatedAt: nextTarget.updatedAt,
  });
  return [...targets.values()].slice(0, 500);
}

function createEmptyInterestTrackingPayload(trackingWindowDays: number): SourcingInterestTrackingSnapshotPayload {
  return {
    version: 1,
    input: {
      trackingWindowDays,
    },
    result: {
      targets: [],
      observations: [],
    },
    meta: createManualSourcingWorkspaceSnapshotMeta(),
  };
}

function isSourcingInterestTrackingSnapshotPayload(
  value: unknown,
): value is SourcingInterestTrackingSnapshotPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SourcingInterestTrackingSnapshotPayload>;
  return payload.version === 1 &&
    typeof payload.input?.trackingWindowDays === 'number' &&
    Array.isArray(payload.result?.targets) &&
    Array.isArray(payload.result?.observations) &&
    typeof payload.meta?.generatedAt === 'string';
}

function compactInterestKey(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}
