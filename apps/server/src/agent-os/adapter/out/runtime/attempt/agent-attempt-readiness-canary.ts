import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AttemptFilesystemService } from './attempt-filesystem.service';
import { buildCodexAttemptCommand, type AttemptRuntimeProfile } from './codex-attempt.adapter';
import { buildClaudeAttemptCommand } from './claude-attempt.adapter';
import { CodexAppServerSession } from './codex-app-server-session';
import { AgentResultEnvelopeSchema } from '@kiditem/shared/agent-interaction';

/**
 * Bounded, no-DB provider probe. A model must call one isolated MCP tool,
 * remain live for a second input, and return the nonce in a strict envelope.
 */
export class AgentAttemptReadinessCanary {
  constructor(
    private readonly files = new AttemptFilesystemService(),
    private readonly spawnProcess: typeof spawn = spawn,
    private readonly timeoutMs = 30_000,
  ) {}

  async run(input: { runtime: 'codex_cli' | 'claude_cli'; model: string; loginHome: string }): Promise<void> {
    const attemptId = randomUUID();
    const nonce = randomUUID();
    const paths = await this.files.create(attemptId);
    let child: ChildProcessWithoutNullStreams | undefined;
    let cleanupUnsafe = false;
    let completed = false;
    const failure = new ReadinessFailureSignal();
    let primaryFailure: unknown;
    try {
      await this.files.linkProviderAuth(paths, input.runtime, input.loginHome);
      const callFile = join(paths.root, 'canary-called');
      const releaseFile = join(paths.root, 'canary-release');
      await writeFile(paths.mcpConfigPath, JSON.stringify({
        mcpServers: {
          readiness_canary: {
            command: process.execPath,
            args: [`${process.cwd()}/dist/agent-os/adapter/in/mcp/readiness-canary-mcp-server.js`],
            env: { READINESS_CANARY_NONCE: nonce, READINESS_CANARY_CALL_FILE: callFile, READINESS_CANARY_RELEASE_FILE: releaseFile },
          },
        },
      }), { mode: 0o600 });
      const profile: AttemptRuntimeProfile = { model: input.model, loginHome: input.loginHome, home: paths.home, codexHome: paths.codexHome, claudeConfigDir: paths.claudeConfigDir };
      const canaryEnv = { READINESS_CANARY_NONCE: nonce, READINESS_CANARY_CALL_FILE: callFile, READINESS_CANARY_RELEASE_FILE: releaseFile };
      const executable = `${process.cwd()}/dist/agent-os/adapter/in/mcp/readiness-canary-mcp-server.js`;
      const command = input.runtime === 'codex_cli'
        ? buildCodexAttemptCommand({ workspace: paths.workspace, socketPath: paths.socketPath, mcpConfigPath: paths.mcpConfigPath, profile, mcpServerName: 'readiness_canary', mcpExecutable: executable, mcpEnv: canaryEnv })
        : buildClaudeAttemptCommand({ workspace: paths.workspace, socketPath: paths.socketPath, mcpConfigPath: paths.mcpConfigPath, profile, allowedTools: 'mcp__readiness_canary__readiness_probe', extraEnv: canaryEnv });
      child = this.spawnProcess(command.bin, command.args, { cwd: command.cwd, env: command.env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
      if (!child.pid) throw new Error('readiness_canary_spawn_failed');
      child.stderr.resume();
      child.once('error', (error) => failure.fail(error));
      child.once('exit', (code) => {
        if (!completed) failure.fail(new Error(code === 0 ? 'readiness_canary_child_exit_early' : 'readiness_canary_child_exit'));
      });
      if (input.runtime === 'codex_cli') await this.runCodex(child, nonce, callFile, releaseFile, input.model, paths.workspace, failure);
      else await this.runClaude(child, nonce, callFile, releaseFile, failure);
      failure.throwIfFailed();
      completed = true;
    } catch (error) {
      primaryFailure = error;
      throw error;
    } finally {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        try {
          signalGroup(child.pid, 'SIGTERM');
          await waitForExit(child, 1_000);
          if (child.exitCode === null && child.signalCode === null) {
            signalGroup(child.pid, 'SIGKILL');
            await waitForExit(child, 1_000);
          }
        } catch {
          // The owned root cannot be removed while process ownership is uncertain.
          cleanupUnsafe = true;
        }
        cleanupUnsafe ||= child.exitCode === null && child.signalCode === null;
      }
      if (!cleanupUnsafe) await this.files.remove(paths);
      // Never obscure the diagnostic that caused a failed probe with cleanup noise.
      if (cleanupUnsafe && !primaryFailure) throw new Error('readiness_canary_process_cleanup_failed');
    }
  }

  private async runCodex(child: ChildProcessWithoutNullStreams, nonce: string, callFile: string, releaseFile: string, model: string, cwd: string, failure: ReadinessFailureSignal): Promise<void> {
    let completed: unknown;
    const session = new CodexAppServerSession((line) => child.stdin.write(line), 64 * 1024, (method, params) => { if (method === 'turn/completed') completed = params; });
    child.stdout.on('data', (chunk) => { try { session.receive(String(chunk)); } catch (error) { failure.fail(error instanceof Error ? error : new Error('readiness_canary_stream_invalid')); } });
    await failure.race(withTimeout(session.start({ model, cwd, prompt: prompt(nonce) }), this.timeoutMs));
    await failure.race(waitFor(callFile, nonce, this.timeoutMs));
    await failure.race(withTimeout(session.steer(`The readiness probe was observed. Release it and return the strict result with nonce ${nonce}.`), this.timeoutMs));
    await writeFile(releaseFile, nonce, { mode: 0o600 });
    await failure.race(waitUntil(() => completed, this.timeoutMs));
    const items = ((completed as { turn?: { items?: unknown[] } } | null)?.turn?.items ?? []);
    const text = [...items].reverse().find((item) => (item as { type?: unknown }).type === 'agentMessage') as { text?: unknown } | undefined;
    const result = AgentResultEnvelopeSchema.safeParse(typeof text?.text === 'string' ? JSON.parse(text.text) : null);
    if (!result.success || result.data.summary !== `readiness:${nonce}`) throw new Error('readiness_canary_nonce_missing');
  }

  private async runClaude(child: ChildProcessWithoutNullStreams, nonce: string, callFile: string, releaseFile: string, failure: ReadinessFailureSignal): Promise<void> {
    let result: unknown;
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        try {
          const message = JSON.parse(line) as { type?: unknown; structured_output?: unknown };
          if (!message || typeof message !== 'object') throw new Error('readiness_canary_protocol_invalid');
          if (message.type === 'error') failure.fail(new Error('readiness_canary_provider_error'));
          if (message.type === 'result') result = message.structured_output;
        } catch (error) {
          failure.fail(error instanceof Error && error.message === 'readiness_canary_protocol_invalid'
            ? error
            : new Error('readiness_canary_protocol_invalid'));
        }
      }
      if (Buffer.byteLength(buffer, 'utf8') > 64 * 1024) failure.fail(new Error('readiness_canary_stream_too_large'));
    });
    child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: prompt(nonce) } })}\n`);
    await failure.race(waitFor(callFile, nonce, this.timeoutMs));
    child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: `Release the probe and return nonce ${nonce}.` } })}\n`);
    await writeFile(releaseFile, nonce, { mode: 0o600 });
    await failure.race(waitUntil(() => result, this.timeoutMs));
    const parsed = AgentResultEnvelopeSchema.safeParse(result);
    if (!parsed.success || parsed.data.summary !== `readiness:${nonce}`) throw new Error('readiness_canary_nonce_missing');
  }
}

