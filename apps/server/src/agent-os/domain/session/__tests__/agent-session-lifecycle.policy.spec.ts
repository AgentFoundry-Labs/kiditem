import { describe, expect, it } from 'vitest';
import { assertSessionTaskTransition } from '../agent-session-lifecycle.policy';

describe('agent session lifecycle policy', () => {
  it('allows a queued task to run and rejects a terminal task restart', () => {
    expect(() => assertSessionTaskTransition('queued', 'running')).not.toThrow();
    expect(() => assertSessionTaskTransition('completed', 'running')).toThrow(
      'AGENT_SESSION_TASK_TRANSITION_INVALID',
    );
  });
});
