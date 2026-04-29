import { spawn, ChildProcess } from 'child_process';
import { Logger } from '@nestjs/common';
import type { AdapterModule, ExecutionContext, ExecutionResult, EnvironmentTestResult, StreamEvent } from '../types';

const logger = new Logger('ClaudeLocalAdapter');

interface ParsedClaudeOutput {
  sessionId: string | null;
  model: string | null;
  costUsd: number | null;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null;
  summary: string;
  resultJson: Record<string, unknown> | null;
  stopReason: string | null;
}

function parseClaudeOutput(raw: string): ParsedClaudeOutput {
  let parsed: any = null;

  const lines = raw.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const candidate = JSON.parse(lines[i]);
      if (candidate && typeof candidate === 'object') {
        parsed = candidate;
        break;
      }
    } catch { continue; }
  }

  if (!parsed) {
    try {
      const whole = JSON.parse(raw);
      if (whole && typeof whole === 'object') parsed = whole;
    } catch { /* not valid JSON */ }
  }

  if (parsed && typeof parsed === 'object') {
    const usageObj = parsed.usage || {};
    return {
      sessionId: parsed.session_id || null,
      model: parsed.model || (parsed.modelUsage ? Object.keys(parsed.modelUsage)[0] : null),
      costUsd: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd
             : typeof parsed.cost_usd === 'number' ? parsed.cost_usd
             : null,
      usage: {
        inputTokens: usageObj.input_tokens || 0,
        cachedInputTokens: usageObj.cache_read_input_tokens || usageObj.cache_creation_input_tokens || 0,
        outputTokens: usageObj.output_tokens || 0,
      },
      summary: parsed.result || '',
      resultJson: parsed,
      stopReason: parsed.stop_reason || null,
    };
  }

  const match = raw.match(/```json\n([\s\S]*?)\n```/);
  if (match) {
    try {
      return { sessionId: null, model: null, costUsd: null, usage: null, summary: '', resultJson: JSON.parse(match[1]), stopReason: null };
    } catch { /* ignore */ }
  }

  return { sessionId: null, model: null, costUsd: null, usage: null, summary: raw.slice(0, 2000), resultJson: null, stopReason: null };
}

/**
 * Stream-JSON 라인에서 usage 이벤트 추출.
 * Claude CLI stream-json 형식: {"type":"result","usage":{"output_tokens":N},...}
 */
function tryParseStreamLine(line: string): StreamEvent | null {
  try {
    const obj = JSON.parse(line);
    if (obj?.usage?.output_tokens != null) {
      return { type: 'token_count', data: obj.usage.output_tokens };
    }
    if (obj?.type === 'content_block_delta' || obj?.type === 'message_delta') {
      const tokens = obj?.usage?.output_tokens;
      if (tokens != null) return { type: 'token_count', data: tokens };
    }
  } catch { /* not valid JSON line */ }
  return null;
}

async function* execute(ctx: ExecutionContext): AsyncGenerator<StreamEvent, ExecutionResult> {
  const command = (ctx.config.command as string) || 'claude';
  const extraArgs = (ctx.config.extraArgs as string[]) || [];
  const timeoutMs = ctx.timeoutSec * 1000;
  const graceMs = ctx.graceSec * 1000;
  const model = ctx.config.model as string | undefined;
  if (!model) throw new Error('Model not configured in AgentDefinition.config.model');

  const useStreaming = ctx.config.streaming !== false;
  const outputFormat = useStreaming ? 'stream-json' : 'json';

  const args = [
    '-p', ctx.prompt,
    '--output-format', outputFormat,
    '--allowedTools', ctx.allowedTools,
    '--permission-mode', ctx.permissionMode,
    '--max-tokens', String(ctx.maxOutputTokens),
    ...extraArgs,
  ];

  args.push('--model', model);
  if (ctx.sessionId && !ctx.config._skipSessionResume) {
    args.push('--session-id', ctx.sessionId);
  }

  // Queue-based bridge: child_process events → AsyncGenerator yields
  type QueueItem = StreamEvent | { _done: true; result: ExecutionResult };
  const queue: QueueItem[] = [];
  let waiting: (() => void) | null = null;

  const push = (item: QueueItem) => {
    queue.push(item);
    if (waiting) { waiting(); waiting = null; }
  };

  let child: ChildProcess;
  try {
    child = spawn(command, args, {
      cwd: ctx.cwd,
      env: { ...process.env, ...ctx.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      stdout: '',
      stderr: `Spawn error: ${err}`,
    };
  }

  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let killed = false;
  let lineBuf = '';

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => { if (!killed) child.kill('SIGKILL'); }, graceMs);
  }, timeoutMs);

  child.stdout?.on('data', (data: Buffer) => {
    const chunk = data.toString();
    stdout += chunk;

    if (useStreaming) {
      lineBuf += chunk;
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() ?? '';
      for (const line of lines) {
        const event = tryParseStreamLine(line.trim());
        if (event) push(event);
      }
    }
  });

  child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

  child.on('close', (code, signal) => {
    clearTimeout(timeout);
    killed = true;

    // Process remaining buffer
    if (lineBuf.trim()) {
      const event = tryParseStreamLine(lineBuf.trim());
      if (event) push(event);
    }

    const parsed = parseClaudeOutput(stdout);
    logger.debug(`Claude output parsed: session=${parsed.sessionId}, cost=${parsed.costUsd}, usage=${JSON.stringify(parsed.usage)}`);
    if (!parsed.costUsd && !parsed.usage?.inputTokens) {
      logger.warn(`No usage/cost data extracted from Claude output (${stdout.length} bytes)`);
    }

    push({
      _done: true,
      result: {
        exitCode: code,
        signal: signal ?? null,
        timedOut,
        stdout,
        stderr: stderr.slice(0, 2000),
        sessionIdAfter: parsed.sessionId ?? undefined,
        usage: parsed.usage ? {
          inputTokens: parsed.usage.inputTokens + parsed.usage.cachedInputTokens,
          outputTokens: parsed.usage.outputTokens,
          costCents: parsed.costUsd ? Math.round(parsed.costUsd * 100) : undefined,
        } : undefined,
        stopReason: parsed.stopReason ?? undefined,
      },
    });
  });

  child.on('error', (err) => {
    clearTimeout(timeout);
    killed = true;
    push({
      _done: true,
      result: {
        exitCode: 1,
        signal: null,
        timedOut: false,
        stdout,
        stderr: `Process error: ${err.message}`,
      },
    });
  });

  // Generator loop: yield events until done
  while (true) {
    if (queue.length === 0) {
      await new Promise<void>(r => { waiting = r; });
    }
    const item = queue.shift()!;
    if ('_done' in item) return item.result;
    yield item;
  }
}

async function testEnvironment(config: Record<string, unknown>): Promise<EnvironmentTestResult> {
  const command = (config.command as string) || 'claude';
  try {
    const child = spawn(command, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    return new Promise((resolve) => {
      let stdout = '';
      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', (code) => {
        resolve({
          ok: code === 0,
          message: code === 0 ? `Claude CLI found: ${stdout.trim()}` : `Claude CLI exited with code ${code}`,
        });
      });
      child.on('error', (err) => {
        resolve({ ok: false, message: `Cannot find ${command}: ${err.message}` });
      });
    });
  } catch (err: any) {
    return { ok: false, message: `Error checking Claude CLI: ${err.message}` };
  }
}

export const claudeLocalAdapter: AdapterModule = {
  type: 'claude_local',
  execute,
  testEnvironment,
};
