import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../../../lib/agent-api', () => ({
  fetchAgentTrace: vi.fn(),
}));

import { fetchAgentTrace } from '../../../../lib/agent-api';
import { TraceView } from '../TraceView';

const mockTrace = fetchAgentTrace as ReturnType<typeof vi.fn>;

function wrap(node: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const baseTask = {
  id: 'task-aaaaaaaa-bbbb',
  organizationId: 'c1',
  agentType: 'ad-strategy',
  status: 'succeeded',
  priority: 0,
  workflowRunId: null,
  workflowNodeId: null,
  sourceDataId: null,
  input: null,
  output: null,
  error: null,
  scheduledAt: null,
  startedAt: '2026-04-13T10:00:00Z',
  completedAt: '2026-04-13T10:01:00Z',
  createdAt: '2026-04-13T10:00:00Z',
  updatedAt: '2026-04-13T10:01:00Z',
};

const baseRun = {
  id: 'run-aaaa',
  organizationId: 'c1',
  agentId: 'agent-1',
  invocationSource: 'timer',
  triggerDetail: null,
  status: 'succeeded',
  startedAt: '2026-04-13T10:00:00Z',
  finishedAt: '2026-04-13T10:01:00Z',
  error: null,
  exitCode: 0,
  signal: null,
  usageJson: null,
  resultJson: null,
  sessionIdBefore: null,
  sessionIdAfter: null,
  stdoutExcerpt: null,
  stderrExcerpt: null,
  errorCode: null,
  processPid: null,
  wakeupRequestId: null,
  createdAt: '2026-04-13T10:00:00Z',
  updatedAt: '2026-04-13T10:01:00Z',
};

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ev-1',
    organizationId: 'c1',
    agentId: 'agent-1',
    runId: 'run-aaaa',
    eventType: 'agent.status.changed',
    category: null,
    detail: 'ok',
    action: null,
    tableName: null,
    recordId: null,
    fieldName: null,
    valueBefore: null,
    valueAfter: null,
    restoredAt: null,
    createdAt: '2026-04-13T10:00:30Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TraceView', () => {
  it('정상 응답 → 헤더 + 타임라인 렌더', async () => {
    mockTrace.mockResolvedValue({
      task: baseTask,
      workflowRun: null,
      heartbeatRuns: [baseRun],
      wakeupRequests: [],
      events: [makeEvent()],
      logs: [],
      traceability: { markerFound: true, creationPath: 'direct', warning: null },
      pagination: { hasMore: false, nextCursor: null },
    });

    render(wrap(<TraceView taskId="task-aaaaaaaa-bbbb" />));
    await waitFor(() => {
      expect(screen.getByText('태스크 트레이스')).toBeInTheDocument();
    });
    expect(screen.getByText('ad-strategy')).toBeInTheDocument();
    expect(screen.getByText('agent.status.changed')).toBeInTheDocument();
  });

  it('traceability.warning → 배너 렌더', async () => {
    mockTrace.mockResolvedValue({
      task: baseTask,
      workflowRun: null,
      heartbeatRuns: [],
      wakeupRequests: [],
      events: [],
      logs: [],
      traceability: {
        markerFound: false,
        creationPath: 'unknown',
        warning: '마커 누락으로 복원 불가',
      },
      pagination: { hasMore: false, nextCursor: null },
    });

    render(wrap(<TraceView taskId="task-aaaaaaaa-bbbb" />));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('마커 누락으로 복원 불가');
    });
  });

  it('events 0건 + stdoutExcerpt 있음 → PythonFallbackBox 렌더, crash X', async () => {
    mockTrace.mockResolvedValue({
      task: baseTask,
      workflowRun: null,
      heartbeatRuns: [{ ...baseRun, stdoutExcerpt: 'hello stdout', stderrExcerpt: null }],
      wakeupRequests: [],
      events: [],
      logs: [],
      traceability: { markerFound: true, creationPath: 'direct', warning: null },
      pagination: { hasMore: false, nextCursor: null },
    });

    render(wrap(<TraceView taskId="task-aaaaaaaa-bbbb" />));
    await waitFor(() => {
      expect(screen.getByText('이벤트 없음 — Python adapter 출력')).toBeInTheDocument();
    });
    expect(screen.getByText('hello stdout')).toBeInTheDocument();
  });

  it('stdoutExcerpt null + events 0 → "-" 처리, crash X', async () => {
    mockTrace.mockResolvedValue({
      task: baseTask,
      workflowRun: null,
      heartbeatRuns: [{ ...baseRun, stdoutExcerpt: null, stderrExcerpt: null, resultJson: null }],
      wakeupRequests: [],
      events: [],
      logs: [],
      traceability: { markerFound: true, creationPath: 'direct', warning: null },
      pagination: { hasMore: false, nextCursor: null },
    });

    render(wrap(<TraceView taskId="task-aaaaaaaa-bbbb" />));
    await waitFor(() => {
      expect(screen.getByText('이벤트 없음 — Python adapter 출력')).toBeInTheDocument();
    });
  });

  it('permission_denied 이벤트 → 빨강 border', async () => {
    mockTrace.mockResolvedValue({
      task: baseTask,
      workflowRun: null,
      heartbeatRuns: [baseRun],
      wakeupRequests: [],
      events: [makeEvent({ id: 'ev-2', eventType: 'agent.permission.denied', detail: '거부됨' })],
      logs: [],
      traceability: { markerFound: true, creationPath: 'direct', warning: null },
      pagination: { hasMore: false, nextCursor: null },
    });

    render(wrap(<TraceView taskId="task-aaaaaaaa-bbbb" />));
    const btn = await screen.findByText('agent.permission.denied');
    const wrapper = btn.closest('button');
    expect(wrapper?.className).toMatch(/border-red-300/);
  });

  it('schema drift → 오류 UI', async () => {
    mockTrace.mockRejectedValue(new Error('AgentTraceSchema drift: ...'));
    render(wrap(<TraceView taskId="task-aaaaaaaa-bbbb" />));
    await waitFor(() => {
      expect(screen.getByText(/트레이스를 불러오지 못했습니다/)).toBeInTheDocument();
    });
  });

  it('running status → refetchInterval 활성, 15s 후 재요청', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockTrace.mockResolvedValue({
        task: { ...baseTask, status: 'running', completedAt: null },
        workflowRun: null,
        heartbeatRuns: [],
        wakeupRequests: [],
        events: [],
        logs: [],
        traceability: { markerFound: true, creationPath: 'direct', warning: null },
        pagination: { hasMore: false, nextCursor: null },
      });

      render(wrap(<TraceView taskId="task-aaaaaaaa-bbbb" />));
      await waitFor(() => expect(mockTrace).toHaveBeenCalledTimes(1));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_500);
      });
      expect(mockTrace.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
