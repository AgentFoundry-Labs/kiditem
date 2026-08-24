import { describe, expect, it, vi } from 'vitest';
import type { AttemptMcpBinding } from '../../../application/port/in/mcp/attempt-mcp-actions.port';
import { AttemptTokenRegistry } from './attempt-token.registry';

const attemptId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const leaseId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('AttemptTokenRegistry', () => {
  it('issues a raw token once, stores only its digest, and bounds expiry by the Attempt deadline or thirty minutes', () => {
    const now = new Date('2026-08-24T00:00:00.000Z');
    const registry = new AttemptTokenRegistry({ now: () => now });
    const issued = registry.issueBusiness({ binding: binding(), leaseId, deadline: new Date('2026-08-24T01:00:00.000Z') });

    expect(issued.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAt).toEqual(new Date('2026-08-24T00:30:00.000Z'));
    expect(registry.inspectDigest(issued.raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(registry)).not.toContain(issued.raw);
  });

  it('rejects missing, wrong, expired, stale-lease, and wrong-Attempt credentials before a factory can use them', () => {
    let now = new Date('2026-08-24T00:00:00.000Z');
    const registry = new AttemptTokenRegistry({ now: () => now });
    const issued = registry.issueBusiness({ binding: binding(), leaseId, deadline: new Date('2026-08-24T00:10:00.000Z') });

    expect(() => registry.requireBusiness({ raw: '', attemptId, leaseId })).toThrow('attempt_token_invalid');
    expect(() => registry.requireBusiness({ raw: issued.raw, attemptId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', leaseId })).toThrow('attempt_token_invalid');
    expect(() => registry.requireBusiness({ raw: issued.raw, attemptId, leaseId: '318f4eb1-9078-7a1e-9514-b19b5732f5de' })).toThrow('attempt_token_invalid');
    now = new Date('2026-08-24T00:10:00.001Z');
    expect(() => registry.requireBusiness({ raw: issued.raw, attemptId, leaseId })).toThrow('attempt_token_invalid');
  });

  it('revokes a token on terminal, interrupt, lease loss, and API-memory replacement', () => {
    const registry = new AttemptTokenRegistry();
    const first = registry.issueBusiness({ binding: binding(), leaseId, deadline: new Date(Date.now() + 60_000) });
    registry.revokeAttempt(attemptId);
    expect(() => registry.requireBusiness({ raw: first.raw, attemptId, leaseId })).toThrow('attempt_token_invalid');

    const second = registry.issueBusiness({ binding: binding(), leaseId, deadline: new Date(Date.now() + 60_000) });
    registry.revokeLease(leaseId);
    expect(() => registry.requireBusiness({ raw: second.raw, attemptId, leaseId })).toThrow('attempt_token_invalid');
    expect(new AttemptTokenRegistry().size).toBe(0);
  });

  it('keeps readiness tokens separate from business action bindings', () => {
    const registry = new AttemptTokenRegistry();
    const issued = registry.issueReadiness({ canaryId: 'readiness-canary', leaseId, deadline: new Date(Date.now() + 60_000) });

    expect(registry.requireReadiness({ raw: issued.raw, canaryId: 'readiness-canary', leaseId })).toEqual({ canaryId: 'readiness-canary' });
    expect(() => registry.requireBusiness({ raw: issued.raw, attemptId, leaseId })).toThrow('attempt_token_invalid');
  });
});

function binding(): AttemptMcpBinding {
  return {
    attemptId,
    sessionId: 'session-id',
    taskId: 'task-id',
    agentVersionId: 'agent-version-id',
    organizationId: 'organization-id',
    userId: 'user-id',
    capabilityKeys: ['sourcing.scrapeProductUrl'],
  };
}
