import { join } from 'node:path';
import type { ProcessExit, ProcessSupervisor, SupervisedProcess } from '../platform/process-supervisor';
import { providerEnvironment, gatewayProviderInvocation } from './provider-command';
import { CodexAppServerFramingError, CodexAppServerSession } from './codex-app-server-session';

/** Starts the pinned Codex app-server and binds its lifetime to one Gateway session. */
export async function startCodexAppServer(input: Readonly<{
  runtimeRoot: string;
  workspace: string;
  loginRoot: string;
  mcpUrl: string;
  supervisor: ProcessSupervisor;
}>): Promise<Readonly<{ session: CodexAppServerSession; close: () => Promise<void> }>> {
  const invocation = gatewayProviderInvocation(input.runtimeRoot, 'codex');
  let running: SupervisedProcess | null = null;
  let closing: Promise<void> | null = null;
  const session = new CodexAppServerSession({
    write: (line) => {
      if (!running) return Promise.reject(new Error('codex_app_server_not_started'));
      return running.input(line);
    },
    workspace: input.workspace,
    mcpUrl: input.mcpUrl,
  });
  const close = (): Promise<void> => {
    if (!closing) {
      closing = (async () => {
        if (!running) throw new Error('codex_app_server_not_started');
        await running.terminate();
        session.close();
      })();
    }
    return closing;
  };
  try {
    running = await input.supervisor.launch({
      executable: invocation.executable,
      args: [...invocation.argsPrefix, 'app-server'],
      cwd: input.workspace,
      env: providerEnvironment({
        home: input.loginRoot,
        providerHome: { key: 'CODEX_HOME', path: join(input.loginRoot, '.codex') },
        ...(process.platform === 'darwin' ? { includeMacosUserIdentity: true } : {}),
      }),
    }, {
      onStdout: (chunk) => {
        try { session.receive(chunk); }
        catch (error) {
          reportCodexAppServerSessionFault(error);
          session.close();
        }
      },
      // A supervisor emits exit only after it proves descendant-tree death.
      onExit: (exit) => {
        if (!closing) reportCodexAppServerNativeExit(exit);
        session.close();
      },
    });
  } catch {
    throw new Error('codex_app_server_spawn_failed');
  }
  return Object.freeze({
    session,
    close,
  });
}

function reportCodexAppServerSessionFault(error: unknown): void {
  if (error instanceof CodexAppServerFramingError) {
    console.error(`agent_gateway_codex_app_server_session_framing_fault code=${error.code} bytes=${error.byteCount}`);
    return;
  }
  console.error('agent_gateway_codex_app_server_session_framing_fault code=codex_app_server_output_failed bytes=0');
}

function reportCodexAppServerNativeExit(exit: ProcessExit): void {
  console.error(`agent_gateway_codex_app_server_native_exit code=${exit.code ?? 'null'} signal=${exit.signal ?? 'null'}`);
}
