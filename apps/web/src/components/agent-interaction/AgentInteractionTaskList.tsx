'use client';

import type { AgentWorkTask } from './useAgentInteraction';

interface AgentInteractionTaskListProps {
  tasks: AgentWorkTask[];
  onContinue(task: AgentWorkTask): void;
  onReopen(task: AgentWorkTask): void;
  onInterrupt(task: AgentWorkTask): void;
  onCancel(task: AgentWorkTask): void;
  onApproval(task: AgentWorkTask, decision: 'approved' | 'rejected'): void;
}

/** Presentational durable-task renderer; the interaction controller owns actions. */
export function AgentInteractionTaskList({
  tasks,
  onContinue,
  onReopen,
  onInterrupt,
  onCancel,
  onApproval,
}: AgentInteractionTaskListProps) {
  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="rounded border p-3"
          style={{ marginLeft: `${taskDepth(task, tasks)}rem` }}
        >
          <p>{task.objective}</p>
          <p className="text-sm text-muted-foreground">
            {task.status} · {task.presentation} · {task.parentTaskId ? `Child of ${task.parentTaskId}` : 'Root task'} · {task.latestAttempt ? `Attempt ${task.latestAttempt.ordinal}: ${task.latestAttempt.status}` : 'No attempt'}
          </p>
          {task.summary ? <p className="text-sm" data-durable-summary>{task.summary}</p> : null}
          {task.error?.message ? <p className="text-sm text-destructive" data-durable-error>{task.error.message}</p> : null}
          {task.resourceRefs?.length ? (
            <p className="text-xs text-muted-foreground" data-resource-refs>
              Resources: {task.resourceRefs.map((ref) => `${ref.kind}:${ref.id}`).join(', ')}
            </p>
          ) : null}
          {task.operationRefs?.length ? (
            <p className="text-xs text-muted-foreground" data-operation-refs>
              Operations: {task.operationRefs.map((ref) => `${ref.kind}:${ref.id}${ref.status ? ` (${ref.status})` : ''}`).join(', ')}
            </p>
          ) : null}
          {task.approval ? (
            <p className="text-xs text-muted-foreground" data-approval>
              Approval {task.approval.id}{task.approval.expiresAt ? ` · expires ${task.approval.expiresAt}` : ''}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {task.latestAttempt && task.status === 'open' && ['needs_continue', 'needs_input'].includes(task.presentation) ? (
              <button type="button" onClick={() => onContinue(task)}>Continue</button>
            ) : null}
            {task.latestAttempt && task.status !== 'open' ? (
              <button type="button" onClick={() => onReopen(task)}>Reopen</button>
            ) : null}
            {task.latestAttempt && ['starting', 'running'].includes(task.latestAttempt.status) ? (
              <button type="button" onClick={() => onInterrupt(task)}>Interrupt</button>
            ) : null}
            {task.status === 'open' ? (
              <button type="button" onClick={() => onCancel(task)}>Cancel</button>
            ) : null}
            {task.approval ? (
              <>
                <button type="button" onClick={() => onApproval(task, 'approved')}>Approve</button>
                <button type="button" onClick={() => onApproval(task, 'rejected')}>Reject</button>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function taskDepth(task: AgentWorkTask, tasks: AgentWorkTask[]): number {
  let depth = 0;
  let parentId = task.parentTaskId;
  const seen = new Set<string>([task.id]);
  while (parentId && !seen.has(parentId) && depth < 8) {
    seen.add(parentId);
    depth += 1;
    parentId = tasks.find((candidate) => candidate.id === parentId)?.parentTaskId ?? null;
  }
  return depth;
}
