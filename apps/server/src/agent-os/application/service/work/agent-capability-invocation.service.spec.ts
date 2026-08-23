import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AgentCapabilityInvocationService } from './agent-capability-invocation.service';

const definition = {
  key: 'sourcing.retrieveWorkspaceEvidence', ownerDomain: 'sourcing',
  effects: ['read'] as const, approvalRisk: 'none' as const,
  idempotency: 'recommended' as const, ownerInputPort: 'sourcing.workspaceEvidence',
  inputSchema: z.object({ query: z.string() }).strict(),
  outputSchema: z.object({ documents: z.array(z.string()) }).strict(),
};
const base = {
  organizationId: 'org', sessionId: 'session', taskId: 'task', attemptId: 'attempt',
  agentVersionId: 'version', initiatingUserId: 'user', capabilityKey: definition.key,
  authorizationKind: 'agent_default_scope' as const,
  authorizationExpiresAt: new Date(Date.now() + 60_000), input: { query: 'evidence' },
};

describe('AgentCapabilityInvocationService inline reads', () => {
  it('authorizes, executes the exact owner implementation, validates and durably finalizes a read', async () => {
    const work = {
      authorizeInvocation: vi.fn(async () => ({ invocationId: 'invocation', approvalId: null, invocationStatus: 'authorized', approvalStatus: null, applicationVersion: '1.2.3', authorizingGitSha: 'a'.repeat(40), runtimeType: 'codex_cli' })),
      finalizeInlineInvocation: vi.fn(async () => ({ won: true })),
    };
    const implementation = vi.fn(async () => ({ outcome: 'completed', summary: 'found', resourceRefs: [], operationRefs: [], output: { documents: ['bounded'] } }));
    const service = new AgentCapabilityInvocationService(work as never, {
      resolveDefinition: vi.fn(() => definition),
      resolveImplementation: vi.fn(() => ({ capabilityKey: definition.key, invoke: implementation })),
    } as never);

    await expect(service.invoke(base)).resolves.toMatchObject({ result: { output: { documents: ['bounded'] } } });
    expect(implementation).toHaveBeenCalledWith(expect.objectContaining({ input: base.input, context: expect.objectContaining({ applicationVersion: '1.2.3', authorizingGitSha: 'a'.repeat(40), runtimeType: 'codex_cli' }) }));
    expect(work.finalizeInlineInvocation).toHaveBeenCalledWith(expect.objectContaining({ invocationId: 'invocation', outcome: 'succeeded' }));
  });

  it('does not execute a mutation inline', async () => {
    const mutation = { ...definition, key: 'sourcing.ingestCandidate', effects: ['db_write'] as const, idempotency: 'required' as const };
    const work = { authorizeInvocation: vi.fn(async () => ({ invocationId: 'invocation', approvalId: null, invocationStatus: 'ready', approvalStatus: null, applicationVersion: '1', authorizingGitSha: 'a'.repeat(40), runtimeType: 'codex_cli' })), finalizeInlineInvocation: vi.fn() };
    const implementation = vi.fn();
    const service = new AgentCapabilityInvocationService(work as never, { resolveDefinition: vi.fn(() => mutation), resolveImplementation: vi.fn(() => ({ capabilityKey: mutation.key, invoke: implementation })) } as never);

    await expect(service.invoke({ ...base, capabilityKey: mutation.key, ownerIdempotencyKey: 'owner-key' })).resolves.toMatchObject({ invocationId: 'invocation' });
    expect(implementation).not.toHaveBeenCalled();
    expect(work.finalizeInlineInvocation).not.toHaveBeenCalled();
  });
});
