import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManagerWorkflowService } from '../manager-workflow.service';

function makePrisma() {
  return {
    agentWorkflow: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    agentDefinition: {
      findUnique: vi.fn(),
    },
  };
}

function makeHeartbeat() {
  return {
    wakeAgent: vi.fn().mockResolvedValue({ ok: true, queued: false, wakeupId: 'w-1' }),
  };
}

function makeEventEmitter() {
  return { emit: vi.fn() };
}

describe('ManagerWorkflowService', () => {
  let service: ManagerWorkflowService;
  let prisma: ReturnType<typeof makePrisma>;
  let heartbeat: ReturnType<typeof makeHeartbeat>;
  let eventEmitter: ReturnType<typeof makeEventEmitter>;

  beforeEach(() => {
    prisma = makePrisma();
    heartbeat = makeHeartbeat();
    eventEmitter = makeEventEmitter();
    service = new ManagerWorkflowService(
      prisma as any,
      heartbeat as any,
      eventEmitter as any,
    );
  });

  describe('startWorkflow', () => {
    it('creates workflow and pauses at approval_needed step', async () => {
      const baseWorkflow = {
        id: 'wf-1',
        agentId: 'a-1',
        companyId: 'c-1',
        currentStep: 0,
        steps: [],
        state: {},
        input: null,
        status: 'running',
      };
      prisma.agentWorkflow.create.mockResolvedValue(baseWorkflow);
      prisma.agentWorkflow.findUnique.mockResolvedValue(baseWorkflow);
      prisma.agentWorkflow.update.mockResolvedValue(baseWorkflow);
      prisma.agentDefinition.findUnique.mockResolvedValue({
        id: 'agent-inv',
        type: 'inventory_alert',
      });

      const result = await service.startWorkflow({
        agentId: 'a-1',
        companyId: 'c-1',
        type: 'inventory_then_ad_stop',
        steps: [
          { type: 'run_agent', agentType: 'inventory_alert', message: '재고 확인' },
          { type: 'approval_needed', message: '광고 중단 승인 필요' },
        ],
      });

      expect(result.workflowId).toBe('wf-1');
      expect(result.yield.type).toBe('approval_needed');
      expect(heartbeat.wakeAgent).toHaveBeenCalledTimes(1);
    });

    it('completes workflow when no approval steps', async () => {
      const baseWorkflow = {
        id: 'wf-2',
        agentId: 'a-1',
        companyId: 'c-1',
        currentStep: 0,
        steps: [],
        state: {},
        input: null,
        status: 'running',
      };
      prisma.agentWorkflow.create.mockResolvedValue(baseWorkflow);
      prisma.agentWorkflow.findUnique.mockResolvedValue(baseWorkflow);
      prisma.agentWorkflow.update.mockResolvedValue(baseWorkflow);
      prisma.agentDefinition.findUnique.mockResolvedValue({
        id: 'agent-inv',
        type: 'inventory_alert',
      });

      const result = await service.startWorkflow({
        agentId: 'a-1',
        companyId: 'c-1',
        type: 'simple_check',
        steps: [{ type: 'run_agent', agentType: 'inventory_alert' }],
      });

      expect(result.yield.type).toBe('completed');
    });
  });

  describe('resumeWorkflow', () => {
    it('rejects when user denies approval', async () => {
      prisma.agentWorkflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        status: 'awaiting_approval',
        input: { _stepDefs: [] },
        state: {},
        companyId: 'c-1',
        currentStep: 1,
        steps: [],
      });
      prisma.agentWorkflow.update.mockResolvedValue({});

      const result = await service.resumeWorkflow('wf-1', { approved: false });

      expect(result.yield.type).toBe('failed');
      expect(result.yield).toMatchObject({ error: 'User rejected approval' });
    });

    it('throws when workflow is not awaiting approval', async () => {
      prisma.agentWorkflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        status: 'completed',
        input: {},
      });

      await expect(
        service.resumeWorkflow('wf-1', { approved: true }),
      ).rejects.toThrow('not awaiting approval');
    });
  });
});
