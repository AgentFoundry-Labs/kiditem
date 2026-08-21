import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentSessionIdSchema,
  formatAgentSessionName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { OperationHandlerRegistryService } from '../../../../operations/application/service/operation-handler-registry.service';
import { OperationLifecycleGateService } from '../../../../operations/application/service/operation-lifecycle-gate.service';
import { OperationRunService } from '../../../../operations/application/service/operation-run.service';
import {
  AGENT_SESSION_DELETE_MAX_ATTEMPTS,
  AGENT_SESSION_DELETE_OPERATION,
  AGENT_SESSION_DELETE_OPERATION_KEY,
  AgentSessionDeleteOperationInputSchema,
} from '../agent-session-deletion.operations';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000010';
const SESSION_ID = '00000000-0000-4000-8000-000000000011';
const session = formatAgentSessionName(
  OrganizationIdSchema.parse(ORGANIZATION_ID),
  AgentSessionIdSchema.parse(SESSION_ID),
);

describe('AgentSession deletion operation definition', () => {
  it('defines a strict system-only ephemeral AgentOS deletion operation', () => {
    expect(AGENT_SESSION_DELETE_OPERATION).toMatchObject({
      key: AGENT_SESSION_DELETE_OPERATION_KEY,
      version: 1,
      title: 'Delete AgentOS session',
      ownerDomain: 'agent-os',
      engineType: 'agent_os',
      allowedTriggers: ['system'],
      scheduleSupported: false,
      maxAttempts: AGENT_SESSION_DELETE_MAX_ATTEMPTS,
      resourceClass: 'default',
      executionTimeoutMs: 15 * 60_000,
      successPersistence: 'ephemeral_on_success',
    });
    expect(AgentSessionDeleteOperationInputSchema.parse({ session, retryGeneration: 1 })).toEqual({
      session,
      retryGeneration: 1,
    });
    expect(() => AgentSessionDeleteOperationInputSchema.parse({ session, retryGeneration: 1, actorId: 'forbidden' }))
      .toThrow();
  });

  it('is not startable, readable, cancellable, reconnectable, or enumerable through public Operations', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(AGENT_SESSION_DELETE_OPERATION, {
      execute: vi.fn(),
      finalizeEphemeralSuccess: vi.fn(),
      exhaustRetry: vi.fn(),
    });
    const gate = new OperationLifecycleGateService();
    gate.open();
    const repository = {
      findByIdempotencyKey: vi.fn(),
      createRun: vi.fn(),
      findRunById: vi.fn(),
      listRuns: vi.fn().mockResolvedValue([]),
      listReconnectableRuns: vi.fn().mockResolvedValue([]),
      readLifecycleDatabaseTime: vi.fn().mockResolvedValue(new Date()),
      transition: vi.fn(),
    };
    const publicOperations = new OperationRunService(
      registry,
      repository as never,
      { cancelChildren: vi.fn() } as never,
      gate,
    );

    await expect(publicOperations.start({
      organizationId: ORGANIZATION_ID,
      operationKey: AGENT_SESSION_DELETE_OPERATION_KEY,
      triggerSource: 'system',
      input: { session, retryGeneration: 1 },
      requestedByUserId: '00000000-0000-4000-8000-000000000012',
      idempotencyKey: 'public-delete',
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(publicOperations.list({ organizationId: ORGANIZATION_ID })).resolves.toEqual([]);
    expect(repository.createRun).not.toHaveBeenCalled();
  });
});
