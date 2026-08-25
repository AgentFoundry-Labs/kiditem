import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ClaudeProcessLauncher, ClaudeTurnHandle } from './claude-conversation.provider';
import type { GatewayProviderCommand } from './provider-command';

/** Native child-process adapter. It forwards only stdout to the bounded parser. */
export class NativeClaudeProcessLauncher implements ClaudeProcessLauncher {
  async start(input: Readonly<{
    command: GatewayProviderCommand;
    input: string;
    onOutput: (chunk: string) => void;
    onExit: (code: number | null) => void;
  }>): Promise<ClaudeTurnHandle> {
    return new Promise<ClaudeTurnHandle>((resolveStart, rejectStart) => {
      let child: ChildProcessWithoutNullStreams;
      let started = false;
      try {
        child = spawn(input.command.executable, [...input.command.args], {
          cwd: input.command.cwd,
          env: input.command.env,
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      } catch {
        rejectStart(new Error('claude_process_spawn_failed'));
        return;
      }
      child.stdout.on('data', (chunk: Buffer) => input.onOutput(chunk.toString('utf8')));
      child.once('error', () => {
        input.onExit(1);
        if (!started) rejectStart(new Error('claude_process_spawn_failed'));
      });
      child.once('close', (code) => input.onExit(code));
      try {
        child.stdin.write(input.input, 'utf8', (error) => {
          if (!error) return;
          input.onExit(1);
          if (!started) rejectStart(new Error('claude_process_stdin_failed'));
        });
      } catch {
        input.onExit(1);
        rejectStart(new Error('claude_process_stdin_failed'));
        return;
      }
      started = true;
      resolveStart(Object.freeze({
        sendInput: (value: string) => writeInput(child, value),
        interrupt: async () => { try { child.kill('SIGTERM'); } catch { /* already exited */ } },
      }));
    });
  }
}

function writeInput(child: ChildProcessWithoutNullStreams, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      child.stdin.write(value, 'utf8', (error) => error ? reject(new Error('claude_process_stdin_failed')) : resolve());
    } catch {
      reject(new Error('claude_process_stdin_failed'));
    }
  });
}
