import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { ATTEMPT_RUNTIME_TRAIN, runnerPlatformFromNodePlatform, type AgentCliRuntime } from '@kiditem/shared/agent-runtime';
import { AttemptExecutor } from './attempt/attempt-executor';
import { AttemptWorkspaceService } from './attempt/attempt-workspace.service';
import { loadRunnerConfig, readInstallationToken } from './config/runner-config';
import { RunnerCommandDispatcher } from './control/runner-command-dispatcher';
import { RunnerControlClient, RunnerControlLoop } from './control/runner-control.client';
import { RunnerEventOutbox } from './control/runner-event-outbox';
import { MacosProcessSupervisor } from './platform/macos/macos-process-supervisor';
import { WindowsJobSupervisor } from './platform/windows/windows-job-supervisor';
import type { ProcessSupervisor } from './platform/process-supervisor';
import { ProviderAuthReferenceService } from './provider/provider-auth-reference';
import { buildClaudeMacosAuthStatusCommand } from './provider/claude-command';

export async function runNativeAgentRunner(argv: readonly string[]): Promise<never> {
  const config = await loadRunnerConfig(argv);
  const platform = runnerPlatformFromNodePlatform();
  const token = await readInstallationToken(config.tokenFile);
  const runtimes = await verifyRunnerReadiness({ runtimeRoot: config.runtimeRoot, loginRoot: config.loginRoot, platform });
  const runnerInstanceId = randomUUID();
  const client = new RunnerControlClient({ controlOrigin: config.controlOrigin, token });
  const lease = await client.hello({
    kind: 'hello', runnerInstanceId, platform, nodeMajor: ATTEMPT_RUNTIME_TRAIN.nodeMajor,
    controlRevision: ATTEMPT_RUNTIME_TRAIN.controlRevision, mcpProtocolRevision: ATTEMPT_RUNTIME_TRAIN.mcpProtocolRevision,
    cliContractIdentity: ATTEMPT_RUNTIME_TRAIN.cliContractIdentity, runtimes,
  });
  const outbox = new RunnerEventOutbox({ runnerInstanceId, leaseId: lease.leaseId });
  const supervisor = createSupervisor(platform, config.runtimeRoot);
  let dispatcher!: RunnerCommandDispatcher;
  let beginExit: (code: number) => void = () => undefined;
  const executor = new AttemptExecutor({
    runtimeRoot: config.runtimeRoot,
    workspaces: new AttemptWorkspaceService({
      attemptRoot: config.attemptRoot,
      attemptRootGuard: config.attemptRootGuard,
      loginRoot: config.loginRoot,
      platform,
    }),
    supervisor,
    emit: (event) => {
      if (event.kind === 'attempt.terminal') dispatcher.markTerminal(event.attemptId);
      outbox.enqueue(event);
    },
    onFatal: () => beginExit(1),
  });
  dispatcher = new RunnerCommandDispatcher({ executor, outbox });
  const flush = async () => outbox.flush((body) => client.postEventBody(body));
  const timer = setInterval(() => { void flush().catch(() => undefined); }, 250);
  let shutdownTask: Promise<void> | null = null;
  const shutdown = (): Promise<void> => {
    if (shutdownTask) return shutdownTask;
    shutdownTask = (async () => {
      clearInterval(timer);
      const results = await Promise.allSettled([dispatcher.shutdown(), executor.shutdown()]);
      const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
      if (errors.length) throw new AggregateError(errors, 'runner_shutdown_kill_all_failed');
    })();
    return shutdownTask;
  };
  let exiting = false;
  beginExit = (code: number): void => {
    if (exiting) return;
    exiting = true;
    void shutdown().then(
      () => process.exit(code),
      () => process.exit(1),
    );
  };
  const terminate = () => beginExit(0);
  process.once('SIGTERM', terminate); process.once('SIGINT', terminate);
  try {
    return await new RunnerControlLoop({ client }).run({
      runnerInstanceId, leaseId: lease.leaseId,
      onCommands: async (batch) => { for (const command of batch.commands) await dispatcher.dispatch(command); await flush(); },
      killAll: shutdown,
    });
  } finally {
    clearInterval(timer); process.off('SIGTERM', terminate); process.off('SIGINT', terminate);
    await shutdown();
  }
}

type RuntimeReadiness<T extends AgentCliRuntime> = Readonly<{
  version: T extends 'codex_cli' ? '0.149.1' : '2.1.241';
  loginVerified: true;
  nonPersistentSettingsVerified: true;
}>;

export async function verifyRunnerReadiness(input: Readonly<{ runtimeRoot: string; loginRoot: string; platform: 'macos' | 'windows' }>): Promise<{
  codex_cli: { version: '0.149.1'; loginVerified: true; nonPersistentSettingsVerified: true };
  claude_cli: { version: '2.1.241'; loginVerified: true; nonPersistentSettingsVerified: true };
}> {
  const [codex_cli, claude_cli] = await Promise.all([
    verifyRunnerRuntimeReadiness({ ...input, runtime: 'codex_cli' }),
    verifyRunnerRuntimeReadiness({ ...input, runtime: 'claude_cli' }),
  ]);
  return { codex_cli, claude_cli };
}

