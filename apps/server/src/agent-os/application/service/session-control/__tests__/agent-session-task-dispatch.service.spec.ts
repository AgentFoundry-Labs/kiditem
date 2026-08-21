import { describe, expect, it, vi } from 'vitest';
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { AgentSessionTaskDispatchService } from '../agent-session-task-dispatch.service';

describe('AgentSessionTaskDispatchService', () => {
  it('uses operation key plus task and execution as the durable idempotency boundary', async () => {
    const operations = {
      start: vi.fn().mockResolvedValue({ id: 'operation-run-1' }),
    };
    const controls = {
      reserveAttemptForOperation: vi.fn().mockResolvedValue({ id: 'attempt-1' }),
    };
    const service = new AgentSessionTaskDispatchService(
      operations as never,
      controls as never,
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

    const organization = OrganizationIdSchema.parse(input.organizationId);
    const session = formatAgentSessionName(
      organization,
      AgentSessionIdSchema.parse(input.sessionId),
    );

    expect(operations.start).toHaveBeenCalledTimes(2);
    expect(operations.start).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: 'agent-os.execute-session-task',
        input: {
          session,
          task: formatAgentSessionTaskName(
            organization,
            AgentSessionIdSchema.parse(input.sessionId),
            AgentSessionTaskIdSchema.parse(input.taskId),
          ),
          execution: formatAgentExecutionName(
            organization,
            AgentSessionIdSchema.parse(input.sessionId),
            AgentExecutionIdSchema.parse(input.executionId),
          ),
        },
        idempotencyKey:
          'agent-os.execute-session-task:ba1ed095-6e22-4d50-b12f-d2ca01c0eb5c:5e8f37a6-5a85-47d3-b952-ab64d1d985f5',
      }),
    );
    expect(controls.reserveAttemptForOperation).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      executionId: input.executionId,
      operationRunId: 'operation-run-1',
      idempotencyKey: 'operation:operation-run-1',
    });
  });
});
