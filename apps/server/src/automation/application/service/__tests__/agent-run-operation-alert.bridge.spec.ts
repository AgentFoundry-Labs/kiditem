import { describe, it, expect, vi } from 'vitest';
import { AgentRunOperationAlertBridge } from '../agent-run-operation-alert.bridge';
import type { AgentRunFinalizedEvent } from '../../../../agent-os/application/event/agent-run-events';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = '22222222-2222-2222-2222-222222222222';
const RUN_ID = '33333333-3333-3333-3333-333333333333';

function makeOperationAlerts() {
  return {
    closeBySource: vi.fn().mockResolvedValue({}),
  };
}

describe('AgentRunOperationAlertBridge', () => {
  it('closes the source-linked operation alert with succeeded on a successful AgentRun', async () => {
    const operationAlerts = makeOperationAlerts();
    const bridge = new AgentRunOperationAlertBridge(operationAlerts as never);
    const event: AgentRunFinalizedEvent = {
      organizationId: ORG,
      requestId: REQUEST_ID,
      runId: RUN_ID,
      status: 'succeeded',
      output: { ok: true },
    };

    await bridge.onAgentRunFinalized(event);

    expect(operationAlerts.closeBySource).toHaveBeenCalledWith(
      ORG,
      'agent_run_request',
      REQUEST_ID,
      'succeeded',
      expect.objectContaining({
        metadata: expect.objectContaining({ runId: RUN_ID }),
      }),
    );
  });

  it('closes the source-linked operation alert with failed on terminal AgentRun failure', async () => {
    const operationAlerts = makeOperationAlerts();
    const bridge = new AgentRunOperationAlertBridge(operationAlerts as never);
    const event: AgentRunFinalizedEvent = {
      organizationId: ORG,
      requestId: REQUEST_ID,
      runId: RUN_ID,
      status: 'failed',
      errorCode: 'gemini_timeout',
      errorMessage: 'request timed out',
    };

    await bridge.onAgentRunFinalized(event);

    expect(operationAlerts.closeBySource).toHaveBeenCalledWith(
      ORG,
      'agent_run_request',
      REQUEST_ID,
      'failed',
      expect.objectContaining({
        message: 'request timed out',
        metadata: expect.objectContaining({
          runId: RUN_ID,
          errorCode: 'gemini_timeout',
        }),
      }),
    );
  });

  it('swallows errors from closeBySource so the bridge never crashes the bus', async () => {
    const operationAlerts = {
      closeBySource: vi.fn().mockRejectedValue(new Error('DB down')),
    };
    const bridge = new AgentRunOperationAlertBridge(operationAlerts as never);

    await expect(
      bridge.onAgentRunFinalized({
        organizationId: ORG,
        requestId: REQUEST_ID,
        runId: RUN_ID,
        status: 'succeeded',
      }),
    ).resolves.toBeUndefined();
  });
});
