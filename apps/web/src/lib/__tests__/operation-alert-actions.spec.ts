import { describe, expect, it } from 'vitest';
import { isOperationAlertCancellable } from '../operation-alert-actions';

describe('operation alert actions', () => {
  it('does not offer a cancellation action for retired generic AgentRun alert sources', () => {
    for (const sourceType of ['agent_run_request', 'agent_run']) {
      expect(isOperationAlertCancellable({
        status: 'running',
        operationKey: 'agent-os:legacy',
        sourceType,
      })).toBe(false);
    }
  });
});
