import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gatewayInstructionProfile } from '../profile/agent-profile.catalog';
import { startCodexAppServer } from './codex-app-server-process';

const RUN_REAL_CODEX_CANARY = process.env.KIDITEM_RUN_REAL_CODEX_CANARY === '1';

/**
 * Opt-in only: uses the host's existing Codex login without reading or logging
 * credentials. It creates one provider thread, requests a harmless bounded
 * response, reads provider history, archives the thread, and exits.
 */
describe('Codex app-server real provider readiness', () => {
  it.skipIf(!RUN_REAL_CODEX_CANARY)('creates, resumes, reads, and archives one temporary provider-native conversation', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'kiditem-gateway-codex-canary-'));
    const runtimeRoot = resolve(import.meta.dirname, '../../../..');
    const process = await startCodexAppServer({
      runtimeRoot,
      workspace,
      loginRoot: homedir(),
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
    });
    let providerConversationRef: string | null = null;
    try {
      const capability = (await process.session.modelCatalog())[0];
      if (!capability) throw new Error('codex_canary_model_catalog_empty');
      const effort = capability.reasoningEfforts[0];
      if (!effort) throw new Error('codex_canary_effort_catalog_empty');
      const conversation = await process.session.createConversation({
        title: 'KidItem temporary Gateway readiness canary',
        instructionProfile: gatewayInstructionProfile(null),
      });
      providerConversationRef = conversation.providerConversationRef;
      const terminal = deferredTerminal();
      await process.session.startTurn({
        providerConversationRef,
        turnId: 'gateway-canary-turn',
        message: 'Reply with exactly READY. Do not call any tools.',
        model: capability.model,
        reasoningEffort: effort,
        executionBinding: 'A'.repeat(43),
        instructionProfile: gatewayInstructionProfile(null),
      }, (event) => {
        if (event.kind === 'status' && event.status !== 'started') terminal.resolve(event.status);
      });
      await expect(Promise.race([terminal.promise, timeout(45_000)])).resolves.toBe('completed');
      const history = await process.session.history(providerConversationRef);
      expect(history.length).toBeGreaterThan(0);
      await process.session.archive(providerConversationRef);
      providerConversationRef = null;
    } finally {
      if (providerConversationRef) {
        try { await process.session.archive(providerConversationRef); } catch { /* provider process may already be unavailable */ }
      }
      process.close();
      await rm(workspace, { recursive: true, force: true });
    }
  }, 60_000);
});

function deferredTerminal(): Readonly<{ promise: Promise<'completed' | 'failed' | 'interrupted' | 'disconnected'>; resolve: (value: 'completed' | 'failed' | 'interrupted' | 'disconnected') => void }> {
  let resolve!: (value: 'completed' | 'failed' | 'interrupted' | 'disconnected') => void;
  return Object.freeze({
    promise: new Promise<'completed' | 'failed' | 'interrupted' | 'disconnected'>((next) => { resolve = next; }),
    resolve,
  });
}

function timeout(milliseconds: number): Promise<'disconnected'> {
  return new Promise((resolveTimeout) => setTimeout(() => resolveTimeout('disconnected'), milliseconds));
}
