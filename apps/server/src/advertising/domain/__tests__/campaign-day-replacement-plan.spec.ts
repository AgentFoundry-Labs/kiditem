import { describe, expect, it } from 'vitest';
import {
  planCampaignDayReplacement,
  type CampaignDayExistingTarget,
  type CampaignDayDesiredTarget,
} from '../campaign-day-replacement-plan';

const desired = (overrides: Partial<CampaignDayDesiredTarget> = {}): CampaignDayDesiredTarget => ({
  targetKey: 'account:account-1:product:campaign-1:item-1',
  targetType: 'product',
  campaignId: 'campaign-1',
  externalOptionId: 'item-1',
  ...overrides,
});

const existing = (overrides: Partial<CampaignDayExistingTarget> = {}): CampaignDayExistingTarget => ({
  id: 'legacy-1',
  targetKey: 'product:item-1',
  targetType: 'product',
  campaignId: 'campaign-1',
  campaignName: 'Campaign 1',
  externalOptionId: 'item-1',
  accountEvidence: ['account-1'],
  actionIds: [],
  rawSnapshotId: 'raw-1',
  firstObservedAt: new Date('2026-07-17T00:00:00Z'),
  lastObservedAt: new Date('2026-07-17T01:00:00Z'),
  createdAt: new Date('2026-07-17T00:00:00Z'),
  updatedAt: new Date('2026-07-17T01:00:00Z'),
  sampleCount: 1,
  ...overrides,
});

describe('planCampaignDayReplacement', () => {
  it('updates an equivalent owned legacy row in place', () => {
    expect(planCampaignDayReplacement({
      channelAccountId: 'account-1',
      desiredTargets: [desired()],
      existingTargets: [existing()],
    })).toMatchObject({
      kind: 'planned',
      targets: [{ destinationId: 'legacy-1', sourceIds: [] }],
      staleIds: [],
    });
  });

  it('merges a legacy collision into the qualified destination and reparents actions', () => {
    const result = planCampaignDayReplacement({
      channelAccountId: 'account-1',
      desiredTargets: [desired()],
      existingTargets: [
        existing({ id: 'legacy-1', actionIds: ['action-1'] }),
        existing({
          id: 'qualified-1',
          targetKey: desired().targetKey,
          actionIds: ['action-2'],
          rawSnapshotId: 'raw-2',
          lastObservedAt: new Date('2026-07-17T02:00:00Z'),
          updatedAt: new Date('2026-07-17T02:00:00Z'),
        }),
      ],
    });
    expect(result).toMatchObject({
      kind: 'planned',
      targets: [{
        destinationId: 'qualified-1',
        sourceIds: ['legacy-1'],
        reparentActionIds: ['action-1'],
      }],
      staleIds: [],
    });
  });

  it('rejects stale rows with dependent actions before any writes', () => {
    expect(planCampaignDayReplacement({
      channelAccountId: 'account-1',
      desiredTargets: [],
      existingTargets: [existing({ actionIds: ['action-1'] })],
    })).toEqual({ kind: 'rejected', code: 'dependent_action_conflict' });
  });

  it.each([
    { accountEvidence: [] },
    { accountEvidence: ['account-1', 'account-2'] },
  ])('rejects absent or conflicting account proof: $accountEvidence', ({ accountEvidence }) => {
    expect(planCampaignDayReplacement({
      channelAccountId: 'account-1',
      desiredTargets: [desired()],
      existingTargets: [existing({ accountEvidence })],
    })).toEqual({ kind: 'rejected', code: 'legacy_account_ambiguous' });
  });

  it('leaves a proven other-account row untouched', () => {
    expect(planCampaignDayReplacement({
      channelAccountId: 'account-1',
      desiredTargets: [desired()],
      existingTargets: [existing({ accountEvidence: ['account-2'] })],
    })).toMatchObject({
      kind: 'planned',
      targets: [{ destinationId: null }],
      staleIds: [],
      excludedIds: ['legacy-1'],
    });
  });
});
