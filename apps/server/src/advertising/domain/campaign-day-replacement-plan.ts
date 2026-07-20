export type CampaignReplacementRejectionCode =
  | 'legacy_account_ambiguous'
  | 'dependent_action_conflict';

export interface CampaignDayDesiredTarget {
  targetKey: string;
  targetType: string;
  campaignId?: string | null;
  campaignName?: string | null;
  adGroup?: string | null;
  keyword?: string | null;
  listingId?: string | null;
  listingOptionId?: string | null;
  externalId?: string | null;
  externalOptionId?: string | null;
}

export interface CampaignDayExistingTarget extends CampaignDayDesiredTarget {
  id: string;
  accountEvidence: string[];
  actionIds: string[];
  rawSnapshotId: string | null;
  firstObservedAt: Date;
  lastObservedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  sampleCount: number;
  metrics?: Record<string, number>;
}

export interface PlannedCampaignTarget {
  targetKey: string;
  destinationId: string | null;
  sourceIds: string[];
  reparentActionIds: string[];
  firstObservedAt: Date | null;
  sampleCount: number;
  sourceRawSnapshotIds: string[];
}

export type CampaignDayReplacementPlan =
  | {
      kind: 'planned';
      targets: PlannedCampaignTarget[];
      staleIds: string[];
      excludedIds: string[];
    }
  | { kind: 'rejected'; code: CampaignReplacementRejectionCode };

export function planCampaignDayReplacement(input: {
  channelAccountId: string;
  desiredTargets: CampaignDayDesiredTarget[];
  existingTargets: CampaignDayExistingTarget[];
}): CampaignDayReplacementPlan {
  const owned: CampaignDayExistingTarget[] = [];
  const excludedIds: string[] = [];
  for (const candidate of input.existingTargets) {
    const evidence = [...new Set(candidate.accountEvidence.filter(Boolean))];
    if (evidence.length !== 1) {
      return { kind: 'rejected', code: 'legacy_account_ambiguous' };
    }
    if (evidence[0] !== input.channelAccountId) {
      excludedIds.push(candidate.id);
      continue;
    }
    owned.push(candidate);
  }

  const assigned = new Set<string>();
  const targets: PlannedCampaignTarget[] = [];
  for (const desired of input.desiredTargets) {
    const equivalents = owned.filter(
      (candidate) => !assigned.has(candidate.id) && equivalentTarget(candidate, desired),
    );
    for (const candidate of equivalents) assigned.add(candidate.id);

    const qualified = equivalents.find(
      (candidate) => candidate.targetKey === desired.targetKey,
    );
    const destination = qualified ?? newestCandidate(equivalents);
    if (hasUndecidableTie(equivalents)) {
      return { kind: 'rejected', code: 'legacy_account_ambiguous' };
    }
    const sources = destination
      ? equivalents.filter((candidate) => candidate.id !== destination.id)
      : [];
    targets.push({
      targetKey: desired.targetKey,
      destinationId: destination?.id ?? null,
      sourceIds: sources.map((candidate) => candidate.id),
      reparentActionIds: sources.flatMap((candidate) => candidate.actionIds),
      firstObservedAt: destination
        ? new Date(Math.min(...equivalents.map((candidate) => candidate.firstObservedAt.getTime())))
        : null,
      sampleCount: mergedSampleCount(equivalents),
      sourceRawSnapshotIds: [
        ...new Set(equivalents.flatMap((candidate) =>
          candidate.rawSnapshotId ? [candidate.rawSnapshotId] : [],
        )),
      ].slice(0, 32),
    });
  }

  const stale = owned.filter((candidate) => !assigned.has(candidate.id));
  if (stale.some((candidate) => candidate.actionIds.length > 0)) {
    return { kind: 'rejected', code: 'dependent_action_conflict' };
  }
  return {
    kind: 'planned',
    targets,
    staleIds: stale.map((candidate) => candidate.id),
    excludedIds,
  };
}

function equivalentTarget(
  existing: CampaignDayExistingTarget,
  desired: CampaignDayDesiredTarget,
): boolean {
  if (existing.targetType !== desired.targetType) return false;
  if (!sameWhenBoth(existing.campaignId, desired.campaignId)) return false;
  if (!existing.campaignId && !desired.campaignId &&
      !sameWhenBoth(existing.campaignName, desired.campaignName)) return false;
  switch (desired.targetType) {
    case 'campaign':
      return true;
    case 'keyword':
      return sameNormalized(existing.adGroup, desired.adGroup) &&
        sameNormalized(existing.keyword, desired.keyword);
    case 'product':
      return firstIdentity(existing, ['externalOptionId', 'externalId', 'listingId']) ===
        firstIdentity(desired, ['externalOptionId', 'externalId', 'listingId']);
    default:
      return existing.targetKey === desired.targetKey;
  }
}

function normalized(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function sameNormalized(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return normalized(left) === normalized(right);
}

function sameWhenBoth(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalized(left);
  const b = normalized(right);
  return !a || !b || a === b;
}

function firstIdentity(
  value: CampaignDayDesiredTarget,
  keys: Array<'externalOptionId' | 'externalId' | 'listingId'>,
): string | null {
  for (const key of keys) {
    const candidate = normalized(value[key]);
    if (candidate) return candidate;
  }
  return null;
}

function newestCandidate(
  candidates: CampaignDayExistingTarget[],
): CampaignDayExistingTarget | undefined {
  return [...candidates].sort((left, right) =>
    right.lastObservedAt.getTime() - left.lastObservedAt.getTime() ||
    right.updatedAt.getTime() - left.updatedAt.getTime() ||
    left.id.localeCompare(right.id),
  )[0];
}

function hasUndecidableTie(candidates: CampaignDayExistingTarget[]): boolean {
  if (candidates.length < 2) return false;
  const newest = newestCandidate(candidates);
  if (!newest) return false;
  const ties = candidates.filter((candidate) =>
    candidate.lastObservedAt.getTime() === newest.lastObservedAt.getTime() &&
    candidate.updatedAt.getTime() === newest.updatedAt.getTime(),
  );
  if (ties.length < 2) return false;
  const signatures = new Set(ties.map((candidate) => JSON.stringify({
    campaignId: normalized(candidate.campaignId),
    campaignName: normalized(candidate.campaignName),
    adGroup: normalized(candidate.adGroup),
    keyword: normalized(candidate.keyword),
    listingId: normalized(candidate.listingId),
    listingOptionId: normalized(candidate.listingOptionId),
    externalId: normalized(candidate.externalId),
    externalOptionId: normalized(candidate.externalOptionId),
    metrics: candidate.metrics ?? {},
  })));
  return signatures.size > 1;
}

function mergedSampleCount(candidates: CampaignDayExistingTarget[]): number {
  if (candidates.length === 0) return 1;
  const rawIds = new Set(candidates.flatMap((candidate) =>
    candidate.rawSnapshotId ? [candidate.rawSnapshotId] : [],
  ));
  return rawIds.size > 1
    ? candidates.reduce((sum, candidate) => sum + candidate.sampleCount, 0)
    : Math.max(...candidates.map((candidate) => candidate.sampleCount));
}
