'use client';

import { useMutation } from '@tanstack/react-query';
import type { AgentProgressEvent, AgentTaskStatus } from '@kiditem/shared/agent-interaction';
import { parseAgentSessionName, parseAgentSessionTaskName } from '@kiditem/shared/identifiers';
import { apiClient } from '@/lib/api-client';

const statusLabel: Record<AgentTaskStatus, string> = {
  queued: '대기 중',
  running: '실행 중',
  waiting_dependency: '의존성 대기',
  waiting_approval: '승인 대기',
  paused: '일시 중지됨',
  completed: '완료됨',
  failed: '실패함',
  cancelled: '취소됨',
};

type TaskAction = 'retry' | 'resume' | 'cancel';

export function AgentProgressCard({ event }: { event: AgentProgressEvent }) {
  const graph = parseTaskGraph(event);
  const control = useMutation({
    mutationFn: (action: TaskAction) => apiClient.post(
      `/api/agent-os/sessions/${encodeURIComponent(graph.session)}/tasks/${encodeURIComponent(graph.task)}/${action}`,
      {
        idempotencyKey: crypto.randomUUID(),
        expectedStatus: action === 'retry'
          ? 'failed'
          : action === 'resume'
            ? event.status
            : event.status,
      },
    ),
  });
  const controls = controlsFor(event.status);

  return (
    <section
      data-testid={`agent-task-${graph.task}`}
      aria-label={`Agent 작업 ${graph.task}`}
      className="space-y-3 rounded-lg border border-border bg-card p-3 text-card-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{statusLabel[event.status]}</p>
          <p className="mt-1 text-sm text-muted-foreground">{event.label}</p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {Math.round(event.progress * 100)}%
        </span>
      </div>
      <div
        aria-label="작업 진행률"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(event.progress * 100)}
        role="progressbar"
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${event.progress * 100}%` }}
        />
      </div>
      {controls.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {controls.map((action) => (
            <button
              key={action}
              type="button"
              disabled={control.isPending}
              onClick={() => control.mutate(action)}
              className="rounded-md border border-input px-2.5 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              {actionLabel(action)}
            </button>
          ))}
        </div>
      ) : null}
      {control.isError ? (
        <p role="alert" className="text-sm text-destructive">
          작업 제어 요청을 처리하지 못했습니다.
        </p>
      ) : null}
    </section>
  );
}

function parseTaskGraph(event: AgentProgressEvent) {
  const session = parseAgentSessionName(event.session);
  const task = parseAgentSessionTaskName(event.task, event.session);
  return { session: session.session, task: task.task };
}

function controlsFor(status: AgentTaskStatus): TaskAction[] {
  switch (status) {
    case 'failed':
      return ['retry'];
    case 'paused':
    case 'waiting_dependency':
      return ['resume', 'cancel'];
    case 'queued':
    case 'running':
    case 'waiting_approval':
      return ['cancel'];
    case 'completed':
    case 'cancelled':
      return [];
  }
}

function actionLabel(action: TaskAction): string {
  switch (action) {
    case 'retry': return '다시 시도';
    case 'resume': return '재개';
    case 'cancel': return '취소';
  }
}
