import { randomUUID } from 'node:crypto';
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

export async function verifyRunnerReadiness(input: Readonly<{ runtimeRoot: string; loginRoot: string; platform: 'macos' | 'windows' }>): Promise<{
  codex_cli: { version: '0.149.1'; loginVerified: true; nonPersistentSettingsVerified: true };
  claude_cli: { version: '2.1.241'; loginVerified: true; nonPersistentSettingsVerified: true };
}> {
  if (Number(process.versions.node.split('.')[0]) !== ATTEMPT_RUNTIME_TRAIN.nodeMajor) throw new Error('runner_node_version_invalid');
  const auth = new ProviderAuthReferenceService({ loginRoot: input.loginRoot, platform: input.platform });
  await Promise.all([auth.resolve('codex_cli'), auth.resolve('claude_cli')]);
  await Promise.all([
    exactPackageVersion(input.runtimeRoot, '@openai/codex', ATTEMPT_RUNTIME_TRAIN.codexVersion),
    exactPackageVersion(input.runtimeRoot, '@anthropic-ai/claude-code', ATTEMPT_RUNTIME_TRAIN.claudeVersion),
  ]);
  return {
    codex_cli: { version: ATTEMPT_RUNTIME_TRAIN.codexVersion, loginVerified: true, nonPersistentSettingsVerified: true },
    claude_cli: { version: ATTEMPT_RUNTIME_TRAIN.claudeVersion, loginVerified: true, nonPersistentSettingsVerified: true },
  };
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
