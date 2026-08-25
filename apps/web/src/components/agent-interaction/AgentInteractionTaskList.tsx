'use client';

import {
  canContinueAgentWorkTask,
  canReopenAgentWorkTask,
  isLiveAgentWorkAttempt,
  type AgentWorkApproval,
  type AgentWorkReference,
  type AgentWorkResult,
  type AgentWorkTask,
} from './useAgentInteraction';

interface AgentInteractionTaskListProps {
  tasks: AgentWorkTask[];
  onContinue(task: AgentWorkTask): void;
  onReopen(task: AgentWorkTask): void;
  onInterrupt(task: AgentWorkTask): void;
  onCancel(task: AgentWorkTask): void;
  onApproval(task: AgentWorkTask, decision: 'approved' | 'rejected'): void;
}

/** Durable fact renderer; the interaction controller owns explicit actions. */
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
            {task.status} · {task.parentTaskId ? `Child of ${task.parentTaskId}` : 'Root task'} · {task.latestAttempt ? `Attempt ${task.latestAttempt.ordinal}: ${task.latestAttempt.status}` : 'No attempt'}
          </p>
          <ResultFacts result={task.result ?? task.latestAttempt?.result ?? null} />
          {task.latestAttempt?.error?.message ? <p className="text-sm text-destructive" data-durable-error>{task.latestAttempt.error.message}</p> : null}
          {task.resourceRefs?.length ? (
            <p className="text-xs text-muted-foreground" data-resource-refs>
              Resources: {task.resourceRefs.map(renderReference).join(', ')}
            </p>
          ) : null}
          {task.operationRefs?.length ? (
            <p className="text-xs text-muted-foreground" data-operation-refs>
              Operations: {task.operationRefs.map(renderReference).join(', ')}
            </p>
          ) : null}
          <ApprovalFacts approvals={task.approvals?.length ? task.approvals : task.approval ? [task.approval] : []} />
          {task.invocations?.length ? (
            <p className="text-xs text-muted-foreground" data-invocation-facts>
              Invocations: {task.invocations.map((invocation) => `${invocation.capabilityKey} (${invocation.status})`).join(', ')}
            </p>
          ) : null}
          {task.childTasks?.length ? (
            <p className="text-xs text-muted-foreground" data-child-task-facts>
              Child tasks: {task.childTasks.map((child) => `${child.objective} (${child.status}${child.latestAttempt ? `; Attempt ${child.latestAttempt.ordinal}: ${child.latestAttempt.status}` : ''})`).join(', ')}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {canContinueAgentWorkTask(task) ? (
              <button type="button" onClick={() => onContinue(task)}>Continue</button>
            ) : null}
            {canReopenAgentWorkTask(task) ? (
              <button type="button" onClick={() => onReopen(task)}>Reopen</button>
            ) : null}
            {isLiveAgentWorkAttempt(task.latestAttempt) ? (
              <button type="button" onClick={() => onInterrupt(task)}>Interrupt</button>
            ) : null}
            {task.status === 'open' ? (
              <button type="button" onClick={() => onCancel(task)}>Cancel</button>
            ) : null}
            {task.approval?.status === 'pending' ? (
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

function ResultFacts({ result }: { result: AgentWorkResult | null }) {
  if (!result) return null;
  return (
    <>
      {result.summary ? <p className="text-sm" data-durable-summary>{result.summary}</p> : null}
      {result.error?.message ? <p className="text-sm text-destructive" data-durable-error>{result.error.message}</p> : null}
      {result.needsInput === undefined ? null : (
        <p className="text-xs text-muted-foreground" data-needs-input>
          Needs input: {structuredFact(result.needsInput)}
        </p>
      )}
    </>
  );
}

function ApprovalFacts({ approvals }: { approvals: AgentWorkApproval[] }) {
  if (!approvals.length) return null;
  return (
    <p className="text-xs text-muted-foreground" data-approval>
      Approvals: {approvals.map((approval) => `${approval.id} (${approval.status ?? 'unknown'})${approval.expiresAt ? ` · expires ${approval.expiresAt}` : ''}`).join(', ')}
    </p>
  );
}

function renderReference(ref: AgentWorkReference): string {
  return `${ref.kind ?? 'reference'}:${ref.id ?? 'unknown'}${ref.status ? ` (${ref.status})` : ''}`;
}

function structuredFact(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return '[unavailable structured input]'; }
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