/** Verifies one explicitly selected runtime without touching the other provider. */
export async function verifyRunnerRuntimeReadiness<T extends AgentCliRuntime>(input: Readonly<{
  runtimeRoot: string;
  loginRoot: string;
  platform: 'macos' | 'windows';
  runtime: T;
}>): Promise<RuntimeReadiness<T>> {
  if (Number(process.versions.node.split('.')[0]) !== ATTEMPT_RUNTIME_TRAIN.nodeMajor) throw new Error('runner_node_version_invalid');
  const auth = new ProviderAuthReferenceService({ loginRoot: input.loginRoot, platform: input.platform });
  if (input.runtime === 'codex_cli') {
    await auth.resolve('codex_cli');
    await exactPackageVersion(input.runtimeRoot, '@openai/codex', ATTEMPT_RUNTIME_TRAIN.codexVersion);
    return { version: ATTEMPT_RUNTIME_TRAIN.codexVersion, loginVerified: true, nonPersistentSettingsVerified: true } as RuntimeReadiness<T>;
  }
  // Claude subscription login on macOS is bound to the same OS account's
  // Keychain; its isolated attempt never copies or links host config/auth files.
  if (input.platform === 'windows') await auth.resolve('claude_cli');
  await exactPackageVersion(input.runtimeRoot, '@anthropic-ai/claude-code', ATTEMPT_RUNTIME_TRAIN.claudeVersion);
  if (input.platform === 'macos') await verifyClaudeMacosLogin(input.runtimeRoot, input.loginRoot);
  return { version: ATTEMPT_RUNTIME_TRAIN.claudeVersion, loginVerified: true, nonPersistentSettingsVerified: true } as RuntimeReadiness<T>;
}

async function verifyClaudeMacosLogin(runtimeRoot: string, loginRoot: string): Promise<void> {
  const command = buildClaudeMacosAuthStatusCommand(runtimeRoot, loginRoot);
  if (!await claudeStatusLoggedIn(command)) throw new Error('runner_claude_login_unverified');
}

/** Parses only the boolean login signal and never logs or returns provider output. */
export async function claudeStatusLoggedIn(
  command: Readonly<{ executable: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv }>,
  timeoutMs = 10_000,
): Promise<boolean> {
  return new Promise((resolveStatus) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command.executable, command.args, { cwd: command.cwd, env: command.env, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolveStatus(false);
      return;
    }
    let output = '';
    let overflowed = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const onData = (chunk: Buffer | string): void => {
      if (overflowed) return;
      const value = chunk.toString();
      if (output.length + value.length > 16_384) {
        output = '';
        overflowed = true;
        return;
      }
      output += value;
    };
    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      child.stdout?.off('data', onData);
      child.off('error', onError);
      child.off('close', onClose);
    };
    const settle = (value: boolean): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveStatus(value);
    };
    const onError = (): void => settle(false);
    const onClose = (code: number | null): void => {
      if (code !== 0 || overflowed) return settle(false);
      try {
        const status = JSON.parse(output) as { loggedIn?: unknown };
        settle(status.loggedIn === true);
      } catch {
        settle(false);
      }
    };
    child.stdout?.on('data', onData);
    child.once('error', onError);
    // `close`, unlike `exit`, waits for stdout to close, so the bounded
    // boolean response cannot race the child process' termination.
    child.once('close', onClose);
    timer = setTimeout(() => {
      // A local CLI can ignore SIGTERM. This boolean-only probe must not leave
      // a child behind, so its bounded timeout closes it decisively with
      // SIGKILL. `settle` makes timeout/close/error race-safe.
      try { child.kill('SIGKILL'); } catch { /* process is already gone */ }
      settle(false);
    }, timeoutMs);
  });
}

function createSupervisor(platform: 'macos' | 'windows', runtimeRoot: string): ProcessSupervisor {
  if (platform === 'macos') return new MacosProcessSupervisor();
  return new WindowsJobSupervisor({ helperPath: join(runtimeRoot, 'windows', 'KidItem.JobRunner.exe') });
}

async function exactPackageVersion(runtimeRoot: string, packageName: string, expected: string): Promise<void> {
  const packagePath = resolve(runtimeRoot, 'node_modules', packageName, 'package.json');
  const rel = relative(resolve(runtimeRoot), packagePath);
  if (rel.startsWith('..') || rel.includes('/..') || rel.includes('\\..')) throw new Error('runner_package_path_invalid');
  let value: { version?: unknown };
  try { value = JSON.parse(await readFile(packagePath, 'utf8')) as { version?: unknown }; } catch { throw new Error('runner_provider_package_missing'); }
  if (value.version !== expected) throw new Error('runner_provider_version_invalid');
}

if (process.argv[1]?.endsWith('main.cjs')) {
  void runNativeAgentRunner(process.argv.slice(2)).catch(() => { process.exitCode = 1; });
}
