import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { claudeStatusLoggedIn, verifyRunnerReadiness, verifyRunnerRuntimeReadiness } from './main';
import { buildClaudeMacosAuthStatusCommand } from './provider/claude-command';

const roots: string[] = [];
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('verifyRunnerReadiness', () => {
  it('reports only the supported platform mapping and both exact train facts after auth-reference checks', async () => {
    const root = await fixture();
    vi.stubEnv('USER', 'runner-login');
    await expect(verifyRunnerReadiness({ runtimeRoot: root, loginRoot: root, platform: 'macos' })).resolves.toEqual({
      codex_cli: { version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true },
      claude_cli: { version: '2.1.241', loginVerified: true, nonPersistentSettingsVerified: true },
    });
  });

  it('fails closed on a non-pinned provider package', async () => {
    const root = await fixture();
    vi.stubEnv('USER', 'runner-login');
    await writeFile(join(root, 'node_modules/@openai/codex/package.json'), JSON.stringify({ version: '0.0.0' }));
    await expect(verifyRunnerReadiness({ runtimeRoot: root, loginRoot: root, platform: 'macos' })).rejects.toThrow('runner_provider_version_invalid');
  });

  it('does not require a macOS Claude credential file because the native CLI uses OS credential storage', async () => {
    const root = await fixture();
    await rm(join(root, '.claude/.credentials.json'));
    vi.stubEnv('USER', 'runner-login');

    await expect(verifyRunnerReadiness({ runtimeRoot: root, loginRoot: root, platform: 'macos' })).resolves.toMatchObject({
      claude_cli: { loginVerified: true },
    });
  });

  it('uses a boolean-only local Claude auth-status process with the execution Keychain environment', async () => {
    const root = await fixture({ claudeAuthStatus: 'verify-environment' });
    vi.stubEnv('USER', 'runner-login');

    await expect(verifyRunnerReadiness({ runtimeRoot: root, loginRoot: root, platform: 'macos' })).resolves.toMatchObject({
      claude_cli: { loginVerified: true },
    });
  });

  it('fails closed when the local macOS Claude auth-status probe is not logged in or USER is missing', async () => {
    const unauthenticated = await fixture({ claudeAuthStatus: 'logged-out' });
    vi.stubEnv('USER', 'runner-login');
    await expect(verifyRunnerReadiness({ runtimeRoot: unauthenticated, loginRoot: unauthenticated, platform: 'macos' }))
      .rejects.toThrow('runner_claude_login_unverified');

    const root = await fixture({ claudeAuthStatus: 'verify-environment' });
    vi.stubEnv('USER', '');
    await expect(verifyRunnerReadiness({ runtimeRoot: root, loginRoot: root, platform: 'macos' }))
      .rejects.toThrow('provider_user_identity_required');
  });

  it('validates a selected Codex runtime without constructing or spawning Claude readiness', async () => {
    const root = await fixture({ claudeAuthStatus: 'logged-out' });
    vi.stubEnv('USER', 'runner-login');

    await expect(verifyRunnerRuntimeReadiness({
      runtimeRoot: root, loginRoot: root, platform: 'macos', runtime: 'codex_cli',
    })).resolves.toEqual({ version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true });
  });

  it('bounds a SIGTERM-ignoring local auth-status process and returns only false', async () => {
    const root = await fixture({ claudeAuthStatus: 'ignores-term' });
    vi.stubEnv('USER', 'runner-login');

    await expect(claudeStatusLoggedIn(buildClaudeMacosAuthStatusCommand(root, root), 10)).resolves.toBe(false);
  });
});

async function fixture(options: Readonly<{ claudeAuthStatus?: 'verify-environment' | 'logged-out' | 'ignores-term' }> = {}): Promise<string> {
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
  await writeFile(
    join(root, 'node_modules/@anthropic-ai/claude-code/cli.js'),
    claudeStatusFixture(options.claudeAuthStatus ?? 'logged-in', root),
  );
  return root;
}

function claudeStatusFixture(status: 'verify-environment' | 'logged-out' | 'logged-in' | 'ignores-term', expectedLoginRoot: string): string {
  if (status === 'logged-out') return "process.stdout.write(JSON.stringify({ loggedIn: false })); process.exitCode = 1;";
  if (status === 'logged-in') return "process.stdout.write(JSON.stringify({ loggedIn: true }));";
  if (status === 'ignores-term') return "process.on('SIGTERM', () => undefined); setInterval(() => undefined, 1_000);";
  return [
    "const args = process.argv.slice(2).join(' ');",
    `const expectedHome = ${JSON.stringify(expectedLoginRoot)};`,
    "const loggedIn = args === 'auth status --json' && process.env.HOME === expectedHome && process.env.USER === 'runner-login' && !process.env.CLAUDE_CONFIG_DIR && !process.env.KIDITEM_ATTEMPT_MCP_TOKEN;",
    'process.stdout.write(JSON.stringify({ loggedIn }));',
    'process.exitCode = loggedIn ? 0 : 1;',
  ].join('\n');
}
