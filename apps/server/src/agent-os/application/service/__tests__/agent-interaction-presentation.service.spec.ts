import { describe, expect, it, vi } from 'vitest';
import { AgentInteractionPresentationService } from '../agent-interaction-presentation.service';

const actor = {
  organizationId: 'organization-1',
  userId: 'user-1',
  sessionId: 'session-1',
};

describe('AgentInteractionPresentationService', () => {
  it.each([
    ['agent_os.platform_probe', { outputSummary: { status: 'available' } }, 'notice'],
    ['analytics.readOverview', { outputSummary: {
      sales: { revenue: 12000, orders: 3 },
      inventory: { outOfStockSkus: 2, mappingAttentionSkus: 1 },
      freshness: { lastSync: '2026-08-13T00:00:00.000Z', confirmedUntil: '2026-08-13' },
    } }, 'metric_group'],
    ['sourcing.retrieveWorkspaceEvidence', { outputSummary: {
      inputHash: 'a'.repeat(64), documentCount: 1, citationIds: ['document-1'], dataGaps: [],
    } }, 'resource_list'],
    ['sourcing.inspectRecommendationRun', { outputSummary: {
      runId: 'run-1', status: 'complete', businessDate: '2026-08-13', itemCount: 4,
      warningCodes: [], validation: { itemCount: 4, missingCount: 0 },
    } }, 'comparison'],
  ])('projects %s capability output to a fixed %s result', (key, result, kind) => {
    const service = new AgentInteractionPresentationService();
    expect(service.projectCapabilityResult(actor, key, result)).toMatchObject({
      kind,
      textFallback: expect.any(String),
    });
  });

  it('rejects capabilities without a server-owned projector', () => {
    const service = new AgentInteractionPresentationService();
    expect(() => service.projectCapabilityResult(actor, 'admin.delete', {
      outputSummary: { component: 'AdminPanel', url: 'https://attacker.example' },
    })).toThrow('INTERACTION_PRESENTATION_INVALID');
  });

  it('validates registered results and mints navigation authority server-side', () => {
    const service = new AgentInteractionPresentationService(
      () => new Date('2026-08-13T00:00:00.000Z'),
      () => '11111111-1111-4111-8111-111111111111',
    );

    expect(service.present(actor, {
      kind: 'navigation',
      routeKey: 'inventory_stock_ops',
      resourceRef: null,
      label: '재고 작업',
      disabledReason: null,
      textFallback: '재고 작업으로 이동합니다.',
    })).toEqual({
      kind: 'navigation',
      actionId: '11111111-1111-4111-8111-111111111111',
      routeKey: 'inventory_stock_ops',
      resourceRef: null,
      label: '재고 작업',
      disabledReason: null,
      expiresAt: '2026-08-13T00:05:00.000Z',
      textFallback: '재고 작업으로 이동합니다.',
    });
  });

  it.each([
    { component: 'AdminPanel' },
    { style: { display: 'none' } },
    { url: 'https://attacker.example' },
    { actionId: '11111111-1111-4111-8111-111111111111' },
    { expiresAt: '2099-01-01T00:00:00.000Z' },
  ])('rejects model-authored navigation authority $component$actionId$url', (authority) => {
    const service = new AgentInteractionPresentationService();
    expect(() => service.present(actor, {
      kind: 'navigation',
      routeKey: 'agent_os',
      resourceRef: null,
      label: 'AgentOS',
      disabledReason: null,
      textFallback: 'AgentOS로 이동합니다.',
      ...authority,
    })).toThrow();
  });

  it('rejects missing fallback and unsafe resource references', () => {
    const service = new AgentInteractionPresentationService();
    expect(() => service.present(actor, {
      kind: 'resource_list',
      title: '상품',
      items: [{
        label: '상품',
        description: null,
        resourceRef: { kind: 'product', id: 'product-1', version: null, url: '/admin' },
      }],
    })).toThrow();
  });

  it('authorizes only the owning actor before expiry and returns an allowlisted href', () => {
    const clock = vi.fn(() => new Date('2026-08-13T00:00:00.000Z'));
    const service = new AgentInteractionPresentationService(
      clock,
      () => '11111111-1111-4111-8111-111111111111',
    );
    const navigation = service.present(actor, {
      kind: 'navigation',
      routeKey: 'inventory_stock_ops',
      resourceRef: null,
      label: '재고 작업',
      disabledReason: null,
      textFallback: '재고 작업으로 이동합니다.',
    });
    if (navigation.kind !== 'navigation') throw new Error('expected navigation');

    expect(service.authorize(actor, navigation.actionId)).toEqual({ href: '/stock-ops' });
    expect(() => service.authorize({ ...actor, userId: 'attacker' }, navigation.actionId)).toThrow(
      'INTERACTION_NAVIGATION_NOT_AUTHORIZED',
    );
    clock.mockReturnValue(new Date('2026-08-13T00:06:00.000Z'));
    expect(() => service.authorize(actor, navigation.actionId)).toThrow(
      'INTERACTION_NAVIGATION_EXPIRED',
    );
  });

  it('requires a versioned allowlisted resource reference for candidate navigation', () => {
    const service = new AgentInteractionPresentationService();
    expect(() => service.present(actor, {
      kind: 'navigation',
      routeKey: 'sourcing_candidate',
      resourceRef: { kind: 'sourcing_candidate', id: 'candidate-1', version: null },
      label: '후보 보기',
      disabledReason: null,
      textFallback: '후보를 확인합니다.',
    })).toThrow('INTERACTION_NAVIGATION_RESOURCE_INVALID');
  });

  it('revalidates current resource access and version before authorizing navigation', () => {
    const canAccess = vi.fn((requestActor, ref) =>
      requestActor.organizationId === actor.organizationId && ref.version === '7');
    const service = new AgentInteractionPresentationService(undefined, undefined, canAccess);
    const navigation = service.present(actor, {
      kind: 'navigation',
      routeKey: 'sourcing_candidate',
      resourceRef: { kind: 'sourcing_candidate', id: 'candidate-1', version: '7' },
      label: '후보 보기',
      disabledReason: null,
      textFallback: '후보를 확인합니다.',
    });
    if (navigation.kind !== 'navigation') throw new Error('expected navigation');

    expect(service.authorize(actor, navigation.actionId)).toEqual({
      href: '/sourcing-ai/recommendations',
    });
    expect(canAccess).toHaveBeenCalledWith(actor, navigation.resourceRef);
  });
});
