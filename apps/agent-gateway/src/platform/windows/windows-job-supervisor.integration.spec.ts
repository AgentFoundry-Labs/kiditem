import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GATEWAY_RUNTIME_TRAIN } from '@kiditem/shared/agent-runtime';
import {
  gatewayProviderInvocation,
  providerEnvironment,
  type GatewayProviderCommand,
} from '../../provider/provider-command';
import { WindowsJobSupervisor } from './windows-job-supervisor';

describe('WindowsJobSupervisor', () => {
  it('documents a no-listener Job Object helper with kill-on-close before provider input', async () => {
    const source = await readFile(resolve(__dirname, '../../../windows/KidItem.JobRunner/Program.cs'), 'utf8');
    expect(source).toContain('JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE');
    expect(source).toContain('AssignProcessToJobObject');
    expect(source).not.toMatch(/TcpListener|HttpListener|Socket\(/);
  });

  it('creates provider processes suspended, assigns the kill-on-close Job before resume, and terminates on admission failure', async () => {
    const source = await readFile(resolve(__dirname, '../../../windows/KidItem.JobRunner/Program.cs'), 'utf8');
    expect(source).toContain('CREATE_SUSPENDED');
    expect(source).toContain('CreateProcessW');
    expect(source).toContain('AssignProcessToJobObject');
    expect(source).toContain('ResumeThread');
    expect(source.indexOf('CreateProcessW')).toBeLessThan(source.indexOf('AssignProcessToJobObject'));
    expect(source.indexOf('AssignProcessToJobObject')).toBeLessThan(source.indexOf('ResumeThread'));
    expect(source).toContain('TerminateProcess');
    expect(source).toContain('WaitForSingleObject');
    expect(source).toContain('KIDITEM_JOB_RUNNER_TEST_FORCE_ASSIGN_FAILURE');
    expect(source).toContain('void CloseJobOnce()');
    const main = source.slice(source.indexOf('public static async Task<int> Main'), source.indexOf('private static NativeProviderProcess'));
    expect(main.match(/job\.Dispose\(\);/g)).toHaveLength(1);
    expect(source).not.toContain('ProcessStartInfo');
  });

  it('builds an explicit structured environment and races provider exit against Runner control EOF', async () => {
    const source = await readFile(resolve(__dirname, '../../../windows/KidItem.JobRunner/Program.cs'), 'utf8');
    expect(source).toContain('BuildEnvironmentBlock');
    expect(source).toContain('CREATE_UNICODE_ENVIRONMENT');
    expect(source).toContain('QuoteWindowsArgument');
    expect(source).toContain('Task.WhenAny(stdinForward, providerExit)');
    expect(source).toContain('if (completed == providerExit)');
    expect(source).toContain('stdinCancellation.Cancel();');
    expect(source).toContain('job.Dispose();');
    expect(source).toContain('await providerExit;');
    expect(source.indexOf('CloseJobOnce();')).toBeLessThan(source.indexOf('await providerExit;'));
    const normalExitBranch = source.slice(source.indexOf('if (completed == providerExit)'), source.indexOf('else', source.indexOf('if (completed == providerExit)')));
    expect(normalExitBranch.indexOf('CloseJobOnce();')).toBeGreaterThan(-1);
    expect(normalExitBranch.indexOf('CloseJobOnce();')).toBeLessThan(source.indexOf('await Task.WhenAll(stdout, stderr)'));
  });

  it('rejects a JavaScript file as CreateProcessW applicationName so resolver regressions fail closed', async () => {
    const source = await readFile(resolve(__dirname, '../../../windows/KidItem.JobRunner/Program.cs'), 'utf8');

    expect(source).toContain('Path.GetExtension(launch.Executable).Equals(".js", StringComparison.OrdinalIgnoreCase)');
    expect(source).toContain('throw new LaunchAdmissionException("launch_js_entrypoint_invalid")');
  });

  it.skipIf(process.platform !== 'win32')('launches only through the bundled local helper', () => {
    expect(new WindowsJobSupervisor({ helperPath: 'C:\\KidItem\\KidItem.JobRunner.exe' })).toBeDefined();
  });

  it.skipIf(process.platform !== 'win32')('runs the production-resolved bundled Codex and Claude version commands through CreateProcessW', async () => {
    const helperPath = process.env.KIDITEM_WINDOWS_JOB_RUNNER_PATH;
    expect(helperPath).toBeTruthy();
    expect(existsSync(helperPath!)).toBe(true);
    const runtimeRoot = resolve(__dirname, '../../..');

    for (const [provider, expectedVersion] of [
      ['codex', GATEWAY_RUNTIME_TRAIN.codexVersion],
      ['claude', GATEWAY_RUNTIME_TRAIN.claudeVersion],
    ] as const) {
      const command = gatewayProviderVersionCommand(runtimeRoot, provider);
      expect(command.executable.toLocaleLowerCase('en-US')).not.toMatch(/\.js$/);
      if (provider === 'codex') expect(command.args[0]).toMatch(/[\\/]codex\.js$/);

      const result = await runWithNativeJobHelper(helperPath!, command);
      expect(result.exit).toEqual({ code: 0, signal: null });
      expect(isExactBundledVersion(provider, result.stdout, expectedVersion)).toBe(true);
    }
  }, 30_000);

  it.skipIf(process.platform !== 'win32')('settles terminate after the native helper has already exited naturally', async () => {
    const helperPath = process.env.KIDITEM_WINDOWS_JOB_RUNNER_PATH;
    expect(helperPath).toBeTruthy();
    const supervisor = new WindowsJobSupervisor({ helperPath: helperPath! });
    const running = await supervisor.launch(gatewayProviderVersionCommand(resolve(__dirname, '../../..'), 'codex'));
    const exited = awaitExit(running);

    await exited;
    await expect(running.terminate()).resolves.toBeUndefined();
    await expect(supervisor.shutdown()).resolves.toBeUndefined();
  }, 30_000);

  it.skipIf(process.platform !== 'win32')('cleans an admission-time native helper exit out of shutdown state', async () => {
    const helperPath = process.env.KIDITEM_WINDOWS_JOB_RUNNER_PATH;
    expect(helperPath).toBeTruthy();
    const supervisor = new WindowsJobSupervisor({ helperPath: helperPath! });
    let resolveExit!: () => void;
    const exited = new Promise<void>((resolveExitValue) => { resolveExit = resolveExitValue; });
    const rejected = {
      ...gatewayProviderVersionCommand(resolve(__dirname, '../../..'), 'codex'),
      executable: 'C:\\KidItem\\invalid-provider.js',
      args: [],
    };

    await supervisor.launch(rejected, { onExit: () => resolveExit() }).catch(() => undefined);
    await exited;
    await expect(supervisor.shutdown()).resolves.toBeUndefined();
  }, 30_000);
});

function awaitExit(running: Awaited<ReturnType<WindowsJobSupervisor['launch']>>): Promise<void> {
  return new Promise((resolveExit) => { running.onExit(() => resolveExit()); });
}

function gatewayProviderVersionCommand(
  runtimeRoot: string,
  provider: 'codex' | 'claude',
): GatewayProviderCommand {
  const invocation = gatewayProviderInvocation(runtimeRoot, provider);
  return {
    executable: invocation.executable,
    args: [...invocation.argsPrefix, '--version'],
    cwd: runtimeRoot,
    env: providerEnvironment({ home: runtimeRoot }),
  };
}

async function runWithNativeJobHelper(helperPath: string, command: GatewayProviderCommand): Promise<{
  exit: { code: number | null; signal: NodeJS.Signals | null };
  stdout: string;
}> {
  let stdout = '';
  let resolveExit!: (exit: { code: number | null; signal: NodeJS.Signals | null }) => void;
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExitValue) => { resolveExit = resolveExitValue; });
  const supervisor = new WindowsJobSupervisor({ helperPath });
  await supervisor.launch(command, {
    onStdout: (value) => { stdout += value; },
    onExit: resolveExit,
  });
  return { exit: await exited, stdout };
}

function isExactBundledVersion(provider: 'codex' | 'claude', output: string, expectedVersion: string): boolean {
  const value = output.trim();
  const accepted = provider === 'codex'
    ? [expectedVersion, `codex ${expectedVersion}`, `codex-cli ${expectedVersion}`]
    : [expectedVersion, `claude ${expectedVersion}`, `${expectedVersion} (Claude Code)`, `Claude Code ${expectedVersion}`];
  return accepted.includes(value);
}
