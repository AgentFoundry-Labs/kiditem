import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { AttemptFilesystemService } from './attempt-filesystem.service';

const execFileAsync = promisify(execFile);

type Execute = (
  command: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number; env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Exercises the exact pinned Codex permission profile before a service-account
 * Attempt is admitted.  The auth symlink exists so the app-server can log in,
 * but model-requested commands must not be able to follow it.
 */
export class CodexAttemptIsolationCanary {
  constructor(
    private readonly files = new AttemptFilesystemService(),
    private readonly execute: Execute = execFileAsync,
  ) {}

  async run(input: { loginHome: string }): Promise<void> {
    const paths = await this.files.create(randomUUID());
    try {
      await this.files.linkProviderAuth(paths, 'codex_cli', input.loginHome);
      const sourceSentinel = join(paths.root, 'server-source-sentinel');
      await writeFile(sourceSentinel, 'must-not-be-readable', { mode: 0o600 });

      await this.runSandbox(paths, `printf attempt-workspace-ok > ${shellQuote(join(paths.workspace, 'attempt-workspace-ok'))}`);
      await this.assertDenied(paths, `cat ${shellQuote(sourceSentinel)}`, 'server_source_readable');
      await this.assertDenied(paths, `cat ${shellQuote(join(paths.codexHome, 'auth.json'))}`, 'attempt_auth_readable');
      await this.assertDenied(
        paths,
        "node -e \"require('node:net').connect({host:'1.1.1.1',port:53}).once('connect',()=>process.exit(0)).once('error',()=>process.exit(1))\"",
        'attempt_network_available',
      );
    } finally {
      await this.files.remove(paths);
    }
  }

  private async assertDenied(
    paths: Awaited<ReturnType<AttemptFilesystemService['create']>>,
    command: string,
    code: string,
  ): Promise<void> {
    try {
      await this.runSandbox(paths, command);
    } catch {
      return;
    }
    throw new Error(code);
  }

  private runSandbox(
    paths: Awaited<ReturnType<AttemptFilesystemService['create']>>,
    command: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return this.execute(
      'codex',
      ['sandbox', '-P', 'kiditem_attempt', '--cd', paths.workspace, '--', 'sh', '-lc', command],
      {
        timeout: 5_000,
        maxBuffer: 16 * 1024,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: paths.home,
          CODEX_HOME: paths.codexHome,
        },
      },
    );
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
