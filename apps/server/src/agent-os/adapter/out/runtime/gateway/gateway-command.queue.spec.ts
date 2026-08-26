import { describe, expect, it, vi } from 'vitest';
import { GATEWAY_RUNTIME_TRAIN } from '@kiditem/shared/agent-runtime';
import { GatewayCommandQueue } from './gateway-command.queue';

const POLL = {
  kind: 'poll' as const,
  gatewayInstanceId: 'gateway-1',
  platform: 'macos' as const,
  runtimeTrain: GATEWAY_RUNTIME_TRAIN,
};

describe('GatewayCommandQueue', () => {
  it('reports the first and replacement instance claims exactly once', () => {
    const queue = new GatewayCommandQueue({
      bindings: bindingRegistry() as never,
      installationId: 'installation-1',
      longPollMs: 0,
    });

    expect(queue.claim('gateway-1')).toBe(true);
    expect(queue.claim('gateway-1')).toBe(false);
    expect(queue.claim('gateway-2')).toBe(true);
  });

  it('issues one execution binding immediately before a queued turn start and revokes it on terminal state', async () => {
    const bindings = bindingRegistry();
    const queue = new GatewayCommandQueue({
      bindings: bindings as never,
      installationId: 'installation-1',
      longPollMs: 0,
    });

    await queue.poll(POLL);
    queue.enqueueTurnStart({
      organizationId: '00000000-0000-4000-8000-000000000001',
      initiatingUserId: '00000000-0000-4000-8000-000000000002',
      commandId: 'command-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      message: 'Use the provider-native conversation.',
      model: 'gpt-5.6',
      reasoningEffort: 'high',
    });

    const batch = await queue.poll(POLL);
    expect(bindings.issue).toHaveBeenCalledWith(expect.objectContaining({
      installationId: 'installation-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
    }));
    expect(batch.commands).toEqual([expect.objectContaining({
      kind: 'turn.start',
      commandId: 'command-1',
      executionBinding: 'binding-1',
    })]);

    queue.acknowledge('command-1');
    queue.terminal('conversation-1', 'turn-1');
    expect(bindings.revokeTurn).toHaveBeenCalledWith({
      installationId: 'installation-1', conversationId: 'conversation-1', turnId: 'turn-1',
    });
  });

  it('keeps one live installation session and clears transient commands and bindings when a Gateway instance is replaced or lost', async () => {
    const bindings = bindingRegistry();
    const queue = new GatewayCommandQueue({
      bindings: bindings as never,
      installationId: 'installation-1',
      longPollMs: 0,
    });

    expect(() => queue.enqueue({ kind: 'conversation.list', commandId: 'offline-command' })).toThrow('gateway_session_unavailable');
    await queue.poll(POLL);
    queue.enqueue({ kind: 'conversation.list', commandId: 'command-1' });
    expect((await queue.poll(POLL)).commands).toHaveLength(1);

    const replacement = { ...POLL, gatewayInstanceId: 'gateway-2' };
    expect(await queue.poll(replacement)).toEqual({ commands: [] });
    expect(bindings.revokeInstallation).toHaveBeenCalledWith('installation-1');

    queue.disconnect('gateway-2');
    expect(bindings.revokeInstallation).toHaveBeenCalledTimes(2);
    expect(queue.isLiveSession('gateway-2')).toBe(false);
  });
});

function bindingRegistry() {
  return {
    issue: vi.fn(() => ({ token: 'binding-1', executionId: 'execution-1', expiresAt: new Date('2026-08-26T04:00:00.000Z') })),
    revokeTurn: vi.fn(),
    revokeInstallation: vi.fn(),
  };
}
