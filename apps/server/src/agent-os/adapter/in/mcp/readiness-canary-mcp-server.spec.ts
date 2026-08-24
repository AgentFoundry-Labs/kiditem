import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import {
  pinned2025Client,
  pinnedModernClient,
  quietDefaultClient,
  transportFor,
} from './__tests__/attempt-mcp-modern-fixture';
import { createReadinessCanaryMcpServer } from './readiness-canary-mcp-server';
import { createRequestScopedReadinessMcpHandler } from '../http/runtime/attempt-mcp-http.controller';

describe('readiness canary MCP factory', () => {
  it('exposes exactly one authority-free tool and records only its expected in-memory nonce', async () => {
    const nonce = '51e975ef-c0a7-4ab1-8007-47c0fd563505';
    const onProbe = vi.fn();
    const server = createReadinessCanaryMcpServer({ nonce, onProbe });
    const client = pinnedModernClient();

    try {
      await client.connect(transportFor(createMcpHandler(() => server)));
      await expect(client.listTools()).resolves.toMatchObject({
        tools: [expect.objectContaining({ name: 'readiness_probe' })],
      });
      expect((await client.listTools()).tools).toHaveLength(1);
      await expect(client.callTool({ name: 'readiness_probe', arguments: { nonce: '0b2327bb-cd8b-4f4c-8fa5-142760734c30' } }))
        .resolves.toMatchObject({ isError: true });
      expect(onProbe).not.toHaveBeenCalled();
      await expect(client.callTool({ name: 'readiness_probe', arguments: { nonce } }))
        .resolves.toMatchObject({ structuredContent: { nonce } });
      expect(onProbe).toHaveBeenCalledTimes(1);
      expect(onProbe).toHaveBeenCalledWith({ nonce });
    } finally {
      await client.close();
    }
  });

  it('rejects explicit 2025 and quiet default negotiation before the scoped probe can run', async () => {
    const onProbe = vi.fn();
    const clients = [pinned2025Client(), quietDefaultClient()];

    try {
      for (const client of clients) {
        const handler = createRequestScopedReadinessMcpHandler({
          nonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505',
          onProbe,
        });
        await expect(client.connect(transportFor(handler))).rejects.toThrow();
        await handler.close();
      }
      expect(onProbe).not.toHaveBeenCalled();
    } finally {
      await Promise.all(clients.map((client) => client.close()));
    }
  });
});
