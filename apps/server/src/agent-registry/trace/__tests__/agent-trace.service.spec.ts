import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AgentTraceService } from '../agent-trace.service';

// ── Mocks ──

function makePrisma() {
  return {
    agentTask: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    heartbeatRun: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    agentEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    workflowRun: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    agentLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    agentWakeupRequest: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeService(prisma?: any) {
  const p = prisma ?? makePrisma();
  return { service: new AgentTraceService(p as any), prisma: p };
}

function makeWakeupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wake-1',
    organizationId: 'organization-1',
    agentId: 'agent-1',
    source: 'on_demand',
    triggerDetail: null,
    reason: null,
    legacyTaskId: 'task-1',
    payload: { _legacy_task_id: 'task-1' },
    status: 'finished',
    coalescedCount: 0,
    requestedByType: 'system',
    requestedById: null,
    runId: 'run-1',
    requestedAt: new Date('2026-04-13T00:00:00Z'),
    claimedAt: new Date('2026-04-13T00:00:01Z'),
    finishedAt: new Date('2026-04-13T00:00:10Z'),
    error: null,
    createdAt: new Date('2026-04-13T00:00:00Z'),
    updatedAt: new Date('2026-04-13T00:00:10Z'),
    ...overrides,
  };
}

const MOCK_TASK = {
  id: 'task-1',
  organizationId: 'organization-1',
  agentType: 'ad_strategy',
  status: 'completed',
  priority: 0,
  workflowRunId: null,
  workflowNodeId: null,
  sourceDataId: null,
  input: null,
  output: null,
  error: null,
  scheduledAt: null,
  startedAt: new Date('2026-04-13T00:00:00Z'),
  completedAt: new Date('2026-04-13T00:00:10Z'),
  createdAt: new Date('2026-04-13T00:00:00Z'),
  updatedAt: new Date('2026-04-13T00:00:10Z'),
};

// ── Tests ──

