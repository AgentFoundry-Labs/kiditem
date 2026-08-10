import { spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { Injectable, Logger } from '@nestjs/common';
import type {
  SourcingAssistantGenerationFailureReason,
  SourcingAssistantGenerationPort,
  SourcingAssistantGenerationRequest,
  SourcingAssistantGenerationResult,
  SourcingAssistantRuntime,
} from '../../../application/port/out/runtime/sourcing-assistant-generation.port';

const MAX_OUTPUT_BYTES = 16_000;

/**
 * CLI-based generation stays behind one adapter. The request itself only
 * contains retrieval text selected by the application service; it never gets
 * organization credentials or a repository working directory.
 */
@Injectable()
export class SourcingAssistantCliGenerationAdapter implements SourcingAssistantGenerationPort {
  private readonly logger = new Logger(SourcingAssistantCliGenerationAdapter.name);
  private running = false;

  async run(request: SourcingAssistantGenerationRequest): Promise<SourcingAssistantGenerationResult> {
    if (this.running) {
      return {
        ok: false,
        runtime: request.runtime,
        reason: 'busy',
        message: 'Another sourcing assistant generation is still running.',
        durationMs: 0,
      };
    }

    this.running = true;
    const startedAt = Date.now();
    try {
      const stdout = await this.exec(request);
      const text = request.runtime === 'claude'
        ? parseClaudeOutput(stdout)
        : stdout.trim();

      if (!text) {
        return failure(request, 'execution_failed', 'The CLI returned an empty final response.', startedAt);
      }

      return {
        ok: true,
        runtime: request.runtime,
        model: request.model,
        text,
        durationMs: Date.now() - startedAt,
      };
    } catch (error: unknown) {
      const reason = classifyExecutionError(error);
      const message = describeError(error);
      // stderr can contain host paths or provider configuration. Keep it out of
      // the UI response and log only the bounded classification here.
      this.logger.warn(`Sourcing assistant ${request.runtime} runtime failed (${reason}).`);
      return failure(request, reason, message, startedAt);
    } finally {
      this.running = false;
    }
  }

  private exec(request: SourcingAssistantGenerationRequest): Promise<string> {
    const command = buildCommand(request);

    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(command.bin, command.args, {
          // Neither CLI needs the KidItem repository to summarize supplied RAG
          // evidence. An OS temp root also contains no project AGENTS/config.
          cwd: tmpdir(),
          env: buildChildEnv(request.runtime),
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (error) {
        reject(error);
        return;
      }

      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let settled = false;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        action();
      };
      const timeout = setTimeout(() => {
        finish(() => {
          child.kill('SIGKILL');
          reject(Object.assign(new Error('CLI timeout'), { code: 'ETIMEDOUT' }));
        });
      }, request.timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        outputBytes += chunk.byteLength;
        if (outputBytes > MAX_OUTPUT_BYTES) {
          finish(() => {
            child.kill('SIGKILL');
            reject(Object.assign(new Error('CLI output exceeded the limit.'), { code: 'EOUTPUTLIMIT' }));
          });
          return;
        }
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        // Cap diagnostics too; they are only used to classify a failed run.
        if (stderr.length < 1_000) stderr += chunk.toString('utf8').slice(0, 1_000 - stderr.length);
      });
      child.once('error', (error) => finish(() => reject(error)));
      // `exit` can fire before stdout has finished flushing. `close` waits for
      // the stdio pipes, so a valid final answer cannot be truncated here.
      child.once('close', (exitCode) => {
        finish(() => {
          if (exitCode !== 0) {
            reject(new Error(stderr.trim() || `${request.runtime} exited with code ${exitCode ?? 'unknown'}.`));
            return;
          }
          if (!stdout.trim()) {
            reject(new Error(stderr.trim() || 'CLI returned no output.'));
            return;
          }
          resolve(stdout);
        });
      });
    });
  }
}

function buildCommand(request: SourcingAssistantGenerationRequest): { bin: string; args: string[] } {
  if (request.runtime === 'claude') {
    return {
      bin: 'claude',
      args: [
        '--print',
        '--output-format', 'json',
        '--model', request.model,
        // `--allowed-tools` only changes auto-approval. `--tools ""` actually
        // removes built-in tools, so untrusted evidence cannot induce reads or
        // shell commands.
        '--tools', '',
        '--strict-mcp-config',
        '--mcp-config', '{}',
        '--no-chrome',
        '--no-session-persistence',
        '--permission-mode', 'dontAsk',
        request.prompt,
      ],
    };
  }

  return {
    bin: 'codex',
    args: [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      // Codex does not expose a `--tools ""` equivalent. Disable each local
      // execution surface explicitly; the prompt can only produce final text.
      '--disable', 'shell_tool',
      '--disable', 'browser_use',
      '--disable', 'browser_use_external',
      '--disable', 'browser_use_full_cdp_access',
      '--disable', 'computer_use',
      '--disable', 'plugins',
      '--disable', 'image_generation',
      '--config', 'approval_policy="never"',
      '--config', 'allow_login_shell=false',
      '--config', 'apps._default.enabled=false',
      '--config', 'tools.view_image=false',
      '--config', 'tools.web_search=false',
      '--config', 'web_search="disabled"',
      '--model', request.model,
      request.prompt,
    ],
  };
}

function buildChildEnv(runtime: SourcingAssistantRuntime): NodeJS.ProcessEnv {
  const sharedKeys = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'TZ'];
  const providerKeys = runtime === 'claude'
    ? ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']
    : ['CODEX_API_KEY', 'OPENAI_API_KEY', 'CODEX_HOME'];
  const env: NodeJS.ProcessEnv = {};

  for (const key of [...sharedKeys, ...providerKeys]) {
    const value = process.env[key];
    if (value?.trim()) env[key] = value;
  }
  return env;
}

function parseClaudeOutput(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout) as {
      is_error?: boolean;
      api_error_status?: number;
      result?: unknown;
    };
    if (parsed.is_error) {
      throw Object.assign(new Error(typeof parsed.result === 'string' ? parsed.result : 'Claude CLI failed.'), {
        statusCode: parsed.api_error_status,
      });
    }
    return typeof parsed.result === 'string' ? parsed.result.trim() : '';
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      throw new Error('Claude CLI returned invalid JSON.');
    }
    throw error;
  }
}

function failure(
  request: SourcingAssistantGenerationRequest,
  reason: SourcingAssistantGenerationFailureReason,
  message: string,
  startedAt: number,
): SourcingAssistantGenerationResult {
  return {
    ok: false,
    runtime: request.runtime,
    reason,
    message,
    durationMs: Date.now() - startedAt,
  };
}

function classifyExecutionError(error: unknown): SourcingAssistantGenerationFailureReason {
  const candidate = error as { code?: string; statusCode?: number } | null;
  if (candidate?.code === 'ENOENT') return 'cli_not_found';
  if (candidate?.code === 'ETIMEDOUT') return 'timeout';
  if (candidate?.code === 'EOUTPUTLIMIT') return 'output_limit';
  if (candidate?.statusCode === 401 || candidate?.statusCode === 403) return 'unauthenticated';
  const message = describeError(error);
  if (/authenticate|authentication|unauthorized|oauth|login|token|api key/i.test(message)) {
    return 'unauthenticated';
  }
  return 'execution_failed';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
