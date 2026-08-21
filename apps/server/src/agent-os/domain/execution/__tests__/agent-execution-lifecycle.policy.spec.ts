import { describe, expect, it } from 'vitest';
import { assertExecutionTransition } from '../agent-execution-lifecycle.policy';

describe('agent execution lifecycle policy', () => {
  it('allows terminal completion only from running', () => {
    expect(() => assertExecutionTransition('running', 'completed')).not.toThrow();
    expect(() => assertExecutionTransition('completed', 'running')).toThrow(
      'AGENT_EXECUTION_TRANSITION_INVALID',
    );
  });
});
