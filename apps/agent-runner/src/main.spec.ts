import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyRunnerReadiness } from './main';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('verifyRunnerReadiness', () => {
  it('reports only the supported platform mapping and both exact train facts after auth-reference checks', async () => {
    const root = await fixture();
    await expect(verifyRunnerReadiness({ runtimeRoot: root, loginRoot: root, platform: 'macos' })).resolves.toEqual({
      codex_cli: { version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true },
      claude_cli: { version: '2.1.241', loginVerified: true, nonPersistentSettingsVerified: true },
    });
  });

  it('fails closed on a non-pinned provider package', async () => {
    const root = await fixture();
    await writeFile(join(root, 'node_modules/@openai/codex/package.json'), JSON.stringify({ version: '0.0.0' }));
    await expect(verifyRunnerReadiness({ runtimeRoot: root, loginRoot: root, platform: 'macos' })).rejects.toThrow('runner_provider_version_invalid');
  });
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-runner-readiness-')); roots.push(root);
  await Promise.all([
    mkdir(join(root, '.codex'), { recursive: true }), mkdir(join(root, '.claude'), { recursive: true }),
    mkdir(join(root, 'node_modules/@openai/codex'), { recursive: true }), mkdir(join(root, 'node_modules/@anthropic-ai/claude-code'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, '.codex/auth.json'), 'not-read'), writeFile(join(root, '.claude/.credentials.json'), 'not-read'),
    writeFile(join(root, 'node_modules/@openai/codex/package.json'), JSON.stringify({ version: '0.149.1' })),
    writeFile(join(root, 'node_modules/@anthropic-ai/claude-code/package.json'), JSON.stringify({ version: '2.1.241' })),
  ]);
  return root;
}
