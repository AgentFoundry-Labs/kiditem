import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const EXPECTED_VERSIONS = {
  codex_cli: '0.149.0',
  claude_cli: '2.1.122',
} as const;

/** Focused local admission/readiness probe; it neither reads nor stores CLI credentials. */
export class AgentAttemptReadinessService {
  async assertRuntime(runtime: keyof typeof EXPECTED_VERSIONS): Promise<void> {
    await this.assertPeerCredentialHelper();
    const binary = runtime === 'codex_cli' ? 'codex' : 'claude';
    const expected = EXPECTED_VERSIONS[runtime];
    const { stdout, stderr } = await execFileAsync(binary, ['--version'], { timeout: 5_000, maxBuffer: 1_024 });
    if (!`${stdout}\n${stderr}`.includes(expected)) throw new Error(`attempt_runtime_version_mismatch:${runtime}`);
    const auth = runtime === 'codex_cli'
      ? await execFileAsync(binary, ['login', 'status'], { timeout: 5_000, maxBuffer: 4_096 })
      : await execFileAsync(binary, ['auth', 'status', '--json'], { timeout: 5_000, maxBuffer: 4_096 });
    if (!/logged.?in|"loggedIn"\s*:\s*true/i.test(`${auth.stdout}\n${auth.stderr}`)) {
      throw new Error(`attempt_runtime_not_logged_in:${runtime}`);
    }
  }

  private async assertPeerCredentialHelper(): Promise<void> {
    const python = process.env.PYTHON_BIN?.trim() || 'python3';
    try {
      await execFileAsync(python, ['-c', 'import socket'], { timeout: 2_000, maxBuffer: 256 });
    } catch {
      throw new Error('attempt_peer_credential_helper_unavailable');
    }
  }
}
