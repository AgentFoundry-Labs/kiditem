import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('Gateway runtime train verification', () => {
  it('accepts only the exact packaged Codex and Claude train versions with no runtime install or lookup', async () => {
    const { verifyGatewayRuntimePackages } = await import('./main');
    const root = await fixture();
    await expect(verifyGatewayRuntimePackages(root)).resolves.toEqual({ codex_cli: '0.149.1', claude_cli: '2.1.245' });
    await writeFile(join(root, 'node_modules/@openai/codex/package.json'), JSON.stringify({ version: 'latest' }));
    await expect(verifyGatewayRuntimePackages(root)).rejects.toThrow('gateway_provider_version_invalid');
  });

  it('publishes only exact Claude efforts and the app-server supplied Codex model/effort pairs', async () => {
    const { claudeProviderReadiness, codexProviderReadiness } = await import('./main');

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

  it('runs provider login checks through the supervisor and keeps raw child-process APIs out of production main', async () => {
    const { verifyProviderLogin } = await import('./main') as unknown as {
      verifyProviderLogin: (runtime: 'codex_cli' | 'claude_cli', runtimeRoot: string, loginRoot: string, supervisor: LoginSupervisor) => Promise<boolean>;
    };
    const root = await fixture();
    const supervisor = new LoginSupervisor();

    await expect(verifyProviderLogin('codex_cli', root, root, supervisor)).resolves.toBe(true);
    expect(supervisor.launches).toEqual([expect.objectContaining({
      args: expect.arrayContaining(['login', 'status']),
      cwd: root,
    })]);
    expect(await readFile(new URL('./main.ts', import.meta.url), 'utf8')).not.toContain("node:child_process");
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
