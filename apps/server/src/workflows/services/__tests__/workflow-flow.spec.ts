import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowsService } from '../workflows.service';
import { WorkflowRunnerService } from '../workflow-runner.service';
import { registerNode, getExecutor } from '../../executors/index';
import '../../executors/builtin';

// ── Prisma mock factory ──────────────────────────────────────────────────────

function makePrisma() {
  return {
    workflowTemplate: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workflowRun: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    alert: {
      create: vi.fn(),
    },
    activityEvent: {
      create: vi.fn(),
    },
  };
}

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeTemplate(overrides: Record<string, any> = {}) {
  return {
    id: 'tmpl-1',
    companyId: 'company-1',
    name: '주문 처리 워크플로우',
    description: '주문 자동 처리',
    module: 'order',
    triggerType: 'manual',
    schedule: null,
    isActive: true,
    version: 1,
    nodesJson: [],
    edgesJson: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRun(overrides: Record<string, any> = {}) {
  return {
    id: 'run-1',
    templateId: 'tmpl-1',
    companyId: 'company-1',
    status: 'pending',
    triggeredBy: 'manual',
    triggeredByUserId: null,
    contextData: null,
    steps: [],
    error: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── WorkflowsService ─────────────────────────────────────────────────────────

describe('WorkflowsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let runner: { runWorkflow: ReturnType<typeof vi.fn>; runBatch: ReturnType<typeof vi.fn> };
  let service: WorkflowsService;

  beforeEach(() => {
    prisma = makePrisma();
    runner = { runWorkflow: vi.fn(), runBatch: vi.fn() };
    const eventEmitter = { emit: vi.fn() };
    service = new WorkflowsService(prisma as any, runner as any, eventEmitter as any);
  });

  describe('triggerRun', () => {
    it('creates WorkflowRun with status="pending" and fires runner async', async () => {
      const run = makeRun();
      prisma.workflowTemplate.findFirst.mockResolvedValue(makeTemplate());
      prisma.workflowRun.create.mockResolvedValue(run);
      runner.runWorkflow.mockResolvedValue(undefined);

      const result = await service.triggerRun('tmpl-1', 'company-1', { triggeredBy: 'manual' });

      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tmpl-1', companyId: 'company-1' } }),
      );
      expect(prisma.workflowRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateId: 'tmpl-1',
          status: 'pending',
          triggeredBy: 'manual',
        }),
      });
      expect(result.status).toBe('pending');
      expect(result.id).toBe('run-1');

      // runner.runWorkflow is called asynchronously (fire-and-forget),
      // so we allow a tick for the micro-task to schedule
      await Promise.resolve();
      expect(runner.runWorkflow).toHaveBeenCalledWith('run-1', 'tmpl-1');
    });

    it('stores companyId from template and triggeredByUserId for manual trigger', async () => {
      const run = makeRun({ companyId: 'company-1', triggeredByUserId: 'user-x' });
      prisma.workflowTemplate.findFirst.mockResolvedValue(makeTemplate({ companyId: 'company-1' }));
      prisma.workflowRun.create.mockResolvedValue(run);
      runner.runWorkflow.mockResolvedValue(undefined);

      await service.triggerRun('tmpl-1', 'company-1', { triggeredBy: 'manual', triggeredByUserId: 'user-x' });

      expect(prisma.workflowRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'company-1',
          triggeredByUserId: 'user-x',
        }),
      });
    });

    it('throws NotFoundException when template does not exist', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(service.triggerRun('nonexistent', 'company-1', { triggeredBy: 'manual' })).rejects.toThrow('nonexistent');
    });

    it('throws NotFoundException when template belongs to a different company (IDOR guard)', async () => {
      // findFirst with mismatched companyId returns null → 404
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.triggerRun('tmpl-1', 'company-OTHER', { triggeredBy: 'manual' }),
      ).rejects.toThrow('tmpl-1');

      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tmpl-1', companyId: 'company-OTHER' } }),
      );
      expect(prisma.workflowRun.create).not.toHaveBeenCalled();
      expect(runner.runWorkflow).not.toHaveBeenCalled();
    });

    it('passes context data when provided', async () => {
      const run = makeRun({ contextData: { productId: 'prod-1' } });
      prisma.workflowTemplate.findFirst.mockResolvedValue(makeTemplate());
      prisma.workflowRun.create.mockResolvedValue(run);
      runner.runWorkflow.mockResolvedValue(undefined);

      await service.triggerRun('tmpl-1', 'company-1', { triggeredBy: 'manual', context: { productId: 'prod-1' } });

      expect(prisma.workflowRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ contextData: { productId: 'prod-1' } }),
      });
    });
  });

  describe('findRunDetail', () => {
    it('returns run detail with steps when companyId matches', async () => {
      const run = makeRun({
        status: 'succeeded',
        steps: [
          { nodeId: 'n1', nodeType: 'trigger.manual', status: 'succeeded', outputData: { triggeredAt: '2026-01-01' } },
        ],
      });
      prisma.workflowRun.findFirst.mockResolvedValue(run);

      const result = await service.findRunDetail('run-1', 'company-1');

      expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith({ where: { id: 'run-1', companyId: 'company-1' } });
      expect(result.status).toBe('succeeded');
      expect(result.steps).toHaveLength(1);
    });

    it('throws NotFoundException when run belongs to a different company (IDOR guard)', async () => {
      prisma.workflowRun.findFirst.mockResolvedValue(null);

      await expect(service.findRunDetail('run-1', 'company-OTHER')).rejects.toThrow('run-1');
      expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith({ where: { id: 'run-1', companyId: 'company-OTHER' } });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when template belongs to a different company (IDOR guard)', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(service.findOne('tmpl-1', 'company-OTHER')).rejects.toThrow('tmpl-1');
      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tmpl-1', companyId: 'company-OTHER' } }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException without writing when template belongs to a different company', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.update('tmpl-1', 'company-OTHER', { name: 'hacked' } as any),
      ).rejects.toThrow('tmpl-1');
      expect(prisma.workflowTemplate.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException without deleting when template belongs to a different company', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(service.remove('tmpl-1', 'company-OTHER')).rejects.toThrow('tmpl-1');
      expect(prisma.workflowTemplate.delete).not.toHaveBeenCalled();
    });
  });

  describe('batchRun', () => {
    it('allows duplicate owned templateIds while preserving requested run count', async () => {
      prisma.workflowTemplate.findMany.mockResolvedValue([
        { id: 'tmpl-1', companyId: 'company-1' },
      ]);
      prisma.workflowRun.create.mockImplementation(({ data }: any) =>
        Promise.resolve(makeRun({ id: `run-${data.templateId}-${prisma.workflowRun.create.mock.calls.length}`, ...data })),
      );
      runner.runBatch.mockResolvedValue(undefined);

      const result = await service.batchRun(['tmpl-1', 'tmpl-1'], 'company-1', { triggeredBy: 'manual' });

      expect(prisma.workflowTemplate.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['tmpl-1'] }, companyId: 'company-1' },
        select: { id: true, companyId: true },
      });
      expect(prisma.workflowRun.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('throws NotFoundException when any templateId is owned by a different company', async () => {
      // Only one of the two requested templates is found under company-1
      prisma.workflowTemplate.findMany.mockResolvedValue([
        { id: 'tmpl-1', companyId: 'company-1' },
      ]);

      await expect(
        service.batchRun(['tmpl-1', 'tmpl-foreign'], 'company-1', { triggeredBy: 'manual' }),
      ).rejects.toThrow('tmpl-foreign');
      expect(prisma.workflowRun.create).not.toHaveBeenCalled();
      expect(runner.runBatch).not.toHaveBeenCalled();
    });
  });

  describe('findRuns', () => {
    it('throws NotFoundException when template belongs to a different company without listing runs', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(service.findRuns('tmpl-1', 'company-OTHER')).rejects.toThrow('tmpl-1');
      expect(prisma.workflowRun.findMany).not.toHaveBeenCalled();
    });

    it('lists runs scoped to (templateId, companyId) when ownership verified', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue({ id: 'tmpl-1' });
      prisma.workflowRun.findMany.mockResolvedValue([makeRun()]);

      const result = await service.findRuns('tmpl-1', 'company-1');

      expect(prisma.workflowRun.findMany).toHaveBeenCalledWith({
        where: { templateId: 'tmpl-1', companyId: 'company-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });
});

// ── WorkflowRunnerService ────────────────────────────────────────────────────

describe('WorkflowRunnerService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let runner: WorkflowRunnerService;

  beforeEach(() => {
    prisma = makePrisma();
    const eventEmitter = { emit: vi.fn() };
    runner = new WorkflowRunnerService(prisma as any, eventEmitter as any);
  });

  // Helper to build a run DB fixture (with step tracking state)
  function setupRunTracking(runId: string, contextData: Record<string, any> = {}) {
    const runRecord = makeRun({ id: runId, contextData, steps: [] });

    // findUnique for run context and for step tracking — always return current state
    prisma.workflowRun.findUnique.mockImplementation(({ where }: any) => {
      if (where.id === runId) return Promise.resolve({ ...runRecord, steps: [] });
      return Promise.resolve(null);
    });

    // Track step mutations
    let steps: any[] = [];
    prisma.workflowRun.update.mockImplementation(({ where, data }: any) => {
      if (where.id === runId && data.steps !== undefined) {
        steps = data.steps;
        // update in-flight findUnique to reflect latest steps
        prisma.workflowRun.findUnique.mockImplementation(() =>
          Promise.resolve({ ...runRecord, steps }),
        );
      }
      return Promise.resolve({ ...runRecord, ...data, steps });
    });
  }

  describe('runWorkflow', () => {
    it('executes nodes in topological order for a linear DAG', async () => {
      const executionOrder: string[] = [];

      // Register test executors that track call order
      registerNode('test.first', async () => {
        executionOrder.push('first');
        return { data: 'from-first' };
      });
      registerNode('test.second', async () => {
        executionOrder.push('second');
        return { data: 'from-second' };
      });

      const nodesJson = [
        { id: 'n1', data: { nodeType: 'test.first', label: '첫 번째', config: {} }, position: { x: 0, y: 0 } },
        { id: 'n2', data: { nodeType: 'test.second', label: '두 번째', config: {} }, position: { x: 200, y: 0 } },
      ];
      const edgesJson = [{ id: 'e1', source: 'n1', target: 'n2' }];

      const template = makeTemplate({ nodesJson, edgesJson });
      prisma.workflowTemplate.findUnique.mockResolvedValue(template);
      setupRunTracking('run-1');

      await runner.runWorkflow('run-1', 'tmpl-1');

      expect(executionOrder).toEqual(['first', 'second']);

      // Final update should be 'succeeded'
      const completedCall = prisma.workflowRun.update.mock.calls.find(
        ([args]: any[]) => args.data?.status === 'succeeded',
      );
      expect(completedCall).toBeDefined();
    });

    it('passes previous node output to context for next node consumption', async () => {
      let capturedContextOutput: any;

      registerNode('test.producer', async () => {
        return { items: [{ id: 'item-1' }], count: 1 };
      });

      registerNode('test.consumer', async (_prisma, _config, context) => {
        capturedContextOutput = context.getOutput('n1');
        return { consumed: true };
      });

      const nodesJson = [
        { id: 'n1', data: { nodeType: 'test.producer', label: 'Producer', config: {} }, position: { x: 0, y: 0 } },
        { id: 'n2', data: { nodeType: 'test.consumer', label: 'Consumer', config: {} }, position: { x: 200, y: 0 } },
      ];
      const edgesJson = [{ id: 'e1', source: 'n1', target: 'n2' }];

      const template = makeTemplate({ nodesJson, edgesJson });
      prisma.workflowTemplate.findUnique.mockResolvedValue(template);
      setupRunTracking('run-2');

      await runner.runWorkflow('run-2', 'tmpl-1');

      expect(capturedContextOutput).toBeDefined();
      expect((capturedContextOutput as any).count).toBe(1);
    });

    it('all nodes complete → run status="completed"', async () => {
      registerNode('test.simple', async () => ({ ok: true }));

      const nodesJson = [
        { id: 'n1', data: { nodeType: 'test.simple', label: '단순', config: {} }, position: { x: 0, y: 0 } },
      ];

      const template = makeTemplate({ nodesJson, edgesJson: [] });
      prisma.workflowTemplate.findUnique.mockResolvedValue(template);
      setupRunTracking('run-3');

      await runner.runWorkflow('run-3', 'tmpl-1');

      const statusUpdates = prisma.workflowRun.update.mock.calls.map(
        ([args]: any[]) => args.data?.status,
      ).filter(Boolean);

      expect(statusUpdates).toContain('running');
      expect(statusUpdates).toContain('succeeded');
    });

    it('node failure → run status="failed", error recorded', async () => {
      registerNode('test.failing', async () => {
        throw new Error('executor 오류 발생');
      });

      const nodesJson = [
        { id: 'n1', data: { nodeType: 'test.failing', label: '실패 노드', config: {} }, position: { x: 0, y: 0 } },
      ];

      const template = makeTemplate({ nodesJson, edgesJson: [] });
      prisma.workflowTemplate.findUnique.mockResolvedValue(template);
      setupRunTracking('run-4');

      await runner.runWorkflow('run-4', 'tmpl-1');

      const failedCall = prisma.workflowRun.update.mock.calls.find(
        ([args]: any[]) => args.data?.status === 'failed',
      );
      expect(failedCall).toBeDefined();
      const failedData = (failedCall as any)[0].data;
      expect(failedData.error).toContain('executor 오류 발생');
    });

    it('template not found → run marked as failed immediately', async () => {
      prisma.workflowTemplate.findUnique.mockResolvedValue(null);

      // Minimal run stub (runner accesses workflowRun.findUnique and update)
      prisma.workflowRun.findUnique.mockResolvedValue(makeRun({ id: 'run-5' }));
      prisma.workflowRun.update.mockResolvedValue({});

      await runner.runWorkflow('run-5', 'tmpl-nonexistent');

      expect(prisma.workflowRun.update).toHaveBeenCalledWith({
        where: { id: 'run-5' },
        data: { status: 'failed', error: 'Template not found' },
      });
    });

    it('unknown node type → throws and records error in steps', async () => {
      const nodesJson = [
        { id: 'n1', data: { nodeType: 'nonexistent.executor', label: '알 수 없는 노드', config: {} }, position: { x: 0, y: 0 } },
      ];

      const template = makeTemplate({ nodesJson, edgesJson: [] });
      prisma.workflowTemplate.findUnique.mockResolvedValue(template);
      setupRunTracking('run-6');

      await runner.runWorkflow('run-6', 'tmpl-1');

      // Should have failed run record
      const failedCall = prisma.workflowRun.update.mock.calls.find(
        ([args]: any[]) => args.data?.status === 'failed',
      );
      expect(failedCall).toBeDefined();
    });

    it('executor called with resolved config (company_id injected)', async () => {
      let capturedConfig: any;

      registerNode('test.config_check', async (_prisma, config) => {
        capturedConfig = config;
        return { ok: true };
      });

      const nodesJson = [
        {
          id: 'n1',
          data: {
            nodeType: 'test.config_check',
            label: '설정 확인',
            config: { custom_param: 'hello' },
          },
          position: { x: 0, y: 0 },
        },
      ];

      const template = makeTemplate({ nodesJson, edgesJson: [] });
      prisma.workflowTemplate.findUnique.mockResolvedValue(template);
      setupRunTracking('run-7');

      await runner.runWorkflow('run-7', 'tmpl-1');

      expect(capturedConfig).toBeDefined();
      expect(capturedConfig.company_id).toBe('company-1'); // auto-injected from template
      expect(capturedConfig.custom_param).toBe('hello');
    });
  });

  describe('runBatch', () => {
    it('runs multiple workflows sequentially', async () => {
      const calls: string[] = [];

      registerNode('test.batch', async () => {
        calls.push('executed');
        return { ok: true };
      });

      const nodesJson = [
        { id: 'n1', data: { nodeType: 'test.batch', label: '배치', config: {} }, position: { x: 0, y: 0 } },
      ];
      const template = makeTemplate({ nodesJson, edgesJson: [] });

      prisma.workflowTemplate.findUnique.mockResolvedValue(template);

      // Setup tracking for two runs
      let run7Steps: any[] = [];
      let run8Steps: any[] = [];

      prisma.workflowRun.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'run-batch-1') return Promise.resolve(makeRun({ id: 'run-batch-1', steps: run7Steps }));
        if (where.id === 'run-batch-2') return Promise.resolve(makeRun({ id: 'run-batch-2', steps: run8Steps }));
        return Promise.resolve(null);
      });

      prisma.workflowRun.update.mockImplementation(({ where, data }: any) => {
        const steps = data.steps;
        if (where.id === 'run-batch-1' && steps) run7Steps = steps;
        if (where.id === 'run-batch-2' && steps) run8Steps = steps;
        return Promise.resolve({ id: where.id, ...data });
      });

      await runner.runBatch([
        { runId: 'run-batch-1', templateId: 'tmpl-1' },
        { runId: 'run-batch-2', templateId: 'tmpl-1' },
      ]);

      expect(calls).toHaveLength(2);
    });
  });
});

// ── Executor registry ────────────────────────────────────────────────────────

describe('getExecutor (executor registry)', () => {
  it('returns executor for registered node types', () => {
    expect(getExecutor('trigger.manual')).toBeDefined();
    expect(getExecutor('condition.evaluate')).toBeDefined();
    expect(getExecutor('data.filter')).toBeDefined();
    expect(getExecutor('notification.alert')).toBeDefined();
    expect(getExecutor('agent_task.create')).toBeDefined();
  });

  it('returns undefined for unknown node type', () => {
    expect(getExecutor('does.not.exist.xyz')).toBeUndefined();
  });
});
