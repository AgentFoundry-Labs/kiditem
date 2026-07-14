import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { RulesService } from '../services/rules.service';
import { PANEL_EVENTS } from '../../automation/adapter/out/panel-event/panel-events';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PRODUCT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RULE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER_ORGANIZATION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function makePrisma() {
  return {
    activityEvent: { create: vi.fn(), createMany: vi.fn() },
    alert: { createManyAndReturn: vi.fn() },
    channelListing: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    businessRule: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    organization: { findFirst: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  };
}

function makeAgentRunner() {
  return {
    runByType: vi.fn(),
  };
}

function makeObservability() {
  return {
    findRequest: vi.fn(),
    listRequests: vi.fn(),
    findRun: vi.fn(),
    listRuns: vi.fn(),
    listRunEvents: vi.fn(),
    listCostEvents: vi.fn(),
    listAuthorizationEvents: vi.fn(),
  };
}

function makeEventEmitter() {
  return { emit: vi.fn() };
}

function makeOperationAlerts() {
  return {
    start: vi.fn().mockResolvedValue({}),
    succeed: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
    progress: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({}),
  };
}

function makeService() {
  const prisma = makePrisma();
  const agentRunner = makeAgentRunner();
  const observability = makeObservability();
  const eventEmitter = makeEventEmitter();
  const operationAlerts = makeOperationAlerts();
  return {
    service: new RulesService(
      prisma as never,
      agentRunner as never,
      observability as never,
      eventEmitter as never,
      operationAlerts as never,
    ),
    prisma,
    agentRunner,
    observability,
    eventEmitter,
    operationAlerts,
  };
}

describe('RulesService', () => {
  describe('getSummary', () => {
    it('scopes every health summary query to active channel listings', async () => {
      const { service, prisma } = makeService();
      prisma.channelListing.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(5);
      prisma.channelListing.findFirst.mockResolvedValue({ healthUpdatedAt: null });
      prisma.channelListing.findMany.mockResolvedValue([]);

      await service.getSummary(ORGANIZATION_ID);

      for (const [query] of prisma.channelListing.count.mock.calls) {
        expect(query.where).toEqual(expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          isActive: true,
        }));
      }
      expect(prisma.channelListing.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORGANIZATION_ID, isActive: true }),
        }),
      );
      expect(prisma.channelListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORGANIZATION_ID, isActive: true }),
        }),
      );
    });
  });

  describe('evaluateAll', () => {
    it('delegates rules_evaluation through AGENT_RUNNER_PORT and surfaces the requestId', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'request-1',
        agentType: 'rules_evaluation',
        status: 'pending',
      });

      const result = await service.evaluateAll('organization-1', null);

      expect(agentRunner.runByType).toHaveBeenCalledWith('rules_evaluation', {
        organizationId: 'organization-1',
        sourceType: 'rules.evaluation',
        payload: { organization_id: 'organization-1' },
      });
      expect(result).toEqual({ requestId: 'request-1', status: 'pending' });
    });

    it('returns an unavailable status when the agent instance is missing', async () => {
      const { service, agentRunner, operationAlerts } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: false,
        agentType: 'rules_evaluation',
        reason: 'agent_instance_not_found',
      });

      const result = await service.evaluateAll('organization-2', null);

      expect(result).toEqual({ requestId: undefined, status: 'unavailable' });
      // No operation alert when the agent run was never queued.
      expect(operationAlerts.start).not.toHaveBeenCalled();
    });

    it('forwards triggeredByUserId to AGENT_RUNNER_PORT.requestedByUserId so the FINALIZED bridge can fall back to a user alert', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'request-actor',
        agentType: 'rules_evaluation',
        status: 'pending',
      });

      await service.evaluateAll(ORGANIZATION_ID, 'user-7');

      expect(agentRunner.runByType).toHaveBeenCalledWith(
        'rules_evaluation',
        expect.objectContaining({ requestedByUserId: 'user-7' }),
      );
    });

    it('opens a running operation alert keyed by the requestId on successful queue', async () => {
      const { service, agentRunner, operationAlerts } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'request-42',
        agentType: 'rules_evaluation',
        status: 'pending',
      });

      await service.evaluateAll(ORGANIZATION_ID, 'user-7');

      expect(operationAlerts.start).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          operationKey: 'rules.evaluation:request-42',
          type: 'rules_evaluation',
          sourceType: 'agent_run_request',
          sourceId: 'request-42',
          actorUserId: 'user-7',
        }),
      );
    });
  });

  describe('processEvaluationResult', () => {
    it('updates healthScores, creates events, and creates critical alerts', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 2 });
      const insertedAlerts = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          organizationId: ORGANIZATION_ID,
          targetType: 'listing',
          targetId: PRODUCT_ID,
          kind: 'signal',
          status: 'open',
          type: 'rule_violation',
          severity: 'critical',
          title: '순이익률 -10%',
          message: 'review_pricing',
          operationKey: null,
          sourceType: null,
          sourceId: null,
          actorUserId: null,
          href: null,
          progress: null,
          metadata: {},
          isRead: false,
          readAt: null,
          actionTaskId: null,
          startedAt: null,
          finishedAt: null,
          createdAt: new Date('2026-04-15T00:00:00Z'),
          updatedAt: new Date('2026-04-15T00:00:00Z'),
        },
      ];
      prisma.alert.createManyAndReturn.mockResolvedValue(insertedAlerts);

      await service.processEvaluationResult({
        organizationId: ORGANIZATION_ID,
        runId: 'run-1',
        products: [
          {
            masterId: 'p1',
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
            masterId: PRODUCT_ID,
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
      });

      // healthScore bulk update — Prisma updateMany scoped by (id, organizationId), wrapped in $transaction.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.channelListing.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', organizationId: ORGANIZATION_ID },
        data: expect.objectContaining({ healthScore: 85 }),
      });
      expect(prisma.channelListing.updateMany).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID, organizationId: ORGANIZATION_ID },
        data: expect.objectContaining({ healthScore: 25 }),
      });

      // activity events
      expect(prisma.activityEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ objectId: 'p1', title: '리뷰 5개 미만' }),
          expect.objectContaining({ objectId: PRODUCT_ID, title: '순이익률 -10%' }),
        ]),
      });

      // critical alerts — uses createManyAndReturn
      expect(prisma.alert.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            targetType: 'listing',
            targetId: PRODUCT_ID,
            severity: 'critical',
            title: '순이익률 -10%',
          }),
        ],
      });

      // Panel emit called with correct payload
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        PANEL_EVENTS.UPSERT,
        expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          item: expect.objectContaining({
            kind: 'alert',
            id: insertedAlerts[0].id,
            severity: 'critical',
          }),
        }),
      );
    });

    it('closes the operation alert with succeed when requestId is supplied', async () => {
      const { service, prisma, operationAlerts } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 1 });
      prisma.alert.createManyAndReturn.mockResolvedValue([]);

      await service.processEvaluationResult({
        organizationId: ORGANIZATION_ID,
        runId: 'run-x',
        requestId: 'request-99',
        products: [
          {
            masterId: 'p1',
            healthScore: 80,
            violations: [
              {
                ruleName: 'r',
                field: 'reviewCount',
                severity: 'warning',
                category: 'reviews',
                message: 'msg',
                actionType: null,
                value: 1,
              },
            ],
          },
        ],
      });

      expect(operationAlerts.succeed).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        'rules.evaluation:request-99',
        expect.objectContaining({
          metadata: expect.objectContaining({
            productCount: 1,
            violationCount: 1,
            runId: 'run-x',
          }),
        }),
      );
      expect(operationAlerts.fail).not.toHaveBeenCalled();
    });

    it('closes the operation alert with fail when post-processing throws', async () => {
      const { service, prisma, operationAlerts } = makeService();
      prisma.$transaction.mockRejectedValue(new Error('SQL boom'));

      await service.processEvaluationResult({
        organizationId: ORGANIZATION_ID,
        runId: 'run-x',
        requestId: 'request-99',
        products: [
          { masterId: 'p1', healthScore: 50, violations: [] },
        ],
      });

      expect(operationAlerts.fail).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        'rules.evaluation:request-99',
        expect.objectContaining({ message: 'SQL boom' }),
      );
      expect(operationAlerts.succeed).not.toHaveBeenCalled();
    });

    it('skips operation alert close when no requestId in payload', async () => {
      const { service, prisma, operationAlerts } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 0 });
      prisma.alert.createManyAndReturn.mockResolvedValue([]);

      await service.processEvaluationResult({
        organizationId: ORGANIZATION_ID,
        runId: 'run-y',
        products: [
          { masterId: 'p1', healthScore: 90, violations: [] },
        ],
      });

      expect(operationAlerts.succeed).not.toHaveBeenCalled();
      expect(operationAlerts.fail).not.toHaveBeenCalled();
    });

    it('handles empty products array gracefully', async () => {
      const { service, prisma, eventEmitter } = makeService();

      await service.processEvaluationResult({
        organizationId: ORGANIZATION_ID,
        runId: 'run-2',
        products: [],
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.activityEvent.createMany).not.toHaveBeenCalled();
      expect(prisma.alert.createManyAndReturn).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does not throw when post-processing fails', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockRejectedValue(new Error('SQL error'));

      await expect(
        service.processEvaluationResult({
          organizationId: ORGANIZATION_ID,
          runId: 'run-4',
          products: [
            {
              masterId: 'p1',
              healthScore: 50,
              violations: [],
            },
          ],
        }),
      ).resolves.not.toThrow();
    });

    it('batch cap: 51+ alerts emit single summary item instead of individual emits', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 51 });

      // Build 51 critical violations
      const violations = Array.from({ length: 51 }, (_, i) => ({
        masterId: `prod-${i}`,
        healthScore: 10,
        violations: [
          {
            ruleName: `rule-${i}`,
            field: 'profitRate',
            severity: 'critical',
            category: 'profitability',
            message: `violation-${i}`,
            actionType: null,
            value: -1,
          },
        ],
      }));

      const insertedAlerts = Array.from({ length: 51 }, (_, i) => ({
        id: `11111111-1111-1111-1111-${String(i).padStart(12, '0')}`,
        organizationId: ORGANIZATION_ID,
        targetType: 'listing',
        targetId: `prod-${i}`,
        kind: 'signal',
        status: 'open',
        type: 'rule_violation',
        severity: 'critical',
        title: `violation-${i}`,
        message: null,
        operationKey: null,
        sourceType: null,
        sourceId: null,
        actorUserId: null,
        href: null,
        progress: null,
        metadata: {},
        isRead: false,
        readAt: null,
        actionTaskId: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      prisma.alert.createManyAndReturn.mockResolvedValue(insertedAlerts);

      await service.processEvaluationResult({
        organizationId: ORGANIZATION_ID,
        runId: 'run-batch',
        products: violations,
      });

      // Should emit exactly once — summary item
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      const [eventName, payload] = eventEmitter.emit.mock.calls[0];
      expect(eventName).toBe(PANEL_EVENTS.UPSERT);
      expect(payload.item.kind).toBe('alert');
      expect(payload.item.type).toBe('batch_summary');
      expect(payload.item.title).toBe('51건의 새 알림');
      expect(payload.organizationId).toBe(ORGANIZATION_ID);
    });

    it('error isolation: emit throw does not break alert creation', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 1 });
      const insertedAlert = {
        id: '11111111-1111-1111-1111-111111111111',
        organizationId: ORGANIZATION_ID,
        targetType: 'listing',
        targetId: PRODUCT_ID,
        kind: 'signal',
        status: 'open',
        type: 'rule_violation',
        severity: 'critical',
        title: '적자 상품',
        message: null,
        operationKey: null,
        sourceType: null,
        sourceId: null,
        actorUserId: null,
        href: null,
        progress: null,
        metadata: {},
        isRead: false,
        readAt: null,
        actionTaskId: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.alert.createManyAndReturn.mockResolvedValue([insertedAlert]);
      eventEmitter.emit.mockImplementation(() => {
        throw new Error('SSE bus down');
      });

      await expect(
        service.processEvaluationResult({
          organizationId: ORGANIZATION_ID,
          runId: 'run-emit-err',
          products: [
            {
              masterId: PRODUCT_ID,
              healthScore: 20,
              violations: [
                {
                  ruleName: 'profitability',
                  field: 'profitRate',
                  severity: 'critical',
                  category: 'profitability',
                  message: '적자 상품',
                  actionType: null,
                  value: -5,
                },
              ],
            },
          ],
        }),
      ).resolves.not.toThrow();

      // createManyAndReturn was still called (alert creation succeeded)
      expect(prisma.alert.createManyAndReturn).toHaveBeenCalled();
    });
  });

  describe('getEvaluationStatus', () => {
    it('reads through AgentObservabilityService scoped by (organizationId, requestId)', async () => {
      const { service, observability } = makeService();
      const stored = {
        id: 'request-1',
        organizationId: ORGANIZATION_ID,
        status: 'pending',
      } as never;
      observability.findRequest.mockResolvedValue(stored);

      const result = await service.getEvaluationStatus(ORGANIZATION_ID, 'request-1');

      expect(observability.findRequest).toHaveBeenCalledWith({
        organizationId: ORGANIZATION_ID,
        requestId: 'request-1',
      });
      expect(result).toBe(stored);
    });

    it('throws NotFoundException when the request does not belong to the organization', async () => {
      const { service, observability } = makeService();
      observability.findRequest.mockResolvedValue(null);

      await expect(
        service.getEvaluationStatus(ORGANIZATION_ID, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('suggestThresholds', () => {
    it('delegates rules_suggest through AGENT_RUNNER_PORT and surfaces the requestId', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'request-s1',
        agentType: 'rules_suggest',
        status: 'pending',
      });

      const result = await service.suggestThresholds('organization-1');

      expect(agentRunner.runByType).toHaveBeenCalledWith('rules_suggest', {
        organizationId: 'organization-1',
        sourceType: 'rules.suggest',
        payload: { organization_id: 'organization-1' },
      });
      expect(result).toEqual({ requestId: 'request-s1', status: 'pending' });
    });
  });

  describe('updateRule — tenant scope (IDOR prevention)', () => {
    it('reads tenant-scoped row first, then updates by id once authorised', async () => {
      const { service, prisma } = makeService();
      prisma.businessRule.findFirst.mockResolvedValue({ id: RULE_ID, organizationId: ORGANIZATION_ID });
      prisma.businessRule.update.mockResolvedValue({ id: RULE_ID, active: false });

      const result = await service.updateRule(RULE_ID, ORGANIZATION_ID, { active: false });

      // Tenant-scoped read happens BEFORE the write (apps/server/AGENTS.md
      // 멀티테넌트 격리 — 회사 스코프).
      expect(prisma.businessRule.findFirst).toHaveBeenCalledWith({
        where: { id: RULE_ID, organizationId: ORGANIZATION_ID },
      });
      expect(prisma.businessRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { active: false },
      });
      expect(result).toEqual({ id: RULE_ID, active: false });
    });

    it('throws NotFoundException when the rule belongs to another organization (no write)', async () => {
      const { service, prisma } = makeService();
      // Cross-tenant read returns null — service must NOT proceed to update.
      prisma.businessRule.findFirst.mockResolvedValue(null);

      await expect(
        service.updateRule(RULE_ID, OTHER_ORGANIZATION_ID, { active: false }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.businessRule.findFirst).toHaveBeenCalledWith({
        where: { id: RULE_ID, organizationId: OTHER_ORGANIZATION_ID },
      });
      expect(prisma.businessRule.update).not.toHaveBeenCalled();
    });

    it('forwards threshold/active/autoExecute fields on the data payload', async () => {
      const { service, prisma } = makeService();
      prisma.businessRule.findFirst.mockResolvedValue({ id: RULE_ID, organizationId: ORGANIZATION_ID });
      prisma.businessRule.update.mockResolvedValue({ id: RULE_ID });

      await service.updateRule(RULE_ID, ORGANIZATION_ID, {
        threshold: { min: 10 },
        active: true,
        autoExecute: false,
      });

      expect(prisma.businessRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { threshold: { min: 10 }, active: true, autoExecute: false },
      });
    });
  });
});
