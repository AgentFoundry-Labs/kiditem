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
import {
  AGENT_SESSION_OWNED_OPERATION_PORT,
  type AgentSessionOwnedOperationPort,
} from '../../../port/in/session-control/agent-session-owned-operation.port';
import { AgentSessionOwnedOperationService } from '../agent-session-owned-operation.service';

const snapshot = {
  key: 'agent-os.execute-session-task',
  version: 1,
  title: 'Execute session task',
  ownerDomain: 'agent-os',
  engineType: 'agent_os' as const,
  resourceClass: 'default' as const,
  executionTimeoutMs: 900_000,
  maxAttempts: 3,
  successPersistence: 'retained' as const,
};

describe('AgentSessionOwnedOperationService', () => {
  it('resolves an accepting snapshot and atomically starts the execution-owned run', async () => {
    const signal = new AbortController().signal;
    const platform = {
      resolveAccepting: vi.fn().mockReturnValue({
        definition: snapshot,
        parsedInput: { source: 'parsed' },
        signal,
      }),
    };
    const transaction = {
      createExecutionRun: vi.fn().mockResolvedValue({
        operationRunId: 'operation-run-1',
        attemptId: 'attempt-1',
      }),
      createCapabilityRun: vi.fn(),
    };
    const service: AgentSessionOwnedOperationPort =
      new AgentSessionOwnedOperationService(platform as never, transaction as never);

    await expect(service.startExecution({
      organizationId: 'org-1',
      sessionId: '00000000-0000-4000-8000-000000000001',
      taskId: '00000000-0000-4000-8000-000000000002',
      executionId: '00000000-0000-4000-8000-000000000003',
      operationKey: snapshot.key,
      requestedByUserId: 'user-1',
      idempotencyKey: 'session-execution:00000000-0000-4000-8000-000000000003',
    })).resolves.toEqual({ operationRunId: 'operation-run-1', attemptId: 'attempt-1' });

    const organization = OrganizationIdSchema.parse('org-1');
    const sessionId = AgentSessionIdSchema.parse('00000000-0000-4000-8000-000000000001');
    const taskId = AgentSessionTaskIdSchema.parse('00000000-0000-4000-8000-000000000002');
    const executionId = AgentExecutionIdSchema.parse('00000000-0000-4000-8000-000000000003');
    expect(platform.resolveAccepting).toHaveBeenCalledWith({
      operationKey: snapshot.key,
      triggerSource: 'agent',
      input: {
        session: formatAgentSessionName(organization, sessionId),
        task: formatAgentSessionTaskName(organization, sessionId, taskId),
        execution: formatAgentExecutionName(organization, sessionId, executionId),
      },
    });
    expect(transaction.createExecutionRun).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sessionId: '00000000-0000-4000-8000-000000000001',
      taskId: '00000000-0000-4000-8000-000000000002',
      executionId: '00000000-0000-4000-8000-000000000003',
      requestedByUserId: 'user-1',
      idempotencyKey: 'session-execution:00000000-0000-4000-8000-000000000003',
      definition: snapshot,
      parsedInput: { source: 'parsed' },
      signal,
    });
  });

  it('uses the same owned port for deterministic capability operations', async () => {
    const signal = new AbortController().signal;
    const platform = {
      resolveAccepting: vi.fn().mockReturnValue({
        definition: snapshot,
        parsedInput: { scope: 'current' },
        signal,
      }),
    };
    const transaction = {
      createExecutionRun: vi.fn(),
      createCapabilityRun: vi.fn().mockResolvedValue({ operationRunId: 'operation-run-2' }),
    };
    const service = new AgentSessionOwnedOperationService(
      platform as never,
      transaction as never,
    );

    await expect(service.startCapability({
      organizationId: 'org-1',
      sessionId: '00000000-0000-4000-8000-000000000001',
      operationKey: snapshot.key,
      requestedByUserId: null,
      input: { scope: 'current' },
      idempotencyKey: 'session-capability:1',
    })).resolves.toEqual({ operationRunId: 'operation-run-2' });

    expect(transaction.createExecutionRun).not.toHaveBeenCalled();
    expect(transaction.createCapabilityRun).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: '00000000-0000-4000-8000-000000000001',
      definition: snapshot,
      parsedInput: { scope: 'current' },
      signal,
    }));
  });

  it('declares the API-only owned-operation input token', () => {
    expect(AGENT_SESSION_OWNED_OPERATION_PORT).toBeTypeOf('symbol');
  });
});