describe('AgentTraceService', () => {
  describe('getTrace', () => {
    it('throws NotFoundException when task not found OR belongs to another organization (cross-tenant)', async () => {
      const { service, prisma } = makeService();
      prisma.agentTask.findFirst.mockResolvedValue(null);

      // 다른 organization id 로 접근 — findFirst 가 organizationId 를 where 에 포함했기에 null
      await expect(service.getTrace('task-1', 'organization-2', {})).rejects.toThrow(NotFoundException);
      expect(prisma.agentTask.findFirst).toHaveBeenCalledWith({
        where: { id: 'task-1', organizationId: 'organization-2' },
      });

      // 존재하지 않는 taskId — 동일 경로
      await expect(service.getTrace('task-missing', 'organization-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('assembles trace from marker-matched wakeup → runs → events (direct path)', async () => {
      const { service, prisma } = makeService();
      prisma.agentTask.findFirst.mockResolvedValue(MOCK_TASK);
      prisma.agentWakeupRequest.findMany.mockResolvedValue([
        makeWakeupRow({ id: 'wake-1', runId: 'run-1' }),
        makeWakeupRow({ id: 'wake-2', runId: 'run-2' }),
      ]);
      prisma.heartbeatRun.findMany.mockResolvedValue([{ id: 'run-1' }, { id: 'run-2' }]);
      prisma.agentEvent.findMany.mockResolvedValue([{ id: 'evt-1', runId: 'run-1' }]);

      const res = await service.getTrace('task-1', 'organization-1', {});

      expect(res.wakeupRequests).toHaveLength(2);
      expect(res.wakeupRequests[0].runId).toBe('run-1');
      expect(res.heartbeatRuns).toHaveLength(2);
      expect(res.events).toHaveLength(1);
      expect(res.traceability.markerFound).toBe(true);
      expect(res.traceability.creationPath).toBe('direct');
      expect(res.traceability.warning).toBeNull();
      expect(res.pagination.hasMore).toBe(false);
      expect(res.pagination.nextCursor).toBeNull();
      expect(prisma.heartbeatRun.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['run-1', 'run-2'] }, organizationId: 'organization-1' },
        orderBy: { startedAt: 'asc' },
      });
    });

    it('returns warning when marker not found (unknown creationPath)', async () => {
      const { service, prisma } = makeService();
      prisma.agentTask.findFirst.mockResolvedValue({ ...MOCK_TASK, workflowRunId: null });
      prisma.agentWakeupRequest.findMany.mockResolvedValue([]);

      const res = await service.getTrace('task-1', 'organization-1', {});

      expect(res.traceability.markerFound).toBe(false);
      expect(res.traceability.creationPath).toBe('unknown');
      expect(res.traceability.warning).toContain('legacyTaskId');
      expect(res.heartbeatRuns).toHaveLength(0);
      expect(res.events).toHaveLength(0);
    });

    it('marks creationPath=workflow when task.workflowRunId is set, scoping the WorkflowRun read by organizationId', async () => {
      const { service, prisma } = makeService();
      prisma.agentTask.findFirst.mockResolvedValue({ ...MOCK_TASK, workflowRunId: 'wf-1' });
      prisma.agentWakeupRequest.findMany.mockResolvedValue([makeWakeupRow({ runId: 'run-1' })]);
      prisma.workflowRun.findFirst.mockResolvedValue({ id: 'wf-1', status: 'completed' });

      const res = await service.getTrace('task-1', 'organization-1', {});

      expect(res.traceability.creationPath).toBe('workflow');
      expect(res.workflowRun).toEqual({ id: 'wf-1', status: 'completed' });
      // Tenant boundary: WorkflowRun must NEVER be fetched by bare id —
      // a malicious / corrupt task.workflowRunId pointing at another
      // tenant's run would otherwise leak into the trace response.
      expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith({
        where: { id: 'wf-1', organizationId: 'organization-1' },
      });
    });

    it('returns null workflowRun when the linked WorkflowRun belongs to another tenant', async () => {
      const { service, prisma } = makeService();
      prisma.agentTask.findFirst.mockResolvedValue({ ...MOCK_TASK, workflowRunId: 'wf-other' });
      prisma.agentWakeupRequest.findMany.mockResolvedValue([]);
      // Cross-tenant findFirst returns null even though id exists in DB
      prisma.workflowRun.findFirst.mockResolvedValue(null);

      const res = await service.getTrace('task-1', 'organization-1', {});

      expect(res.workflowRun).toBeNull();
      expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith({
        where: { id: 'wf-other', organizationId: 'organization-1' },
      });
    });

    it('paginates runIds with PAGE_LIMIT=100', async () => {
      const { service, prisma } = makeService();
      prisma.agentTask.findFirst.mockResolvedValue(MOCK_TASK);
      // 120 개 wakeups — 120 개 runId
      const rows = Array.from({ length: 120 }, (_, i) =>
        makeWakeupRow({ id: `wake-${i}`, runId: `run-${i}` }),
      );
      prisma.agentWakeupRequest.findMany.mockResolvedValue(rows);
      prisma.heartbeatRun.findMany.mockResolvedValue([]);

      const page1 = await service.getTrace('task-1', 'organization-1', {});
      expect(page1.pagination.hasMore).toBe(true);
      expect(page1.pagination.nextCursor).toBe('100');
      // 첫 페이지는 run-0 ~ run-99 (100건)
      const firstCall = prisma.heartbeatRun.findMany.mock.calls[0][0];
      expect(firstCall.where.id.in).toHaveLength(100);
      expect(firstCall.where.id.in[0]).toBe('run-0');
      expect(firstCall.where.id.in[99]).toBe('run-99');

      // 두번째 페이지 — cursor=100 으로 요청
      prisma.heartbeatRun.findMany.mockClear();
      const page2 = await service.getTrace('task-1', 'organization-1', { cursor: '100' });
      expect(page2.pagination.hasMore).toBe(false);
      expect(page2.pagination.nextCursor).toBeNull();
      const secondCall = prisma.heartbeatRun.findMany.mock.calls[0][0];
      expect(secondCall.where.id.in).toHaveLength(20);
      expect(secondCall.where.id.in[0]).toBe('run-100');
    });

    it('skips heartbeatRun/event queries when no runIds', async () => {
      const { service, prisma } = makeService();
      prisma.agentTask.findFirst.mockResolvedValue(MOCK_TASK);
      // payload 에 run_id 없음
      prisma.agentWakeupRequest.findMany.mockResolvedValue([makeWakeupRow({ runId: null })]);

      await service.getTrace('task-1', 'organization-1', {});

      expect(prisma.heartbeatRun.findMany).not.toHaveBeenCalled();
      expect(prisma.agentEvent.findMany).not.toHaveBeenCalled();
    });

    it('applies scrubDeep to response — secret strings become [REDACTED]', async () => {
      const { service, prisma } = makeService();
      prisma.agentTask.findFirst.mockResolvedValue({
        ...MOCK_TASK,
        error: 'API error: sk-abcdefghijklmnopqrstuvwxyz123456',
      });
      prisma.agentWakeupRequest.findMany.mockResolvedValue([]);

      const res = await service.getTrace('task-1', 'organization-1', {});

      expect(res.task.error).toContain('[REDACTED]');
      expect(res.task.error).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    });

    it('deduplicates runIds from multiple wakeups sharing same run_id', async () => {
      const { service, prisma } = makeService();
      prisma.agentTask.findFirst.mockResolvedValue(MOCK_TASK);
      prisma.agentWakeupRequest.findMany.mockResolvedValue([
        makeWakeupRow({ id: 'w1', runId: 'run-dup' }),
        makeWakeupRow({ id: 'w2', runId: 'run-dup' }),
      ]);

      await service.getTrace('task-1', 'organization-1', {});

      const call = prisma.heartbeatRun.findMany.mock.calls[0][0];
      expect(call.where.id.in).toEqual(['run-dup']);
    });
  });

  describe('listTasks', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns paginated shape with default page=1, limit=20', async () => {
      const { service, prisma } = makeService();
      prisma.agentTask.findMany.mockResolvedValue([MOCK_TASK]);
      prisma.agentTask.count.mockResolvedValue(1);

      const res = await service.listTasks('organization-1', {});

      expect(res).toMatchObject({ total: 1, page: 1, limit: 20 });
      expect(res.items).toHaveLength(1);
      expect(prisma.agentTask.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'organization-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it.each([
      ['status', { status: 'completed' }, { status: 'completed' }],
      ['agentType', { agentType: 'ad_strategy' }, { agentType: 'ad_strategy' }],
    ])('applies %s filter', async (_field, query, expectedWhere) => {
      const { service, prisma } = makeService();
      prisma.agentTask.findMany.mockResolvedValue([]);
      prisma.agentTask.count.mockResolvedValue(0);

      await service.listTasks('organization-1', query);

      expect(prisma.agentTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'organization-1', ...expectedWhere },
        }),
      );
    });

    it('applies from/to time range filter', async () => {
      const { service, prisma } = makeService();
      await service.listTasks('organization-1', {
        from: '2026-04-01T00:00:00Z',
        to: '2026-04-13T23:59:59Z',
      });

      const call = prisma.agentTask.findMany.mock.calls[0][0];
      expect(call.where.createdAt.gte).toEqual(new Date('2026-04-01T00:00:00Z'));
      expect(call.where.createdAt.lte).toEqual(new Date('2026-04-13T23:59:59Z'));
    });

    it('computes skip correctly for page=3 limit=25', async () => {
      const { service, prisma } = makeService();
      await service.listTasks('organization-1', { page: 3, limit: 25 });

      expect(prisma.agentTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 25 }),
      );
    });

    it('caps limit at 100', async () => {
      const { service, prisma } = makeService();
      await service.listTasks('organization-1', { limit: 500 });

      const call = prisma.agentTask.findMany.mock.calls[0][0];
      expect(call.take).toBe(100);
    });

    it('always scopes by organizationId (ADR-0006)', async () => {
      const { service, prisma } = makeService();
      await service.listTasks('organization-xyz', { status: 'failed', agentType: 'review' });

      const findCall = prisma.agentTask.findMany.mock.calls[0][0];
      const countCall = prisma.agentTask.count.mock.calls[0][0];
      expect(findCall.where.organizationId).toBe('organization-xyz');
      expect(countCall.where.organizationId).toBe('organization-xyz');
    });
  });
});
