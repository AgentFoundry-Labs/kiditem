import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
  attemptRuntimeVersion,
  type AttemptRuntimeType,
} from '@kiditem/shared/agent-runtime';
import { AgentAttemptReadinessCanary } from './agent-attempt-readiness-canary';
import { CodexAttemptIsolationCanary } from './codex-attempt-isolation-canary';

const execFileAsync = promisify(execFile);

/** Focused local admission/readiness probe; it neither reads nor stores CLI credentials. */
export class AgentAttemptReadinessService {
  /** Process-wide cache: API admission and authenticated readiness probes share one canary. */
  private static readonly cache = new Map<string, Promise<void>>();

  /** One bounded probe per runtime/model/deploy identity; admissions share it. */
  async assertRuntime(runtime: AttemptRuntimeType, model = '', deployIdentity = process.env.KIDITEM_GIT_SHA?.trim() ?? ''): Promise<void> {
    const loginHome = await this.loginHome();
    const key = `${runtime}:${model}:${deployIdentity}:${loginHome}`;
    const existing = AgentAttemptReadinessService.cache.get(key);
    if (existing) return existing;
    const probe = this.probe(runtime, model, loginHome);
    AgentAttemptReadinessService.cache.set(key, probe);
    try { await probe; } catch (error) { AgentAttemptReadinessService.cache.delete(key); throw error; }
  }

  constructor(
    private readonly canary = new AgentAttemptReadinessCanary(),
    private readonly codexIsolation = new CodexAttemptIsolationCanary(),
  ) {}

  private async probe(runtime: AttemptRuntimeType, model: string, loginHome: string): Promise<void> {
    await this.assertPeerCredentialHelper();
    const binary = runtime === 'codex_cli' ? 'codex' : 'claude';
    const expected = attemptRuntimeVersion(runtime);
    const environment = runtimeEnvironment(runtime, loginHome);
    const { stdout, stderr } = await execFileAsync(binary, ['--version'], { timeout: 5_000, maxBuffer: 1_024, env: environment });
    if (!`${stdout}\n${stderr}`.includes(expected)) throw new Error(`attempt_runtime_version_mismatch:${runtime}`);
    const auth = runtime === 'codex_cli'
      ? await execFileAsync(binary, ['login', 'status'], { timeout: 5_000, maxBuffer: 4_096, env: environment })
      : await execFileAsync(binary, ['auth', 'status', '--json'], { timeout: 5_000, maxBuffer: 4_096, env: environment });
    if (!/logged.?in|"loggedIn"\s*:\s*true/i.test(`${auth.stdout}\n${auth.stderr}`)) {
      throw new Error(`attempt_runtime_not_logged_in:${runtime}`);
    }
    // Verify the provider exposes the non-persistent/strict-MCP boundary
    // before an Attempt is admitted. The real scoped model/MCP/second-input
    // probe is deliberately bounded to readiness tooling, never persisted.
    const help = await execFileAsync(binary, runtime === 'codex_cli' ? ['app-server', '--help'] : ['--help'], { timeout: 5_000, maxBuffer: 32 * 1_024, env: environment });
    const usage = `${help.stdout}\n${help.stderr}`;
    const required = runtime === 'codex_cli'
      ? ['app-server', '--strict-config']
      : ['--no-session-persistence', '--strict-mcp-config', '--setting-sources'];
    if (required.some((flag) => !usage.includes(flag))) throw new Error(`attempt_runtime_nonpersistent_contract_missing:${runtime}`);
    if (model && model.length > 256) throw new Error('attempt_runtime_model_invalid');
    if (runtime === 'codex_cli') await this.codexIsolation.run({ loginHome });
    await this.canary.run({ runtime, model, loginHome });
  }

  private async assertPeerCredentialHelper(): Promise<void> {
    const python = process.env.PYTHON_BIN?.trim() || 'python3';
    try {
      await execFileAsync(python, ['-c', 'import socket'], { timeout: 2_000, maxBuffer: 256 });
    } catch {
      throw new Error('attempt_peer_credential_helper_unavailable');
    }
  }

  private async loginHome(): Promise<string> {
    const configured = process.env.KIDITEM_ATTEMPT_LOGIN_HOME?.trim();
    if (!configured) throw new Error('missing_attempt_login_home');
    return realpath(configured).catch(() => { throw new Error('attempt_login_home_invalid'); });
  }
}

function runtimeEnvironment(runtime: AttemptRuntimeType, loginHome: string): NodeJS.ProcessEnv {
  return runtime === 'codex_cli'
    ? { PATH: process.env.PATH ?? '', HOME: loginHome, CODEX_HOME: `${loginHome}/.codex` }
    : { PATH: process.env.PATH ?? '', HOME: loginHome, CLAUDE_CONFIG_DIR: `${loginHome}/.claude` };
}
