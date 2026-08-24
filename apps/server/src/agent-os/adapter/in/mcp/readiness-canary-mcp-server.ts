import { McpServer } from '@modelcontextprotocol/server';
import { z as z4 } from 'zod-v4';

export interface ReadinessCanaryMcpServerOptions {
  nonce: string;
  onProbe(input: { nonce: string }): void | Promise<void>;
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
    await options.onProbe({ nonce: options.nonce });
    const result = { nonce: options.nonce };
    return {
      structuredContent: result,
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  });
  return server;
}
