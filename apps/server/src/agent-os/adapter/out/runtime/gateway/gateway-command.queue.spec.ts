import { describe, expect, it, vi } from 'vitest';
import { GATEWAY_RUNTIME_TRAIN } from '@kiditem/shared/agent-runtime';
import { GatewayCommandQueue } from './gateway-command.queue';

const POLL = {
  kind: 'poll' as const,
  gatewayInstanceId: 'gateway-1',
  platform: 'macos' as const,
  mcpTransportToken: 'A'.repeat(43),
  runtimeTrain: GATEWAY_RUNTIME_TRAIN,
};

describe('GatewayCommandQueue', () => {
  it('reports the first and replacement instance claims exactly once', () => {
    const queue = new GatewayCommandQueue({
      runtime: mcpRuntime() as never,
      installationId: 'installation-1',
      longPollMs: 0,
    });

    expect(queue.claim(POLL)).toBe(true);
    expect(queue.claim(POLL)).toBe(false);
    expect(queue.claim({ ...POLL, gatewayInstanceId: 'gateway-2', mcpTransportToken: 'B'.repeat(43) })).toBe(true);
  });

  it('registers one process bearer on poll, activates a fresh turn before queueing, and deactivates only on terminal state', async () => {
    const runtime = mcpRuntime();
    const queue = new GatewayCommandQueue({
      runtime: runtime as never,
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
    expect(runtime.registerProcess).toHaveBeenCalledWith(expect.objectContaining({
      installationId: 'installation-1',
      gatewayInstanceId: 'gateway-1',
      mcpTransportToken: POLL.mcpTransportToken,
    }));
    expect(runtime.activateTurn).toHaveBeenCalledWith(expect.objectContaining({
      installationId: 'installation-1',
      gatewayInstanceId: 'gateway-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
    }));
    expect(batch.commands).toEqual([expect.objectContaining({
      kind: 'turn.start',
      commandId: 'command-1',
    })]);
    expect(JSON.stringify(batch)).not.toContain('mcpTransportToken');

    queue.acknowledge('command-1');
    queue.terminal('conversation-1', 'turn-1');
    expect(runtime.deactivateTurn).toHaveBeenCalledWith({
      installationId: 'installation-1', gatewayInstanceId: 'gateway-1', conversationId: 'conversation-1', turnId: 'turn-1',
    });
  });

  it('does not queue a second provider start for an exact active-turn retry with a different control command ID', async () => {
    const runtime = mcpRuntime();
    const queue = new GatewayCommandQueue({
      runtime: runtime as never,
      installationId: 'installation-1',
      longPollMs: 0,
    });
    await queue.poll(POLL);
    const input = {
      organizationId: '00000000-0000-4000-8000-000000000001',
      initiatingUserId: '00000000-0000-4000-8000-000000000002',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      message: 'Use the provider-native conversation.',
      model: 'gpt-5.6',
      reasoningEffort: 'high',
    };

    queue.enqueueTurnStart({ ...input, commandId: 'command-1' });
    queue.enqueueTurnStart({ ...input, commandId: 'command-2' });

    expect((await queue.poll(POLL)).commands).toEqual([
      expect.objectContaining({ kind: 'turn.start', commandId: 'command-1' }),
    ]);
    expect(runtime.activateTurn).toHaveBeenCalledTimes(2);
  });

  it('keeps one live installation session and clears transient commands and process transport when a Gateway instance is replaced or lost', async () => {
    const runtime = mcpRuntime();
    const queue = new GatewayCommandQueue({
      runtime: runtime as never,
      installationId: 'installation-1',
      longPollMs: 0,
    });

    expect(() => queue.enqueue({ kind: 'conversation.list', commandId: 'offline-command', organizationId: 'organization-1' })).toThrow('gateway_session_unavailable');
    await queue.poll(POLL);
    queue.enqueue({ kind: 'conversation.list', commandId: 'command-1', organizationId: 'organization-1' });
    expect((await queue.poll(POLL)).commands).toHaveLength(1);

    const replacement = { ...POLL, gatewayInstanceId: 'gateway-2' };
    expect(await queue.poll(replacement)).toEqual({ commands: [] });
    expect(runtime.disconnect).toHaveBeenCalledWith('gateway-1');

    queue.disconnect('gateway-2');
    expect(runtime.disconnect).toHaveBeenCalledWith('gateway-2');
    expect(queue.isLiveSession('gateway-2')).toBe(false);
  });

  it('invalidates a displaced Gateway long-poll instead of resolving it as an empty command batch', async () => {
    const queue = new GatewayCommandQueue({
      runtime: mcpRuntime() as never,
      installationId: 'installation-1',
      longPollMs: 1_000,
    });
    queue.claim(POLL);
    const pending = queue.poll(POLL);
    await Promise.resolve();

    queue.claim({ ...POLL, gatewayInstanceId: 'gateway-2', mcpTransportToken: 'B'.repeat(43) });

    await expect(pending).rejects.toThrow('gateway_session_mismatch');
    expect(queue.isLiveSession('gateway-2')).toBe(true);
  });
});

function mcpRuntime() {
  return {
    registerProcess: vi.fn(() => false),
    activateTurn: vi.fn(() => ({ executionId: 'execution-1' })),
    deactivateTurn: vi.fn(),
    disconnect: vi.fn(),
  };
}
