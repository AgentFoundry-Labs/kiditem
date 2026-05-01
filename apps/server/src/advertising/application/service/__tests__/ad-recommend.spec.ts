import { describe, it, expect, beforeEach } from 'vitest';

import { AdRecommendService } from '../ad-recommend.service';
import type { AdStrategyAction, AdStrategyRecommendation } from '@kiditem/shared/advertising';

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const makeAction = (overrides: Partial<AdStrategyAction> = {}): AdStrategyAction => ({
  listing: {
    listingId: '00000000-0000-0000-0000-000000000001',
    externalId: 'EXT-1',
    channelName: '쿠팡 등록명',
    masterProduct: {
      id: '00000000-0000-0000-0000-000000000010',
      code: 'M-00000001',
      name: '테스트 상품',
    },
    option: null,
  },
  grade: 'A',
  actionType: 'pause_keyword',
  priority: 'urgent',
  reason: '기존 reason',
  currentValue: null,
  proposedValue: null,
  ...overrides,
});

// ─────────────────────────────────────────────
// enhanceActionsWithAi — pass-through hook
// ─────────────────────────────────────────────

describe('AdRecommendService.enhanceActionsWithAi', () => {
  let service: AdRecommendService;

  beforeEach(() => {
    service = new AdRecommendService();
  });

  it('returns empty array for empty input', async () => {
    const result = await service.enhanceActionsWithAi([], 'organization-1');
    expect(result).toEqual([]);
  });

  it('returns the input actions unchanged (pass-through)', async () => {
    const actions = [makeAction(), makeAction({ actionType: 'change_bid', priority: 'high' })];
    const result = await service.enhanceActionsWithAi(actions, 'organization-1');
    expect(result).toEqual(actions);
  });

  it('does not mutate the input actions array', async () => {
    const actions = [makeAction()];
    const snapshot = JSON.parse(JSON.stringify(actions));
    await service.enhanceActionsWithAi(actions, 'organization-1');
    expect(actions).toEqual(snapshot);
  });
});

// ─────────────────────────────────────────────
// toRecommendations
// ─────────────────────────────────────────────

describe('AdRecommendService.toRecommendations', () => {
  let service: AdRecommendService;

  beforeEach(() => {
    service = new AdRecommendService();
  });

  it('returns empty array for null input', () => {
    expect(service.toRecommendations(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(service.toRecommendations(undefined)).toEqual([]);
  });

  it('returns empty array for primitive input (string / number)', () => {
    expect(service.toRecommendations('not-an-object')).toEqual([]);
    expect(service.toRecommendations(42)).toEqual([]);
  });

  it('returns empty array when recommendations key missing', () => {
    expect(service.toRecommendations({ other: 'data' })).toEqual([]);
  });

  it('returns empty array when recommendations is not an array', () => {
    expect(service.toRecommendations({ recommendations: 'oops' })).toEqual([]);
    expect(service.toRecommendations({ recommendations: { not: 'array' } })).toEqual([]);
  });

  it('returns recommendations array from agent result JSON (valid shape)', () => {
    const rec: AdStrategyRecommendation = {
      listing: {
        listingId: '00000000-0000-0000-0000-000000000001',
        externalId: 'EXT-1',
        channelName: null,
        masterProduct: { id: '00000000-0000-0000-0000-000000000010', code: 'M-1', name: 'P' },
        option: null,
      },
      grade: 'A',
      title: 'pause_keyword',
      body: '이번 주 최우선 실행 사항',
      priority: 'urgent',
    };
    const result = service.toRecommendations({ recommendations: [rec] });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(rec);
  });

  it('returns empty recommendations array when agent returns empty results', () => {
    expect(service.toRecommendations({ recommendations: [] })).toEqual([]);
  });
});
