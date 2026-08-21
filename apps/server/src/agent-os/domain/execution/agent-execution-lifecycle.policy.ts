import { AgentOsBoundaryError } from '../agent-os.errors';

const executionTransitions: Record<string, ReadonlySet<string>> = {
  running: new Set(['completed', 'failed', 'cancelled']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export function assertExecutionTransition(current: string, next: string): void {
  if (!executionTransitions[current]?.has(next)) {
    throw new AgentOsBoundaryError('AGENT_EXECUTION_TRANSITION_INVALID');
  }
}

export function canExecutionTransition(current: string, next: string): boolean {
  return executionTransitions[current]?.has(next) ?? false;
}
