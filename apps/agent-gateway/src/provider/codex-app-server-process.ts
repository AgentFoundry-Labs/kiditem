import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
import { providerEnvironment, gatewayProviderInvocation } from './provider-command';
import { CodexAppServerSession } from './codex-app-server-session';

/** Starts the pinned Codex app-server and binds its lifetime to one Gateway session. */
export async function startCodexAppServer(input: Readonly<{
  runtimeRoot: string;
  workspace: string;
  loginRoot: string;
  mcpUrl: string;
}>): Promise<Readonly<{ session: CodexAppServerSession; close: () => void }>> {
  const invocation = gatewayProviderInvocation(input.runtimeRoot, 'codex');
  let child: ChildProcessWithoutNullStreams;
  let session!: CodexAppServerSession;
  try {
    child = spawn(invocation.executable, [...invocation.argsPrefix, 'app-server'], {
      cwd: input.workspace,
      env: providerEnvironment({
        home: input.loginRoot,
        providerHome: { key: 'CODEX_HOME', path: join(input.loginRoot, '.codex') },
        ...(process.platform === 'darwin' ? { includeMacosUserIdentity: true } : {}),
      }),
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('codex_app_server_spawn_failed');
  }
  session = new CodexAppServerSession({
    write: (line) => new Promise<void>((resolve, reject) => {
      try { child.stdin.write(line, 'utf8', (error) => error ? reject(error) : resolve()); }
      catch (error) { reject(error); }
    }),
    workspace: input.workspace,
    mcpUrl: input.mcpUrl,
  });
  child.stdout.on('data', (chunk: Buffer) => {
    try { session.receive(chunk.toString('utf8')); }
    catch { session.close(); try { child.kill('SIGTERM'); } catch { /* already closed */ } }
  });
  child.once('error', () => session.close());
  child.once('close', () => session.close());
  return Object.freeze({
    session,
    close: () => {
      session.close();
      try { child.kill('SIGTERM'); } catch { /* already closed */ }
    },
  });
}
