import { AgentOsBoundaryError } from '../agent-os.errors';

const taskTransitions: Record<string, ReadonlySet<string>> = {
  queued: new Set(['running', 'paused', 'cancelled']),
  running: new Set(['waiting_dependency', 'waiting_approval', 'paused', 'completed', 'failed', 'cancelled']),
  waiting_dependency: new Set(['running', 'paused', 'cancelled']),
  waiting_approval: new Set(['running', 'paused', 'failed', 'cancelled']),
  paused: new Set(['running', 'cancelled']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export function assertSessionTaskTransition(current: string, next: string): void {
  if (!taskTransitions[current]?.has(next)) {
    throw new AgentOsBoundaryError('AGENT_SESSION_TASK_TRANSITION_INVALID');
  }
}

export function canSessionTaskTransition(current: string, next: string): boolean {
  return taskTransitions[current]?.has(next) ?? false;
}
