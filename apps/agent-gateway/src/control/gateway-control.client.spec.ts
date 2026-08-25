import { describe, expect, it, vi } from 'vitest';

describe('GatewayControlClient', () => {
  it('uses only the installation bearer and the two bounded Gateway endpoints without a lease', async () => {
    const { GatewayControlClient } = await import('./gateway-control.client');
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new GatewayControlClient({
      controlOrigin: 'http://127.0.0.1:4000',
      token: 'A'.repeat(43),
      fetch: async (url, init) => {
        requests.push({ url: String(url), init: init! });
        return new Response(JSON.stringify(String(url).endsWith('/events') ? { eventSeq: 1, accepted: true } : { commands: [] }), { status: 200 });
      },
    });

    await expect(client.poll({
      kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos',
      runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
    })).resolves.toEqual({ commands: [] });
    await expect(client.postEventBody(JSON.stringify({ gatewayInstanceId: 'gateway-1', eventSeq: 1, events: [{ kind: 'command.ack', commandId: 'command-1' }] }))).resolves.toEqual({ eventSeq: 1, accepted: true });

    expect(requests.map(({ url }) => url)).toEqual([
      'http://127.0.0.1:4000/internal/agent-runtime/gateway/commands:poll',
      'http://127.0.0.1:4000/internal/agent-runtime/gateway/events',
    ]);
    expect(requests.every(({ init }) => (init.headers as Record<string, string>).authorization === `Bearer ${'A'.repeat(43)}`)).toBe(true);
    expect(requests.map(({ init }) => JSON.parse(String(init.body))).every((body) => !('leaseId' in body))).toBe(true);
  });

  it('rejects an oversized HTTP response before JSON schema parsing', async () => {
    const { GatewayControlClient } = await import('./gateway-control.client');
    const client = new GatewayControlClient({
      controlOrigin: 'http://127.0.0.1:4000',
      token: 'A'.repeat(43),
      fetch: async () => new Response(`${JSON.stringify({ commands: [] })}${' '.repeat(65_536)}`, { status: 200 }),
    });

    await expect(client.poll({
      kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos',
      runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
    })).rejects.toThrow('gateway_control_response_too_large');
  });

  it('waits past Nest\'s 25-second long poll before aborting, while retaining a shorter bounded event deadline', async () => {
    vi.useFakeTimers();
    try {
      const { GatewayControlClient } = await import('./gateway-control.client');
      let pollSignal: AbortSignal | undefined;
      const client = new GatewayControlClient({
        controlOrigin: 'http://127.0.0.1:4000', token: 'A'.repeat(43),
        fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
          pollSignal = init?.signal ?? undefined;
          pollSignal?.addEventListener('abort', () => reject(pollSignal?.reason), { once: true });
        }),
      });
      const pending = client.poll({
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos',
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      });
      const rejection = expect(pending).rejects.toThrow('gateway_control_request_timeout');
      await vi.advanceTimersByTimeAsync(25_000);
      expect(pollSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(5_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
