import type { ClaudeProcessLauncher, ClaudeTurnHandle } from './claude-conversation.provider';
import type { GatewayProviderCommand } from '../provider-command';
import type { ProcessSupervisor, SupervisedProcess } from '../../platform/process-supervisor';

/** Supervised provider-process adapter. It forwards only stdout to the bounded parser. */
export class NativeClaudeProcessLauncher implements ClaudeProcessLauncher {
  constructor(private readonly options: Readonly<{
    supervisor: ProcessSupervisor;
    onFatal: (error: Error) => void;
  }>) {}

  async start(input: Readonly<{
    command: GatewayProviderCommand;
    input: string;
    onOutput: (chunk: string) => void;
    onExit: (code: number | null) => void;
  }>): Promise<ClaudeTurnHandle> {
    let process: SupervisedProcess;
    let fatal = false;
    try {
      process = await this.options.supervisor.launch(input.command, {
        onStdout: input.onOutput,
        onExit: (exit) => input.onExit(exit.code),
        onFatal: (error) => {
          if (fatal) return;
          fatal = true;
          this.options.onFatal(error);
        },
      });
    } catch {
      throw new Error('claude_process_spawn_failed');
    }
    try {
      await process.input(input.input);
    } catch {
      try { await process.terminate(); } catch { /* failure remains supervisor-owned */ }
      throw new Error('claude_process_stdin_failed');
    }
    return Object.freeze({
      interrupt: () => process.terminate(),
    });
  }
}
