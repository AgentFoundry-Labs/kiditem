import type { ClaudeProcessLauncher, ClaudeTurnHandle } from './claude-conversation.provider';
import type { GatewayProviderCommand } from './provider-command';
import type { ProcessSupervisor, SupervisedProcess } from '../platform/process-supervisor';

/** Supervised provider-process adapter. It forwards only stdout to the bounded parser. */
export class NativeClaudeProcessLauncher implements ClaudeProcessLauncher {
  constructor(private readonly options: Readonly<{ supervisor: ProcessSupervisor }>) {}

  async start(input: Readonly<{
    command: GatewayProviderCommand;
    input: string;
    onOutput: (chunk: string) => void;
    onExit: (code: number | null) => void;
  }>): Promise<ClaudeTurnHandle> {
    let process: SupervisedProcess;
    try {
      process = await this.options.supervisor.launch(input.command, {
        onStdout: input.onOutput,
        onExit: (exit) => input.onExit(exit.code),
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
      sendInput: (value: string) => writeInput(process, value),
      interrupt: () => process.terminate(),
    });
  }
}

async function writeInput(process: SupervisedProcess, value: string): Promise<void> {
  try { await process.input(value); }
  catch { throw new Error('claude_process_stdin_failed'); }
}
