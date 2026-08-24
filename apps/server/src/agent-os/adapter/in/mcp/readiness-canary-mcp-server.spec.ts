import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { pinnedModernClient, transportFor } from './__tests__/attempt-mcp-modern-fixture';
import { createReadinessCanaryMcpServer } from './readiness-canary-mcp-server';

describe('readiness canary MCP factory', () => {
  it('is Nest-owned, modern-only server logic that records only the expected nonce', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-readiness-canary-'));
    const nonce = '51e975ef-c0a7-4ab1-8007-47c0fd563505';
    const callFile = join(root, 'called');
    const releaseFile = join(root, 'release');
    await writeFile(releaseFile, nonce, { mode: 0o600 });
    const server = createReadinessCanaryMcpServer({ nonce, callFile, releaseFile, releaseTimeoutMs: 50 });
    const client = pinnedModernClient();

    try {
      await client.connect(transportFor(createMcpHandler(() => server)));
      await expect(client.callTool({ name: 'readiness_probe', arguments: { nonce: '0b2327bb-cd8b-4f4c-8fa5-142760734c30' } }))
        .resolves.toMatchObject({ isError: true });
      await expect(client.callTool({ name: 'readiness_probe', arguments: { nonce } }))
        .resolves.toMatchObject({ structuredContent: { nonce } });
      await expect(writeFile(callFile, nonce, { flag: 'wx' })).rejects.toMatchObject({ code: 'EEXIST' });
    } finally {
      await client.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
