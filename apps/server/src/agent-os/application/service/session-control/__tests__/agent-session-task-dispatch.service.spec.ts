import { describe, expect, it, vi } from 'vitest';
import { AgentSessionTaskDispatchService } from '../agent-session-task-dispatch.service';

describe('AgentSessionTaskDispatchService', () => {
  it('uses the owned-operation port for the durable task and execution boundary', async () => {
    const owned = {
      startExecution: vi.fn().mockResolvedValue({
        operationRunId: 'operation-run-1',
        attemptId: 'attempt-1',
      }),
    };
    const service = new AgentSessionTaskDispatchService(
      owned as never,
    );
    const input = {
      organizationId: 'org-1',
      sessionId: '2c0ce72e-7b5e-4888-ad95-351e661c26aa',
      taskId: 'ba1ed095-6e22-4d50-b12f-d2ca01c0eb5c',
      executionId: '5e8f37a6-5a85-47d3-b952-ab64d1d985f5',
      requestedByUserId: 'user-1',
    };

    await service.dispatch(input);
    await service.dispatch(input);

    expect(owned.startExecution).toHaveBeenCalledTimes(2);
    expect(owned.startExecution).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      executionId: input.executionId,
      operationKey: 'agent-os.execute-session-task',
      requestedByUserId: input.requestedByUserId,
      idempotencyKey:
        'agent-os.execute-session-task:ba1ed095-6e22-4d50-b12f-d2ca01c0eb5c:5e8f37a6-5a85-47d3-b952-ab64d1d985f5',
    });
  });
});
