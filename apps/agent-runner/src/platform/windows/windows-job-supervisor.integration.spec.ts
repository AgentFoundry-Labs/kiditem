import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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

  it.skipIf(process.platform !== 'win32')('launches only through the bundled local helper', () => {
    expect(new WindowsJobSupervisor({ helperPath: 'C:\\KidItem\\KidItem.JobRunner.exe' })).toBeDefined();
  });
});
