import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowOrchestrationService } from '../workflow-orchestration.service';
import { WorkflowRunnerService } from '../workflow-runner.service';
import { WorkflowOrchestrationRepositoryAdapter } from '../../../adapter/out/repository/workflow-orchestration.repository.adapter';
import { registerNode, getExecutor } from '../../../adapter/out/workflow-runner/executors';
import '../../../adapter/out/workflow-runner/executors/builtin';

// ── Prisma mock factory ──────────────────────────────────────────────────────

function makePrisma() {
  return {
    workflowTemplate: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    workflowRun: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      // Legacy panel adapter calls used findUnique; keep a no-op stub so older
      // assertions stay quiet if a test imports the adapter directly.
      findUnique: vi.fn().mockResolvedValue(null),
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
    organizationId: 'organization-1',
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
    organizationId: 'organization-1',
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

// ── WorkflowOrchestrationService ─────────────────────────────────────────────────────────

describe('WorkflowOrchestrationService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let runner: { runWorkflow: ReturnType<typeof vi.fn>; runBatch: ReturnType<typeof vi.fn> };
  let service: WorkflowOrchestrationService;

  beforeEach(() => {
    prisma = makePrisma();
    runner = { runWorkflow: vi.fn(), runBatch: vi.fn() };
    const eventEmitter = { emit: vi.fn() };
    service = new WorkflowOrchestrationService(
      new WorkflowOrchestrationRepositoryAdapter(prisma as any),
      runner as any,
      eventEmitter as any,
    );
  });

  describe('triggerRun', () => {
    it('creates WorkflowRun with status="pending" and fires runner async', async () => {
      const run = makeRun();
      prisma.workflowTemplate.findFirst.mockResolvedValue(makeTemplate());
      prisma.workflowRun.create.mockResolvedValue(run);
      runner.runWorkflow.mockResolvedValue(undefined);

      const result = await service.triggerRun('tmpl-1', 'organization-1', { triggeredBy: 'manual' });

      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tmpl-1', organizationId: 'organization-1' } }),
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
      expect(runner.runWorkflow).toHaveBeenCalledWith('run-1', 'tmpl-1', 'organization-1');
    });

    it('stores organizationId from template and triggeredByUserId for manual trigger', async () => {
      const run = makeRun({ organizationId: 'organization-1', triggeredByUserId: 'user-x' });
      prisma.workflowTemplate.findFirst.mockResolvedValue(makeTemplate({ organizationId: 'organization-1' }));
      prisma.workflowRun.create.mockResolvedValue(run);
      runner.runWorkflow.mockResolvedValue(undefined);

      await service.triggerRun('tmpl-1', 'organization-1', { triggeredBy: 'manual', triggeredByUserId: 'user-x' });

      expect(prisma.workflowRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'organization-1',
          triggeredByUserId: 'user-x',
        }),
      });
    });

    it('passes the verified template organizationId to runner.runWorkflow', async () => {
      const run = makeRun({ organizationId: 'organization-owned' });
      prisma.workflowTemplate.findFirst.mockResolvedValue(makeTemplate({ organizationId: 'organization-owned' }));
      prisma.workflowRun.create.mockResolvedValue(run);
      runner.runWorkflow.mockResolvedValue(undefined);

      await service.triggerRun('tmpl-1', 'organization-request', { triggeredBy: 'manual' });

      expect(prisma.workflowRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: 'organization-owned' }),
      });
      await Promise.resolve();
      expect(runner.runWorkflow).toHaveBeenCalledWith('run-1', 'tmpl-1', 'organization-owned');
    });

    it('throws NotFoundException when template does not exist', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(service.triggerRun('nonexistent', 'organization-1', { triggeredBy: 'manual' })).rejects.toThrow('nonexistent');
    });

    it('throws NotFoundException when template belongs to a different organization (IDOR guard)', async () => {
      // findFirst with mismatched organizationId returns null → 404
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.triggerRun('tmpl-1', 'organization-OTHER', { triggeredBy: 'manual' }),
      ).rejects.toThrow('tmpl-1');

      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tmpl-1', organizationId: 'organization-OTHER' } }),
      );
      expect(prisma.workflowRun.create).not.toHaveBeenCalled();
      expect(runner.runWorkflow).not.toHaveBeenCalled();
    });

    it('passes context data when provided', async () => {
      const run = makeRun({ contextData: { productId: 'prod-1' } });
      prisma.workflowTemplate.findFirst.mockResolvedValue(makeTemplate());
      prisma.workflowRun.create.mockResolvedValue(run);
      runner.runWorkflow.mockResolvedValue(undefined);

      await service.triggerRun('tmpl-1', 'organization-1', { triggeredBy: 'manual', context: { productId: 'prod-1' } });

      expect(prisma.workflowRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ contextData: { productId: 'prod-1' } }),
      });
    });
  });

  describe('findRunDetail', () => {
    it('returns run detail with steps when organizationId matches', async () => {
      const run = makeRun({
        status: 'succeeded',
        steps: [
          { nodeId: 'n1', nodeType: 'trigger.manual', status: 'succeeded', outputData: { triggeredAt: '2026-01-01' } },
        ],
      });
      prisma.workflowRun.findFirst.mockResolvedValue(run);

      const result = await service.findRunDetail('run-1', 'organization-1');

      expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith({ where: { id: 'run-1', organizationId: 'organization-1' } });
      expect(result.status).toBe('succeeded');
      expect(result.steps).toHaveLength(1);
    });

    it('throws NotFoundException when run belongs to a different organization (IDOR guard)', async () => {
      prisma.workflowRun.findFirst.mockResolvedValue(null);

      await expect(service.findRunDetail('run-1', 'organization-OTHER')).rejects.toThrow('run-1');
      expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith({ where: { id: 'run-1', organizationId: 'organization-OTHER' } });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when template belongs to a different organization (IDOR guard)', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(service.findOne('tmpl-1', 'organization-OTHER')).rejects.toThrow('tmpl-1');
      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tmpl-1', organizationId: 'organization-OTHER' } }),
      );
    });
  });

  describe('update', () => {
    it('writes through scoped updateMany and reloads by (id, organizationId)', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(makeTemplate());
      prisma.workflowTemplate.updateMany.mockResolvedValue({ count: 1 });
      prisma.workflowTemplate.findFirstOrThrow.mockResolvedValue(makeTemplate({ name: '수정됨', version: 2 }));

      const result = await service.update('tmpl-1', 'organization-1', { name: '수정됨' } as any);

      expect(prisma.workflowTemplate.updateMany).toHaveBeenCalledWith({
        where: { id: 'tmpl-1', organizationId: 'organization-1' },
        data: expect.objectContaining({
          name: '수정됨',
          version: { increment: 1 },
        }),
      });
      expect(prisma.workflowTemplate.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 'tmpl-1', organizationId: 'organization-1' },
      });
      expect(prisma.workflowTemplate.update).not.toHaveBeenCalled();
      expect(result.name).toBe('수정됨');
    });

    it('throws NotFoundException without writing when template belongs to a different organization', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.update('tmpl-1', 'organization-OTHER', { name: 'hacked' } as any),
      ).rejects.toThrow('tmpl-1');
      expect(prisma.workflowTemplate.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes through scoped deleteMany and returns the owned template snapshot', async () => {
      const template = makeTemplate();
      prisma.workflowTemplate.findFirst.mockResolvedValue(template);
      prisma.workflowTemplate.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.remove('tmpl-1', 'organization-1');

      expect(prisma.workflowTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: 'tmpl-1', organizationId: 'organization-1' },
      });
      expect(prisma.workflowTemplate.delete).not.toHaveBeenCalled();
      expect(result).toBe(template);
    });

    it('throws NotFoundException without deleting when template belongs to a different organization', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(service.remove('tmpl-1', 'organization-OTHER')).rejects.toThrow('tmpl-1');
      expect(prisma.workflowTemplate.delete).not.toHaveBeenCalled();
    });
  });

  describe('batchRun', () => {
    it('allows duplicate owned templateIds while preserving requested run count', async () => {
      prisma.workflowTemplate.findMany.mockResolvedValue([
        { id: 'tmpl-1', organizationId: 'organization-1' },
      ]);
      prisma.workflowRun.create.mockImplementation(({ data }: any) =>
        Promise.resolve(makeRun({ id: `run-${data.templateId}-${prisma.workflowRun.create.mock.calls.length}`, ...data })),
      );
      runner.runBatch.mockResolvedValue(undefined);

      const result = await service.batchRun(['tmpl-1', 'tmpl-1'], 'organization-1', { triggeredBy: 'manual' });

      expect(prisma.workflowTemplate.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['tmpl-1'] }, organizationId: 'organization-1' },
        select: { id: true, organizationId: true },
      });
      expect(prisma.workflowRun.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('passes each verified template organizationId to runner.runBatch items', async () => {
      prisma.workflowTemplate.findMany.mockResolvedValue([
        { id: 'tmpl-1', organizationId: 'organization-owned' },
      ]);
      prisma.workflowRun.create.mockImplementation(({ data }: any) =>
        Promise.resolve(makeRun({ id: 'run-1', ...data })),
      );
      runner.runBatch.mockResolvedValue(undefined);

      await service.batchRun(['tmpl-1'], 'organization-request', { triggeredBy: 'manual' });

      expect(prisma.workflowRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: 'organization-owned' }),
      });
      expect(runner.runBatch).toHaveBeenCalledWith([
        { runId: 'run-1', templateId: 'tmpl-1', organizationId: 'organization-owned' },
      ]);
    });

    it('throws NotFoundException when any templateId is owned by a different organization', async () => {
      // Only one of the two requested templates is found under organization-1
      prisma.workflowTemplate.findMany.mockResolvedValue([
        { id: 'tmpl-1', organizationId: 'organization-1' },
      ]);

      await expect(
        service.batchRun(['tmpl-1', 'tmpl-foreign'], 'organization-1', { triggeredBy: 'manual' }),
      ).rejects.toThrow('tmpl-foreign');
      expect(prisma.workflowRun.create).not.toHaveBeenCalled();
      expect(runner.runBatch).not.toHaveBeenCalled();
    });
  });

  describe('findRuns', () => {
    it('throws NotFoundException when template belongs to a different organization without listing runs', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);

      await expect(service.findRuns('tmpl-1', 'organization-OTHER')).rejects.toThrow('tmpl-1');
      expect(prisma.workflowRun.findMany).not.toHaveBeenCalled();
    });

    it('lists runs scoped to (templateId, organizationId) when ownership verified', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue({ id: 'tmpl-1' });
      prisma.workflowRun.findMany.mockResolvedValue([makeRun()]);

      const result = await service.findRuns('tmpl-1', 'organization-1');

      expect(prisma.workflowRun.findMany).toHaveBeenCalledWith({
        where: { templateId: 'tmpl-1', organizationId: 'organization-1' },
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
  function setupRunTracking(
    runId: string,
    contextData: Record<string, any> = {},
    organizationId: string = 'organization-1',
  ) {
    const runRecord = makeRun({ id: runId, contextData, organizationId, steps: [] });

    // findFirst for run context and for step tracking — only matches when both
    // id AND organizationId are provided (the runner now scopes every read).
    prisma.workflowRun.findFirst.mockImplementation(({ where }: any) => {
      if (where?.id === runId && where?.organizationId === organizationId) {
        return Promise.resolve({ ...runRecord, steps: [] });
      }
      return Promise.resolve(null);
    });

    // Track step mutations. updateMany returns Prisma's `{ count }` shape; we
    // also fold the new steps into the in-flight findFirst result so subsequent
    // reads in the same run see the latest array.
    let steps: any[] = [];
    prisma.workflowRun.updateMany.mockImplementation(({ where, data }: any) => {
      if (where?.id === runId && where?.organizationId === organizationId && data.steps !== undefined) {
        steps = data.steps;
        prisma.workflowRun.findFirst.mockImplementation(({ where: w }: any) => {
          if (w?.id === runId && w?.organizationId === organizationId) {
            return Promise.resolve({ ...runRecord, steps });
          }
          return Promise.resolve(null);
        });
      }
      return Promise.resolve({ count: 1 });
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
      prisma.workflowTemplate.findFirst.mockResolvedValue(template);
      setupRunTracking('run-1');

      await runner.runWorkflow('run-1', 'tmpl-1', 'organization-1');

      expect(executionOrder).toEqual(['first', 'second']);

      // Final update should be 'succeeded'
      const completedCall = prisma.workflowRun.updateMany.mock.calls.find(
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
      prisma.workflowTemplate.findFirst.mockResolvedValue(template);
      setupRunTracking('run-2');

      await runner.runWorkflow('run-2', 'tmpl-1', 'organization-1');

      expect(capturedContextOutput).toBeDefined();
      expect((capturedContextOutput as any).count).toBe(1);
    });

    it('all nodes complete → run status="completed"', async () => {
      registerNode('test.simple', async () => ({ ok: true }));

      const nodesJson = [
        { id: 'n1', data: { nodeType: 'test.simple', label: '단순', config: {} }, position: { x: 0, y: 0 } },
      ];

      const template = makeTemplate({ nodesJson, edgesJson: [] });
      prisma.workflowTemplate.findFirst.mockResolvedValue(template);
      setupRunTracking('run-3');

      await runner.runWorkflow('run-3', 'tmpl-1', 'organization-1');

      const statusUpdates = prisma.workflowRun.updateMany.mock.calls.map(
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
      prisma.workflowTemplate.findFirst.mockResolvedValue(template);
      setupRunTracking('run-4');

      await runner.runWorkflow('run-4', 'tmpl-1', 'organization-1');

      const failedCall = prisma.workflowRun.updateMany.mock.calls.find(
        ([args]: any[]) => args.data?.status === 'failed',
      );
      expect(failedCall).toBeDefined();
      const failedData = (failedCall as any)[0].data;
      expect(failedData.error).toContain('executor 오류 발생');
    });

    it('template not found → run marked as failed immediately, scoped by organizationId', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);
      prisma.workflowRun.findFirst.mockResolvedValue(makeRun({ id: 'run-5' }));
      prisma.workflowRun.updateMany.mockResolvedValue({ count: 1 });

      await runner.runWorkflow('run-5', 'tmpl-nonexistent', 'organization-1');

      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'tmpl-nonexistent', organizationId: 'organization-1' },
      });
      expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
        where: { id: 'run-5', organizationId: 'organization-1' },
        data: { status: 'failed', error: 'Template not found' },
      });
    });

    it('template owned by a different organization → run marked failed scoped by caller organizationId (IDOR guard)', async () => {
      // Even though tmpl-1 exists in DB, the runner is invoked with the caller's
      // organizationId. findFirst({ id, organizationId }) returns null → run is marked
      // failed via updateMany({ id, organizationId }), so a request from
      // organization-OTHER cannot affect tmpl-1's owning tenant's data.
      prisma.workflowTemplate.findFirst.mockResolvedValue(null);
      prisma.workflowRun.updateMany.mockResolvedValue({ count: 0 });

      await runner.runWorkflow('run-cross', 'tmpl-1', 'organization-OTHER');

      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'tmpl-1', organizationId: 'organization-OTHER' },
      });
      expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
        where: { id: 'run-cross', organizationId: 'organization-OTHER' },
        data: { status: 'failed', error: 'Template not found' },
      });
    });

    it('run owned by a different organization → does not execute nodes or write by bare runId', async () => {
      let executed = false;
      registerNode('test.must_not_run', async () => {
        executed = true;
        return { ok: true };
      });

      const template = makeTemplate({
        nodesJson: [
          { id: 'n1', data: { nodeType: 'test.must_not_run', label: '실행 금지', config: {} }, position: { x: 0, y: 0 } },
        ],
        edgesJson: [],
      });
      prisma.workflowTemplate.findFirst.mockResolvedValue(template);
      prisma.workflowRun.findFirst.mockResolvedValue(null);
      prisma.workflowRun.updateMany.mockResolvedValue({ count: 0 });

      await runner.runWorkflow('foreign-run', 'tmpl-1', 'organization-1');

      expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith({
        where: { id: 'foreign-run', organizationId: 'organization-1' },
      });
      expect(executed).toBe(false);
      expect(prisma.workflowRun.updateMany).not.toHaveBeenCalled();
    });

    it('unknown node type → throws and records error in steps', async () => {
      const nodesJson = [
        { id: 'n1', data: { nodeType: 'nonexistent.executor', label: '알 수 없는 노드', config: {} }, position: { x: 0, y: 0 } },
      ];

      const template = makeTemplate({ nodesJson, edgesJson: [] });
      prisma.workflowTemplate.findFirst.mockResolvedValue(template);
      setupRunTracking('run-6');

      await runner.runWorkflow('run-6', 'tmpl-1', 'organization-1');

      // Should have failed run record
      const failedCall = prisma.workflowRun.updateMany.mock.calls.find(
        ([args]: any[]) => args.data?.status === 'failed',
      );
      expect(failedCall).toBeDefined();
    });

    it.each([
      'internal.db_query',
      'api_call',
      'ai_process',
      'action',
      'data_transform',
      'data.filter',
      'trigger',
      'trigger.event',
      'condition',
      'notification',
    ])(
      'removed legacy executor `%s` → run failed with "No executor for node type" error',
      async (removedNodeType) => {
        const nodesJson = [
          {
            id: 'n1',
            data: { nodeType: removedNodeType, label: 'legacy', config: {} },
            position: { x: 0, y: 0 },
          },
        ];
        const template = makeTemplate({ nodesJson, edgesJson: [] });
        prisma.workflowTemplate.findFirst.mockResolvedValue(template);
        setupRunTracking(`run-removed-${removedNodeType}`);

        await runner.runWorkflow(`run-removed-${removedNodeType}`, 'tmpl-1', 'organization-1');

        const failedCall = prisma.workflowRun.updateMany.mock.calls.find(
          ([args]: any[]) =>
            args.where?.id === `run-removed-${removedNodeType}` &&
            args.data?.status === 'failed',
        );
        expect(failedCall).toBeDefined();
        const failedData = (failedCall as any)[0].data;
        expect(failedData.error).toContain('No executor for node type');
        expect(failedData.error).toContain(removedNodeType);

        // The failure must be recorded as a step entry, not silently swallowed.
        const stepUpdates = prisma.workflowRun.updateMany.mock.calls.filter(
          ([args]: any[]) =>
            args.where?.id === `run-removed-${removedNodeType}` &&
            Array.isArray(args.data?.steps),
        );
        const lastSteps = (stepUpdates.at(-1) as any)[0].data.steps;
        expect(lastSteps[0]).toMatchObject({
          nodeType: removedNodeType,
          status: 'failed',
        });
        expect(lastSteps[0].error).toContain('No executor for node type');
      },
    );

    it('node config scope metadata is overwritten before executor sees it', async () => {
      let capturedConfig: any;

      registerNode('test.tenant_injection', async (_prisma, config) => {
        capturedConfig = config;
        return { ok: true };
      });

      const nodesJson = [
        {
          id: 'n1',
          data: {
            nodeType: 'test.tenant_injection',
            label: 'tenant',
            // Attacker-controlled config trying to coerce a side-effect
            // executor (e.g. notification.alert / agent_task.create) into
            // another tenant or forged workflow trace.
            config: {
              organization_id: 'attacker-organization',
              _context: { spoofed: true },
              _workflow_run_id: 'spoofed-run',
              _workflow_node_id: 'spoofed-node',
            },
          },
          position: { x: 0, y: 0 },
        },
      ];

      const template = makeTemplate({
        nodesJson,
        edgesJson: [],
        organizationId: 'organization-owned',
      });
      prisma.workflowTemplate.findFirst.mockResolvedValue(template);
      setupRunTracking('run-tenant', { realRunCtx: 'yes' }, 'organization-owned');

      await runner.runWorkflow('run-tenant', 'tmpl-1', 'organization-owned');

      expect(capturedConfig).toBeDefined();
      // The runner-injected organization_id wins; the attacker value is gone.
      expect(capturedConfig.organization_id).toBe('organization-owned');
      // _context comes from the run record, not the template author.
      expect(capturedConfig._context).toEqual({ realRunCtx: 'yes' });
      expect(capturedConfig._workflow_run_id).toBe('run-tenant');
      expect(capturedConfig._workflow_node_id).toBe('n1');
    });

    it('agent_task.create delegates with runner-trusted organization and workflow metadata', async () => {
      const agentRunner = {
        runByType: vi.fn().mockResolvedValue({
          ok: true,
          requestId: 'req-1',
          runId: 'run-agent-1',
          agentType: 'rules_evaluation',
          status: 'pending',
        }),
      };
      const runnerWithAgentRunner = new WorkflowRunnerService(
        prisma as any,
        { emit: vi.fn() } as any,
        agentRunner as any,
      );

      const nodesJson = [
        {
          id: 'agent-node',
          data: {
            nodeType: 'agent_task.create',
            label: 'agent',
            config: {
              agent_type: 'rules_evaluation',
              input: { prompt: 'check this' },
              organization_id: 'attacker-organization',
              _workflow_run_id: 'spoofed-run',
              _workflow_node_id: 'spoofed-node',
              source_data_id: '00000000-0000-0000-0000-000000000001',
            },
          },
          position: { x: 0, y: 0 },
        },
      ];

      const template = makeTemplate({
        nodesJson,
        edgesJson: [],
        organizationId: 'organization-owned',
      });
      prisma.workflowTemplate.findFirst.mockResolvedValue(template);
      setupRunTracking('run-agent', {}, 'organization-owned');

      await runnerWithAgentRunner.runWorkflow('run-agent', 'tmpl-1', 'organization-owned');

      expect(agentRunner.runByType).toHaveBeenCalledWith('rules_evaluation', {
        organizationId: 'organization-owned',
        sourceType: 'workflow',
        sourceId: 'run-agent',
        sourceWorkflowRunId: 'run-agent',
        sourceWorkflowNodeId: 'agent-node',
        sourceResourceType: 'data',
        sourceResourceId: '00000000-0000-0000-0000-000000000001',
        payload: {
          prompt: 'check this',
          _workflow_run_id: 'run-agent',
          _workflow_node_id: 'agent-node',
          source_data_id: '00000000-0000-0000-0000-000000000001',
        },
      });
    });

    it('executor called with resolved config (organization_id injected)', async () => {
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
      prisma.workflowTemplate.findFirst.mockResolvedValue(template);
      setupRunTracking('run-7');

      await runner.runWorkflow('run-7', 'tmpl-1', 'organization-1');

      expect(capturedConfig).toBeDefined();
      expect(capturedConfig.organization_id).toBe('organization-1'); // auto-injected from template
      expect(capturedConfig.custom_param).toBe('hello');
    });
  });

  describe('cancellation', () => {
    it('marks a running workflow run cancelled and cancels linked Agent OS requests', async () => {
      const eventEmitter = { emit: vi.fn() };
      const agentRunner = {
        cancelByWorkflowRun: vi.fn().mockResolvedValue({
          cancelledRequests: 2,
          cancelledRuns: 1,
        }),
      };
      const runnerWithAgentRunner = new WorkflowRunnerService(
        prisma as any,
        eventEmitter as any,
        agentRunner as any,
      );
      prisma.workflowRun.findFirst.mockResolvedValueOnce(
        makeRun({
          status: 'running',
          contextData: { source: 'manual-qa' },
          steps: [
            {
              nodeId: 'n1',
              nodeType: 'agent_task.create',
              nodeLabel: 'AI 작업',
              status: 'running',
              startedAt: '2026-05-17T00:00:00.000Z',
              completedAt: null,
              outputData: null,
              error: null,
            },
          ],
        }),
      );
      prisma.workflowRun.updateMany.mockResolvedValue({ count: 1 });

      const result = await runnerWithAgentRunner.cancelRun({
        runId: 'run-1',
        organizationId: 'organization-1',
        actorUserId: 'user-1',
        reason: '사용자 요청',
      });

      expect(result.status).toBe('cancelled');
      expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'run-1',
          organizationId: 'organization-1',
          status: { in: ['pending', 'running'] },
        },
        data: expect.objectContaining({
          status: 'cancelled',
          completedAt: expect.any(Date),
          error: '사용자 요청으로 워크플로우가 중단되었습니다.',
          contextData: {
            source: 'manual-qa',
            operationCancellation: expect.objectContaining({
              requestedByUserId: 'user-1',
              reason: '사용자 요청',
              result: 'cancelled',
              target: { targetType: 'workflow_run', runId: 'run-1' },
              affected: expect.objectContaining({
                workflowRunIds: ['run-1'],
              }),
            }),
          },
        }),
      });
      expect(agentRunner.cancelByWorkflowRun).toHaveBeenCalledWith({
        organizationId: 'organization-1',
        workflowRunId: 'run-1',
        reason: '사용자 요청',
        actorUserId: 'user-1',
      });
    });

    it('returns already_terminal when cancellation loses the terminal update race', async () => {
      const eventEmitter = { emit: vi.fn() };
      const agentRunner = {
        cancelByWorkflowRun: vi.fn().mockResolvedValue({
          cancelledRequests: 1,
          cancelledRuns: 1,
        }),
      };
      const runnerWithAgentRunner = new WorkflowRunnerService(
        prisma as any,
        eventEmitter as any,
        agentRunner as any,
      );
      prisma.workflowRun.findFirst.mockResolvedValueOnce(
        makeRun({
          status: 'running',
          contextData: { source: 'manual-qa' },
          steps: [],
        }),
      );
      prisma.workflowRun.updateMany.mockResolvedValue({ count: 0 });

      const result = await runnerWithAgentRunner.cancelRun({
        runId: 'run-1',
        organizationId: 'organization-1',
        actorUserId: 'user-1',
        reason: '사용자 요청',
      });

      expect(result.status).toBe('already_terminal');
      expect(agentRunner.cancelByWorkflowRun).not.toHaveBeenCalled();
    });

    it('does not move a cancelled run back to running when cancellation wins the start race', async () => {
      prisma.workflowTemplate.findFirst.mockResolvedValue(makeTemplate({
        nodesJson: [
          {
            id: 'start',
            data: { nodeType: 'trigger.manual', label: 'Start', config: {} },
            position: { x: 0, y: 0 },
          },
        ],
        edgesJson: [],
      }));
      prisma.workflowRun.findFirst.mockResolvedValueOnce(makeRun({ status: 'pending' }));
      prisma.workflowRun.updateMany.mockResolvedValueOnce({ count: 0 });

      await runner.runWorkflow('run-1', 'tmpl-1', 'organization-1');

      expect(prisma.workflowRun.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'run-1',
          organizationId: 'organization-1',
          status: { in: ['pending', 'running'] },
        },
        data: { status: 'running', startedAt: expect.any(Date) },
      });
      expect(prisma.workflowRun.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'succeeded' }),
        }),
      );
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

      prisma.workflowTemplate.findFirst.mockResolvedValue(template);

      // Setup tracking for two runs
      let run7Steps: any[] = [];
      let run8Steps: any[] = [];

      prisma.workflowRun.findFirst.mockImplementation(({ where }: any) => {
        if (where?.organizationId !== 'organization-1') return Promise.resolve(null);
        if (where?.id === 'run-batch-1') return Promise.resolve(makeRun({ id: 'run-batch-1', steps: run7Steps }));
        if (where?.id === 'run-batch-2') return Promise.resolve(makeRun({ id: 'run-batch-2', steps: run8Steps }));
        return Promise.resolve(null);
      });

      prisma.workflowRun.updateMany.mockImplementation(({ where, data }: any) => {
        const steps = data.steps;
        if (where?.organizationId !== 'organization-1') return Promise.resolve({ count: 0 });
        if (where?.id === 'run-batch-1' && steps) run7Steps = steps;
        if (where?.id === 'run-batch-2' && steps) run8Steps = steps;
        return Promise.resolve({ count: 1 });
      });

      await runner.runBatch([
        { runId: 'run-batch-1', templateId: 'tmpl-1', organizationId: 'organization-1' },
        { runId: 'run-batch-2', templateId: 'tmpl-1', organizationId: 'organization-1' },
      ]);

      expect(calls).toHaveLength(2);
    });

    it('threads per-item organizationId through every Prisma read and write (defense-in-depth)', async () => {
      registerNode('test.batch_scope', async () => ({ ok: true }));

      const nodesJson = [
        { id: 'n1', data: { nodeType: 'test.batch_scope', label: '스코프', config: {} }, position: { x: 0, y: 0 } },
      ];
      const templateA = makeTemplate({ id: 'tmpl-A', organizationId: 'organization-A', nodesJson, edgesJson: [] });
      const templateB = makeTemplate({ id: 'tmpl-B', organizationId: 'organization-B', nodesJson, edgesJson: [] });

      prisma.workflowTemplate.findFirst.mockImplementation(({ where }: any) => {
        if (where?.id === 'tmpl-A' && where?.organizationId === 'organization-A') return Promise.resolve(templateA);
        if (where?.id === 'tmpl-B' && where?.organizationId === 'organization-B') return Promise.resolve(templateB);
        return Promise.resolve(null);
      });

      const stepsByRun: Record<string, any[]> = { 'run-A': [], 'run-B': [] };
      prisma.workflowRun.findFirst.mockImplementation(({ where }: any) => {
        if (where?.id === 'run-A' && where?.organizationId === 'organization-A') {
          return Promise.resolve(makeRun({ id: 'run-A', organizationId: 'organization-A', steps: stepsByRun['run-A'] }));
        }
        if (where?.id === 'run-B' && where?.organizationId === 'organization-B') {
          return Promise.resolve(makeRun({ id: 'run-B', organizationId: 'organization-B', steps: stepsByRun['run-B'] }));
        }
        return Promise.resolve(null);
      });
      prisma.workflowRun.updateMany.mockImplementation(({ where, data }: any) => {
        const id = where?.id as string;
        const cid = where?.organizationId as string;
        if (id === 'run-A' && cid !== 'organization-A') return Promise.resolve({ count: 0 });
        if (id === 'run-B' && cid !== 'organization-B') return Promise.resolve({ count: 0 });
        if (data?.steps !== undefined && stepsByRun[id]) stepsByRun[id] = data.steps;
        return Promise.resolve({ count: 1 });
      });

      await runner.runBatch([
        { runId: 'run-A', templateId: 'tmpl-A', organizationId: 'organization-A' },
        { runId: 'run-B', templateId: 'tmpl-B', organizationId: 'organization-B' },
      ]);

      // Every updateMany invocation must carry a organizationId in its where clause.
      const updateCalls = prisma.workflowRun.updateMany.mock.calls.map(([args]: any[]) => args.where);
      expect(updateCalls.length).toBeGreaterThan(0);
      for (const where of updateCalls) {
        expect(where.organizationId).toBeDefined();
      }
      // Each run's writes only target its own tenant.
      const runACalls = updateCalls.filter((w: any) => w.id === 'run-A');
      const runBCalls = updateCalls.filter((w: any) => w.id === 'run-B');
      expect(runACalls.every((w: any) => w.organizationId === 'organization-A')).toBe(true);
      expect(runBCalls.every((w: any) => w.organizationId === 'organization-B')).toBe(true);
    });
  });
});

// ── Executor registry ────────────────────────────────────────────────────────

describe('getExecutor (executor registry)', () => {
  it('returns executor for the slim core surface', () => {
    expect(getExecutor('trigger.manual')).toBeDefined();
    expect(getExecutor('trigger.schedule')).toBeDefined();
    expect(getExecutor('condition.evaluate')).toBeDefined();
    expect(getExecutor('notification.alert')).toBeDefined();
    expect(getExecutor('agent_task.create')).toBeDefined();
  });

  it.each([
    // Removed generic executors — the workflow engine is not a generic
    // DB / HTTP / transform / LLM engine. AI work goes through
    // `agent_task.create` only.
    'internal.db_query',
    'api_call',
    'action',
    'data_transform',
    'data.filter',
    'ai_process',
    // Removed legacy aliases — surviving templates that still reference
    // these names must fail with "No executor for node type ..." so the
    // regression is visible in WorkflowRun.error.
    'trigger',
    'trigger.event',
    'condition',
    'notification',
  ])('removed executor `%s` is no longer registered', (removed) => {
    expect(getExecutor(removed)).toBeUndefined();
  });

  it('returns undefined for unknown node type', () => {
    expect(getExecutor('does.not.exist.xyz')).toBeUndefined();
  });
});
