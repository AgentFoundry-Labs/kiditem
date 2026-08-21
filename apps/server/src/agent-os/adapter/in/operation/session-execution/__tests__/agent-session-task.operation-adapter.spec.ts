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
import { AgentSessionTaskOperationAdapter } from '../agent-session-task.operation-adapter';

describe('AgentSessionTaskOperationAdapter', () => {
  const organization = OrganizationIdSchema.parse('org-1');
  const session = formatAgentSessionName(organization, AgentSessionIdSchema.parse('00000000-0000-4000-8000-000000000001'));
  const task = formatAgentSessionTaskName(organization, AgentSessionIdSchema.parse('00000000-0000-4000-8000-000000000001'), AgentSessionTaskIdSchema.parse('00000000-0000-4000-8000-000000000002'));
  const execution = formatAgentExecutionName(organization, AgentSessionIdSchema.parse('00000000-0000-4000-8000-000000000001'), AgentExecutionIdSchema.parse('00000000-0000-4000-8000-000000000003'));

  it('registers and maps a strict Operations attempt into the execution port', async () => {
    const registry = { register: vi.fn() };
    const executionPort = { execute: vi.fn().mockResolvedValue({ status: 'completed', output: { ok: true } }), cancel: vi.fn() };
    const adapter = new AgentSessionTaskOperationAdapter(registry as never, executionPort as never);
    adapter.onModuleInit();

    await expect(adapter.execute({
      runId: 'operation-1', organizationId: 'org-1', attemptToken: 'attempt-token', requestedByUserId: 'user-1', signal: new AbortController().signal,
      input: { session, task, execution },
    } as never)).resolves.toEqual({ kind: 'completed', result: { ok: true } });
    expect(registry.register).toHaveBeenCalledTimes(1);
    expect(executionPort.execute).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', session, task, execution, operationAttemptToken: 'attempt-token', requestedByUserId: 'user-1',
    }));
  });

  it('rejects a canonical session from another organization before delegation', async () => {
    const adapter = new AgentSessionTaskOperationAdapter({ register: vi.fn() } as never, { execute: vi.fn(), cancel: vi.fn() } as never);
    await expect(adapter.execute({
      runId: 'operation-1', organizationId: 'other-org', attemptToken: 'attempt-token', requestedByUserId: null, signal: new AbortController().signal,
      input: { session, task, execution },
    } as never)).rejects.toThrow();
  });

  it('maps an Operations cancellation to the exact canonical operation resource', async () => {
    const executionPort = { execute: vi.fn(), cancel: vi.fn() };
    const adapter = new AgentSessionTaskOperationAdapter({ register: vi.fn() } as never, executionPort as never);

    await adapter.cancel({
      runId: 'operation-1', organizationId: 'org-1', requestedByUserId: 'user-1', reason: 'operator_cancelled',
    } as never);

    expect(executionPort.cancel).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', requestedByUserId: 'user-1', reason: 'operator_cancelled',
      operation: 'organizations/org-1/operations/operation-1',
    }));
  });
});
