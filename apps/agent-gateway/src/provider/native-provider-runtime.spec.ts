import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('NativeProviderRuntime locality', () => {
  it('keeps concrete provider runtime assembly behind one deep runtime Module', async () => {
    const main = await source('../main.ts');
    const providerImports = [...main.matchAll(/from ['"](\.\/provider\/[^'"]+)['"]/g)].map((match) => match[1]);

    expect(providerImports).toEqual(['./provider/native-provider-runtime']);
    expect(main).not.toMatch(/\.\/provider\/(?:claude|codex)(?:\/|['"])/);

    const runtime = await source('./native-provider-runtime.ts');
    const runtimeInterface = /export interface NativeProviderRuntime\s*\{([\s\S]*?)\n\}/.exec(runtime)?.[1] ?? '';
    expect(runtimeInterface).toContain('providers');
    expect(runtimeInterface).toContain('readiness');
    expect(runtimeInterface).toContain('close');
    expect(runtimeInterface).not.toMatch(/\b(?:start|verify|login|supervisor|mcpConfig)\b/i);
    expect(runtime).toContain('verifyGatewayRuntimePackages');
    expect(runtime).toContain('verifyProviderLogin');
    expect(runtime).toContain('startCodexAppServer');
    expect(runtime).toContain('ClaudeConversationProvider');
    expect(runtime).toContain('GatewayReadinessSchema');
  });

  it('keeps the exact active-turn registry internal to the control Module', async () => {
    const dispatcher = await source('../control/gateway-command-dispatcher.ts');

    expect(dispatcher).toContain("from './internal/active-turn.registry'");
    expect(dispatcher).not.toContain("from '../turn/active-turn.registry'");
    await expect(access(new URL('../control/internal/active-turn.registry.ts', import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL('../control/internal/active-turn.registry.spec.ts', import.meta.url))).resolves.toBeUndefined();
  });
});

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

describe('Gateway runtime train verification', () => {
  it('accepts only the exact packaged Codex and Claude train versions with no runtime install or lookup', async () => {
    const { verifyGatewayRuntimePackages } = await import('./native-provider-runtime');
    const root = await fixture();
    await expect(verifyGatewayRuntimePackages(root)).resolves.toEqual({ codex_cli: '0.149.1', claude_cli: '2.1.245' });
    await writeFile(join(root, 'node_modules/@openai/codex/package.json'), JSON.stringify({ version: 'latest' }));
    await expect(verifyGatewayRuntimePackages(root)).rejects.toThrow('gateway_provider_version_invalid');
  });

  it('publishes only exact Claude efforts and the app-server supplied Codex model/effort pairs', async () => {
    const { claudeProviderReadiness, codexProviderReadiness } = await import('./native-provider-runtime');

    expect(claudeProviderReadiness()).toMatchObject({
      runtime: 'claude_cli',
      reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      modelReasoningEfforts: [
        { model: 'claude-opus-4-6', reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
        { model: 'claude-sonnet-4-5', reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      ],
    });
    expect(codexProviderReadiness([
      { model: 'gpt-5.6', reasoningEfforts: ['low', 'xhigh'] },
      { model: 'gpt-5.5', reasoningEfforts: ['medium'] },
    ])).toMatchObject({
      runtime: 'codex_cli',
      models: ['gpt-5.6', 'gpt-5.5'],
      reasoningEfforts: ['low', 'xhigh', 'medium'],
      modelReasoningEfforts: [
        { model: 'gpt-5.6', reasoningEfforts: ['low', 'xhigh'] },
        { model: 'gpt-5.5', reasoningEfforts: ['medium'] },
      ],
    });
    expect(() => codexProviderReadiness([])).toThrow('gateway_codex_model_catalog_invalid');
  });

  it('runs provider login checks through the supervisor and keeps raw child-process APIs out of runtime assembly', async () => {
    const { verifyProviderLogin } = await import('./native-provider-runtime') as unknown as {
      verifyProviderLogin: (runtime: 'codex_cli' | 'claude_cli', runtimeRoot: string, loginRoot: string, supervisor: LoginSupervisor) => Promise<boolean>;
    };
    const root = await fixture();
    const supervisor = new LoginSupervisor();

    await expect(verifyProviderLogin('codex_cli', root, root, supervisor)).resolves.toBe(true);
    expect(supervisor.launches).toEqual([expect.objectContaining({
      args: expect.arrayContaining(['login', 'status']),
      cwd: root,
    })]);
    expect(await source('./native-provider-runtime.ts')).not.toContain("node:child_process");
  });
});

class LoginSupervisor {
  readonly launches: unknown[] = [];

  async launch(command: unknown, callbacks: { onExit?: (exit: { code: number | null; signal: NodeJS.Signals | null }) => void }) {
    this.launches.push(command);
    queueMicrotask(() => callbacks.onExit?.({ code: 0, signal: null }));
    return {
      input: async () => undefined,
      terminate: async () => undefined,
      onExit: () => undefined,
    };
  }

  async shutdown() { return undefined; }
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-gateway-train-'));
  roots.push(root);
  await mkdir(join(root, 'node_modules/@openai/codex'), { recursive: true });
  await mkdir(join(root, 'node_modules/@anthropic-ai/claude-code'), { recursive: true });
  await writeFile(join(root, 'node_modules/@openai/codex/package.json'), JSON.stringify({ version: '0.149.1' }));
  await writeFile(join(root, 'node_modules/@anthropic-ai/claude-code/package.json'), JSON.stringify({ version: '2.1.245' }));
  await mkdir(join(root, 'node_modules/@openai/codex/bin'), { recursive: true });
  await writeFile(join(root, 'node_modules/@openai/codex/bin/codex.js'), '');
  return root;
}
