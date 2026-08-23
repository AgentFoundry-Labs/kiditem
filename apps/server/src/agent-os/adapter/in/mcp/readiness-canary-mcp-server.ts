import { access, writeFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';

const nonce = required('READINESS_CANARY_NONCE');
const callFile = required('READINESS_CANARY_CALL_FILE');
const releaseFile = required('READINESS_CANARY_RELEASE_FILE');

export async function runReadinessCanaryMcpServer(): Promise<void> {
  const server = new McpServer({ name: 'kiditem-readiness-canary', version: '1.0.0' });
  server.registerTool('readiness_probe', {
    description: 'Readiness-only scoped probe. Call once with the supplied nonce, then wait for release.',
    inputSchema: z.object({ nonce: z.string().uuid() }).strict(),
  }, async (input) => {
    if (input.nonce !== nonce) return { isError: true, content: [{ type: 'text' as const, text: 'nonce_mismatch' }] };
    await writeFile(callFile, nonce, { mode: 0o600, flag: 'wx' }).catch(() => undefined);
    await waitForRelease();
    return { content: [{ type: 'text' as const, text: JSON.stringify({ nonce }) }] };
  });
  await server.connect(new StdioServerTransport());
}

async function waitForRelease(): Promise<void> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try { await access(releaseFile); return; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error('readiness_canary_release_timeout');
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

if (require.main === module) {
  runReadinessCanaryMcpServer().catch((error) => {
    console.error(error instanceof Error ? error.message : 'readiness_canary_mcp_failed');
    process.exitCode = 1;
  });
}
