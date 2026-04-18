import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdRecommendService } from '../ad-recommend.service';
import type { AdStrategyAction, AdStrategyRecommendation } from '@kiditem/shared';

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
// enhanceActionsWithAi
// ─────────────────────────────────────────────

describe('AdRecommendService.enhanceActionsWithAi', () => {
  let service: AdRecommendService;
  let agentRegistry: { findByType: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    agentRegistry = { findByType: vi.fn() };
    service = new AdRecommendService(agentRegistry as never);
  });

  it('returns empty array for empty input (skip agent lookup)', async () => {
    const result = await service.enhanceActionsWithAi([], 'company-1');
    expect(result).toEqual([]);
    expect(agentRegistry.findByType).not.toHaveBeenCalled();
  });

  it('returns original actions when agent definition throws NotFoundException (graceful fallback)', async () => {
    agentRegistry.findByType.mockRejectedValue(new Error("Agent definition with type 'ad_strategy' not found"));
    const actions = [makeAction()];
    const result = await service.enhanceActionsWithAi(actions, 'company-1');
    expect(result).toEqual(actions);
  });

  it('returns original actions when agent throws generic error (graceful fallback)', async () => {
    agentRegistry.findByType.mockRejectedValue(new Error('agent unavailable'));
    const actions = [makeAction(), makeAction({ actionType: 'change_bid', priority: 'high' })];
    const result = await service.enhanceActionsWithAi(actions, 'company-1');
    expect(result).toEqual(actions);
  });

  it('returns original actions when findByType resolves null (defensive fallback)', async () => {
    agentRegistry.findByType.mockResolvedValue(null);
    const actions = [makeAction()];
    const result = await service.enhanceActionsWithAi(actions, 'company-1');
    expect(result).toEqual(actions);
  });

  it('returns original actions when agent definition belongs to another company (multi-tenant guard)', async () => {
    agentRegistry.findByType.mockResolvedValue({ id: 'def-1', type: 'ad_strategy', companyId: 'other-company' });
    const actions = [makeAction()];
    const result = await service.enhanceActionsWithAi(actions, 'company-1');
    expect(result).toEqual(actions);
    // companyId mismatch → fallback, but lookup did occur
    expect(agentRegistry.findByType).toHaveBeenCalledWith('ad_strategy');
  });

  it('returns original actions when agent definition resolves (async merge deferred elsewhere)', async () => {
    agentRegistry.findByType.mockResolvedValue({ id: 'def-1', type: 'ad_strategy', companyId: 'company-1' });
    const actions = [makeAction()];
    const result = await service.enhanceActionsWithAi(actions, 'company-1');
    // Phase 1: 정의 존재 확인만. 동기 merge 없음 (원본 shape 보존).
    expect(result).toEqual(actions);
    expect(agentRegistry.findByType).toHaveBeenCalledWith('ad_strategy');
  });
});

// ─────────────────────────────────────────────
// toRecommendations
// ─────────────────────────────────────────────

describe('AdRecommendService.toRecommendations', () => {
  let service: AdRecommendService;

  beforeEach(() => {
    service = new AdRecommendService({ findByType: vi.fn() } as never);
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
