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

  it('starts from a cleared environment and races provider exit against Runner control EOF', async () => {
    const source = await readFile(resolve(__dirname, '../../../windows/KidItem.JobRunner/Program.cs'), 'utf8');
    expect(source).toContain('info.Environment.Clear();');
    expect(source).toContain('Task.WhenAny(stdinForward, providerExit)');
    expect(source).toContain('if (completed == providerExit)');
    expect(source).toContain('stdinCancellation.Cancel();');
    expect(source).toContain('job.Dispose();');
    expect(source).toContain('await providerExit;');
    expect(source.indexOf('job.Dispose();')).toBeLessThan(source.indexOf('await providerExit;'));
    const normalExitBranch = source.slice(source.indexOf('if (completed == providerExit)'), source.indexOf('else', source.indexOf('if (completed == providerExit)')));
    expect(normalExitBranch.indexOf('job.Dispose();')).toBeGreaterThan(-1);
    expect(normalExitBranch.indexOf('job.Dispose();')).toBeLessThan(source.indexOf('await Task.WhenAll(stdout, stderr)'));
  });

  it.skipIf(process.platform !== 'win32')('launches only through the bundled local helper', () => {
    expect(new WindowsJobSupervisor({ helperPath: 'C:\\KidItem\\KidItem.JobRunner.exe' })).toBeDefined();
  });
});
