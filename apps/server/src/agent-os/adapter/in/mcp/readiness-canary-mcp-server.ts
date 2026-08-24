import { access, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { McpServer } from '@modelcontextprotocol/server';
import { z as z4 } from 'zod-v4';

export interface ReadinessCanaryMcpServerOptions {
  nonce: string;
  callFile: string;
  releaseFile: string;
  releaseTimeoutMs?: number;
}

/**
 * Nest owns transport admission; this factory owns only the authority-free
 * readiness tool used to prove a provider can finish one modern MCP exchange.
 */
export function createReadinessCanaryMcpServer(options: ReadinessCanaryMcpServerOptions): McpServer {
  const server = new McpServer({ name: 'kiditem-readiness-canary', version: '2.0.0' });
  server.registerTool('readiness_probe', {
    description: 'Readiness-only scoped probe. Call once with the supplied nonce, then wait for release.',
    inputSchema: z4.object({ nonce: z4.string().uuid() }).strict(),
    outputSchema: z4.object({ nonce: z4.string().uuid() }).strict(),
  }, async (input) => {
    if (input.nonce !== options.nonce) {
      return { isError: true, content: [{ type: 'text' as const, text: 'nonce_mismatch' }] };
    }
    await writeFile(options.callFile, options.nonce, { mode: 0o600, flag: 'wx' }).catch(() => undefined);
    await waitForRelease(options.releaseFile, options.releaseTimeoutMs ?? 25_000);
    const result = { nonce: options.nonce };
    return {
      structuredContent: result,
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  });
  return server;
}

async function waitForRelease(releaseFile: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(releaseFile);
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error('readiness_canary_release_timeout');
}
