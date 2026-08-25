import { describe, expect, it } from 'vitest';
import {
  EXECUTION_BINDING_TTL_MS,
  ExecutionBindingInvalidError,
  ExecutionBindingRegistry,
} from './execution-binding.registry';

const ISSUE = {
  installationId: 'installation-1',
  organizationId: '00000000-0000-4000-8000-000000000001',
  initiatingUserId: '00000000-0000-4000-8000-000000000002',
  conversationId: 'conversation-1',
  turnId: 'turn-1',
};

describe('ExecutionBindingRegistry', () => {
  it('issues one random live-turn bearer, resolves it fresh, and revokes by execution id', () => {
    const now = new Date('2026-08-25T00:00:00.000Z');
    const registry = new ExecutionBindingRegistry(
      () => now,
      () => Buffer.from('a'.repeat(32)),
      () => 'execution-1',
    );
    const binding = registry.issue(ISSUE);

    expect(EXECUTION_BINDING_TTL_MS).toBe(4 * 60 * 60 * 1_000);
    expect(binding.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(binding.expiresAt.getTime() - now.getTime()).toBe(EXECUTION_BINDING_TTL_MS);
    expect(registry.resolve(binding.token)).toMatchObject({
      executionId: binding.executionId,
      organizationId: ISSUE.organizationId,
      initiatingUserId: ISSUE.initiatingUserId,
      conversationId: ISSUE.conversationId,
      turnId: ISSUE.turnId,
    });

    registry.revoke(binding.executionId);
    expect(() => registry.resolve(binding.token)).toThrow(ExecutionBindingInvalidError);
  });

  it('expires lazily without renewal and invalidates terminal/interrupt/Gateway-disconnect hooks', () => {
    let now = new Date('2026-08-25T00:00:00.000Z');
    let id = 0;
    const registry = new ExecutionBindingRegistry(
      () => now,
      () => Buffer.from(String(++id).padStart(32, '0')),
      () => `execution-${id}`,
    );
    const expired = registry.issue(ISSUE);
    now = new Date(now.getTime() + EXECUTION_BINDING_TTL_MS);
    expect(() => registry.resolve(expired.token)).toThrow('EXECUTION_BINDING_INVALID');
    expect(() => registry.resolve(expired.token)).toThrow('EXECUTION_BINDING_INVALID');

    const terminal = registry.issue({ ...ISSUE, turnId: 'turn-terminal' });
    registry.revokeTurn({
      installationId: ISSUE.installationId,
      conversationId: ISSUE.conversationId,
      turnId: 'turn-terminal',
    });
    expect(() => registry.resolve(terminal.token)).toThrow('EXECUTION_BINDING_INVALID');

    const disconnected = registry.issue({ ...ISSUE, turnId: 'turn-disconnected' });
    registry.revokeGatewayDisconnect(ISSUE.installationId);
    expect(() => registry.resolve(disconnected.token)).toThrow('EXECUTION_BINDING_INVALID');
  });
});