/** Resolves with failure rather than rejecting so late process exits are never unhandled. */
class ReadinessFailureSignal {
  private failed: Error | undefined;
  private readonly value: Promise<Error>;
  private resolve!: (error: Error) => void;

  constructor() {
    this.value = new Promise<Error>((resolve) => { this.resolve = resolve; });
  }

  fail(error: Error): void {
    if (this.failed) return;
    this.failed = error;
    this.resolve(error);
  }

  async race<T>(work: Promise<T>): Promise<T> {
    return Promise.race([work, this.value.then((error) => Promise.reject(error))]);
  }

  throwIfFailed(): void {
    if (this.failed) throw this.failed;
  }
}

function prompt(nonce: string): string { return `Call readiness_canary.readiness_probe with nonce ${nonce}. Wait for the second input. Then return the strict result envelope with exact summary readiness:${nonce}.`; }
async function waitFor(path: string, expected: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { try { if ((await readFile(path, 'utf8')).trim() === expected) return; } catch { /* not created yet */ } await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error('readiness_canary_timeout');
}
async function waitUntil(predicate: () => unknown, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('readiness_canary_timeout');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
async function withTimeout<T>(value: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([value, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('readiness_canary_timeout')), timeoutMs); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => { const timer = setTimeout(resolve, timeoutMs); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
}
function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try { process.kill(-pid, signal); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}
