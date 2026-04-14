import { describe, it, expect, vi } from 'vitest';
import { AgentTraceSchema, AgentTaskListResponseSchema } from '@kiditem/shared';
import { AgentTraceController } from '../agent-trace.controller';

// ── Controller wiring only ──
// RolesGuard 는 APP_GUARD 전역 등록 — 실제 role 강제는 e2e 범위 (본 세션 out-of-scope).
// 여기선 컨트롤러가 DTO → 서비스로 정확히 위임하고, 응답 shape 이 @kiditem/shared
// AgentTraceSchema / AgentTaskListResponseSchema 를 통과하는지만 검증.

function makeService() {
  return {
    listTasks: vi.fn(),
    getTrace: vi.fn(),
  };
}

const ISO = '2026-04-13T00:00:00.000Z';

const MOCK_TASK = {
  id: '11111111-1111-1111-1111-111111111111',
  companyId: 'company-1',
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
  startedAt: ISO,
  completedAt: ISO,
  createdAt: ISO,
  updatedAt: ISO,
};

const MOCK_TRACE = {
  task: MOCK_TASK,
  workflowRun: null,
  heartbeatRuns: [],
  wakeupRequests: [],
  events: [],
  logs: [],
  traceability: { markerFound: false, creationPath: 'unknown' as const, warning: 'missing marker' },
  pagination: { hasMore: false, nextCursor: null },
};

describe('AgentTraceController', () => {
  it('GET / delegates to service.listTasks with companyId + query', async () => {
    const svc = makeService();
    svc.listTasks.mockResolvedValue({ items: [MOCK_TASK], total: 1, page: 1, limit: 20 });
    const ctrl = new AgentTraceController(svc as any);

    const res = await ctrl.list('company-1', { status: 'completed' } as any);

    expect(svc.listTasks).toHaveBeenCalledWith('company-1', { status: 'completed' });
    // Response shape conforms to AgentTaskListResponseSchema (B.1 result)
    expect(AgentTaskListResponseSchema.safeParse(res).success).toBe(true);
  });

  it('GET /:id/trace delegates params.id + companyId + query to service.getTrace', async () => {
    const svc = makeService();
    svc.getTrace.mockResolvedValue(MOCK_TRACE);
    const ctrl = new AgentTraceController(svc as any);

    const res = await ctrl.trace(
      { id: '11111111-1111-1111-1111-111111111111' } as any,
      'company-1',
      { cursor: '0' } as any,
    );

    expect(svc.getTrace).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      'company-1',
      { cursor: '0' },
    );
    // Response shape conforms to AgentTraceSchema (B.1 result)
    expect(AgentTraceSchema.safeParse(res).success).toBe(true);
  });

  it('returns AgentTrace shape including traceability + pagination', async () => {
    const svc = makeService();
    svc.getTrace.mockResolvedValue(MOCK_TRACE);
    const ctrl = new AgentTraceController(svc as any);

    const res = await ctrl.trace({ id: 'abc' } as any, 'company-1', {} as any);

    expect(res.traceability).toEqual({
      markerFound: false,
      creationPath: 'unknown',
      warning: 'missing marker',
    });
    expect(res.pagination).toEqual({ hasMore: false, nextCursor: null });
  });
});
