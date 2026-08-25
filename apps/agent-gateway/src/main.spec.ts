import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-gateway-train-'));
  roots.push(root);
  await mkdir(join(root, 'node_modules/@openai/codex'), { recursive: true });
  await mkdir(join(root, 'node_modules/@anthropic-ai/claude-code'), { recursive: true });
  await writeFile(join(root, 'node_modules/@openai/codex/package.json'), JSON.stringify({ version: '0.149.1' }));
  await writeFile(join(root, 'node_modules/@anthropic-ai/claude-code/package.json'), JSON.stringify({ version: '2.1.245' }));
  return root;
}
