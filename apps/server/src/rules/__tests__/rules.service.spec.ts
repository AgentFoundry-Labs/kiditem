import { describe, it, expect, vi } from 'vitest';
import { RulesService } from '../services/rules.service';
import { AgentResultReadyEvent } from '../../agent-registry/events/agent-events';
import { PANEL_EVENTS } from '../../panel/events/panel-events';

const COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PRODUCT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makePrisma() {
  return {
    agentTask: { findUnique: vi.fn(), update: vi.fn() },
    activityEvent: { create: vi.fn(), createMany: vi.fn() },
    alert: { createManyAndReturn: vi.fn() },
    product: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    businessRule: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    company: { findFirst: vi.fn() },
    $executeRawUnsafe: vi.fn(),
  };
}

function makeAgentRegistry() {
  return {
    findByType: vi.fn(),
    run: vi.fn(),
  };
}

function makeEventEmitter() {
  return { emit: vi.fn() };
}

function makeService() {
  const prisma = makePrisma();
  const registry = makeAgentRegistry();
  const eventEmitter = makeEventEmitter();
  return {
    service: new RulesService(prisma as any, registry as any, eventEmitter as any),
    prisma,
    registry,
    eventEmitter,
  };
}

describe('RulesService', () => {
  describe('evaluateAll', () => {
    it('resolves rules_evaluation definition and delegates to registry', async () => {
      const { service, registry } = makeService();
      registry.findByType.mockResolvedValue({ id: 'def-rules' });
      registry.run.mockResolvedValue({ ok: true, taskId: 'task-1', agentType: 'rules_evaluation' });

      const result = await service.evaluateAll('company-1');

      expect(registry.findByType).toHaveBeenCalledWith('rules_evaluation');
      expect(registry.run).toHaveBeenCalledWith('def-rules', {
        companyId: 'company-1',
        extra: { company_id: 'company-1' },
      });
      expect(result).toEqual({ taskId: 'task-1', status: 'running' });
    });
  });

  describe('onResultReady', () => {
    it('updates healthScores, creates events, and creates critical alerts', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.$executeRawUnsafe.mockResolvedValue(undefined);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 2 });
      const insertedAlerts = [{
        id: '11111111-1111-1111-1111-111111111111',
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
        type: 'rule_violation',
        severity: 'critical',
        title: '순이익률 -10%',
        message: 'review_pricing',
        isRead: false,
        createdAt: new Date('2026-04-15T00:00:00Z'),
      }];
      prisma.alert.createManyAndReturn.mockResolvedValue(insertedAlerts);

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-1',
        {
          products: [
            {
              productId: 'p1',
              healthScore: 85,
              violations: [
                {
                  ruleName: '리뷰 부족',
                  field: 'reviewCount',
                  severity: 'warning',
                  category: 'reviews',
                  message: '리뷰 5개 미만',
                  actionType: null,
                  value: 3,
                },
              ],
            },
            {
              productId: PRODUCT_ID,
              healthScore: 25,
              violations: [
                {
                  ruleName: '적자 상품',
                  field: 'profitRate',
                  severity: 'critical',
                  category: 'profitability',
                  message: '순이익률 -10%',
                  actionType: 'review_pricing',
                  value: -10,
                },
              ],
            },
          ],
          summary: { total: 2 },
        },
        COMPANY_ID,
      );

      await service.onResultReady(event);

      // healthScore bulk update
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHEN id = 'p1'::uuid THEN 85"),
      );

      // activity events
      expect(prisma.activityEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ objectId: 'p1', title: '리뷰 5개 미만' }),
          expect.objectContaining({ objectId: PRODUCT_ID, title: '순이익률 -10%' }),
        ]),
      });

      // critical alerts — now uses createManyAndReturn
      expect(prisma.alert.createManyAndReturn).toHaveBeenCalledWith({
        data: [expect.objectContaining({
          productId: PRODUCT_ID,
          severity: 'critical',
          title: '순이익률 -10%',
        })],
      });

      // Panel emit called with correct payload
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        PANEL_EVENTS.UPSERT,
        expect.objectContaining({
          companyId: COMPANY_ID,
          item: expect.objectContaining({
            kind: 'alert',
            id: insertedAlerts[0].id,
            severity: 'critical',
          }),
        }),
      );
    });

    it('handles empty products array gracefully', async () => {
      const { service, prisma, eventEmitter } = makeService();

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-2',
        { products: [], summary: { total: 0 } },
        COMPANY_ID,
      );

      await service.onResultReady(event);

      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(prisma.activityEvent.createMany).not.toHaveBeenCalled();
      expect(prisma.alert.createManyAndReturn).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('ignores non-rules_evaluation events', async () => {
      const { service, prisma } = makeService();

      const event = new AgentResultReadyEvent(
        'ad_strategy', 'agent-ad', 'run-3', {}, 'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('does not throw when post-processing fails', async () => {
      const { service, prisma } = makeService();
      prisma.$executeRawUnsafe.mockRejectedValue(new Error('SQL error'));

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-4',
        {
          products: [{
            productId: 'p1',
            healthScore: 50,
            violations: [],
          }],
        },
        COMPANY_ID,
      );

      // Should not throw
      await service.onResultReady(event);
    });

    it('batch cap: 51+ alerts emit single summary item instead of individual emits', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.$executeRawUnsafe.mockResolvedValue(undefined);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 51 });

      // Build 51 critical violations
      const violations = Array.from({ length: 51 }, (_, i) => ({
        productId: `prod-${i}`,
        healthScore: 10,
        violations: [{
          ruleName: `rule-${i}`,
          field: 'profitRate',
          severity: 'critical',
          category: 'profitability',
          message: `violation-${i}`,
          actionType: null,
          value: -1,
        }],
      }));

      const insertedAlerts = Array.from({ length: 51 }, (_, i) => ({
        id: `11111111-1111-1111-1111-${String(i).padStart(12, '0')}`,
        companyId: COMPANY_ID,
        productId: `prod-${i}`,
        type: 'rule_violation',
        severity: 'critical',
        title: `violation-${i}`,
        message: null,
        isRead: false,
        createdAt: new Date(),
      }));
      prisma.alert.createManyAndReturn.mockResolvedValue(insertedAlerts);

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-batch',
        { products: violations, summary: { total: 51 } },
        COMPANY_ID,
      );

      await service.onResultReady(event);

      // Should emit exactly once — summary item
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      const [eventName, payload] = eventEmitter.emit.mock.calls[0];
      expect(eventName).toBe(PANEL_EVENTS.UPSERT);
      expect(payload.item.kind).toBe('alert');
      expect(payload.item.type).toBe('batch_summary');
      expect(payload.item.title).toBe('51건의 새 알림');
      expect(payload.companyId).toBe(COMPANY_ID);
    });

    it('error isolation: emit throw does not break alert creation', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.$executeRawUnsafe.mockResolvedValue(undefined);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 1 });
      const insertedAlert = {
        id: '11111111-1111-1111-1111-111111111111',
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
        type: 'rule_violation',
        severity: 'critical',
        title: '적자 상품',
        message: null,
        isRead: false,
        createdAt: new Date(),
      };
      prisma.alert.createManyAndReturn.mockResolvedValue([insertedAlert]);
      eventEmitter.emit.mockImplementation(() => { throw new Error('SSE bus down'); });

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-emit-err',
        {
          products: [{
            productId: PRODUCT_ID,
            healthScore: 20,
            violations: [{
              ruleName: 'profitability',
              field: 'profitRate',
              severity: 'critical',
              category: 'profitability',
              message: '적자 상품',
              actionType: null,
              value: -5,
            }],
          }],
        },
        COMPANY_ID,
      );

      // Should not throw even when emit throws
      await expect(service.onResultReady(event)).resolves.not.toThrow();
      // createManyAndReturn was still called (alert creation succeeded)
      expect(prisma.alert.createManyAndReturn).toHaveBeenCalled();
    });
  });

  describe('suggestThresholds', () => {
    it('resolves rules_suggest definition and delegates', async () => {
      const { service, registry } = makeService();
      registry.findByType.mockResolvedValue({ id: 'def-suggest' });
      registry.run.mockResolvedValue({ ok: true, taskId: 'task-s1' });

      const result = await service.suggestThresholds('company-1');

      expect(registry.findByType).toHaveBeenCalledWith('rules_suggest');
      expect(result).toEqual({ taskId: 'task-s1', status: 'running' });
    });
  });
});
