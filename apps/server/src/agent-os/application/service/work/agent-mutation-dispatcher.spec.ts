import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AgentMutationDispatcherService } from './agent-mutation-dispatcher.service';
import { capabilityContractFingerprint } from './agent-capability-invocation.service';

const NOW = new Date('2030-01-01T00:00:00.000Z');
const LEASE = new Date('2030-01-01T00:01:00.000Z');

function definition(overrides: Record<string, unknown> = {}) {
  return {
    key: 'products.write',
    ownerDomain: 'products',
    description: 'writes a product',
    inputSchema: z.object({ productId: z.string(), version: z.number() }),
    outputSchema: z.object({ productId: z.string() }),
    effects: ['db_write'],
    approvalRisk: 'low',
    idempotency: 'required',
    ownerInputPort: 'products.write',
    ...overrides,
  } as const;
}

function snapshot(overrides: Record<string, unknown> = {}) {
  const current = definition();
  return {
    invocationId: 'invocation-1',
    organizationId: 'organization-1',
    sessionId: 'session-1',
    taskId: 'task-1',
    attemptId: 'attempt-1',
    agentVersionId: 'version-1',
    initiatingUserId: 'user-1',
    capabilityKey: current.key,
    ownerDomain: current.ownerDomain,
    authorizationKind: 'agent_default_scope' as const,
    authorizationExpiresAt: new Date('2030-01-01T01:00:00.000Z'),
    inputHash: 'a'.repeat(64),
    canonicalInput: { productId: 'product-1', version: 3 },
    effects: current.effects,
    approvalRisk: current.approvalRisk,
    idempotencyRequirement: current.idempotency,
    ownerIdempotencyKey: 'owner-key-1',
    applicationVersion: '1.0.0',
    authorizingGitSha: 'a'.repeat(40),
    capabilityContractFingerprint: capabilityContractFingerprint(current),
    runtimeType: 'codex_cli',
    reportedModel: null,
    attemptCount: 1,
    leaseOwner: 'worker-1',
    leaseExpiresAt: LEASE,
    ...overrides,
  };
}

describe('AgentMutationDispatcherService', () => {
  it('claims ready durable work, replays exact canonical input and finalizes success', async () => {
    const work = snapshot();
    const claimMutation = vi.fn().mockResolvedValue(work);
    const finalizeMutation = vi.fn().mockResolvedValue({ won: true });
    const invoke = vi.fn().mockResolvedValue({
      outcome: 'completed', summary: 'saved', resourceRefs: [{ kind: 'product', id: 'product-1', version: '3' }], operationRefs: [], output: { productId: 'product-1' },
    });
    const dispatcher = new AgentMutationDispatcherService(
      { claimMutation, finalizeMutation } as never,
      {
        resolveDefinition: vi.fn().mockReturnValue(definition()),
        resolveImplementation: vi.fn().mockReturnValue({ capabilityKey: 'products.write', invoke }),
      } as never,
      { applicationVersion: '1.0.0', gitSha: 'a'.repeat(40) },
      () => NOW,
    );

    await expect(dispatcher.dispatchOne('worker-1')).resolves.toBe(true);
    expect(claimMutation).toHaveBeenCalledWith({
      workerId: 'worker-1', claimedAt: NOW, leaseExpiresAt: LEASE,
    });
    expect(invoke).toHaveBeenCalledWith({
      context: expect.objectContaining({
        organizationId: 'organization-1', attemptId: 'attempt-1', ownerIdempotencyKey: 'owner-key-1', authorizingGitSha: 'a'.repeat(40),
      }),
      input: { productId: 'product-1', version: 3 },
    });
    expect(finalizeMutation).toHaveBeenCalledWith(expect.objectContaining({
      invocationId: 'invocation-1', leaseOwner: 'worker-1', outcome: 'succeeded',
      result: expect.objectContaining({ resourceRefs: [{ kind: 'product', id: 'product-1', version: '3' }] }),
    }));
  });

  it('fails a stale capability before invoking its owner', async () => {
    const work = snapshot({ authorizingGitSha: 'b'.repeat(40) });
    const claimMutation = vi.fn().mockResolvedValue(work);
    const finalizeMutation = vi.fn().mockResolvedValue({ won: true });
    const invoke = vi.fn();
    const dispatcher = new AgentMutationDispatcherService(
      { claimMutation, finalizeMutation } as never,
      {
        resolveDefinition: vi.fn().mockReturnValue(definition()),
        resolveImplementation: vi.fn().mockReturnValue({ capabilityKey: 'products.write', invoke }),
      } as never,
      { applicationVersion: '1.0.0', gitSha: 'a'.repeat(40) },
      () => NOW,
    );

    await expect(dispatcher.dispatchOne('worker-1')).resolves.toBe(true);
    expect(invoke).not.toHaveBeenCalled();
    expect(finalizeMutation).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'failed', error: { code: 'stale_capability_version', message: 'Capability version is no longer current.' },
    }));
  });

  it('fails a fingerprint-drifted capability before invoking its owner', async () => {
    const work = snapshot({ capabilityContractFingerprint: 'f'.repeat(64) });
    const claimMutation = vi.fn().mockResolvedValue(work);
    const finalizeMutation = vi.fn().mockResolvedValue({ won: true });
    const invoke = vi.fn();
    const dispatcher = new AgentMutationDispatcherService(
      { claimMutation, finalizeMutation } as never,
      {
        resolveDefinition: vi.fn().mockReturnValue(definition()),
        resolveImplementation: vi.fn().mockReturnValue({ capabilityKey: 'products.write', invoke }),
      } as never,
      { applicationVersion: '1.0.0', gitSha: 'a'.repeat(40) },
      () => NOW,
    );

    await dispatcher.dispatchOne('worker-1');
    expect(invoke).not.toHaveBeenCalled();
    expect(finalizeMutation).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'failed', error: { code: 'stale_capability_version', message: 'Capability version is no longer current.' },
    }));
  });
});
