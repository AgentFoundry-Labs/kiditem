import { spawn, ChildProcess } from 'child_process';
import { Logger } from '@nestjs/common';
import type { AdapterModule, ExecutionContext, ExecutionResult, EnvironmentTestResult } from '../types';

const logger = new Logger('ClaudeLocalAdapter');

interface ParsedClaudeOutput {
  sessionId: string | null;
  model: string | null;
  costUsd: number | null;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null;
  summary: string;
  resultJson: Record<string, unknown> | null;
}

function parseClaudeOutput(raw: string): ParsedClaudeOutput {
  // Claude CLI --output-format json outputs a single JSON line with type:"result"
  // Multi-line output: scan from last line to find the result JSON
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

  // Fallback: try parsing entire raw as single JSON
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
    };
  }

  // Fallback: try to extract JSON block
  const match = raw.match(/```json\n([\s\S]*?)\n```/);
  if (match) {
    try {
      return { sessionId: null, model: null, costUsd: null, usage: null, summary: '', resultJson: JSON.parse(match[1]) };
    } catch { /* ignore */ }
  }

  return { sessionId: null, model: null, costUsd: null, usage: null, summary: raw.slice(0, 2000), resultJson: null };
}

async function execute(ctx: ExecutionContext): Promise<ExecutionResult> {
  const command = (ctx.config.command as string) || 'claude';
  const extraArgs = (ctx.config.extraArgs as string[]) || [];
  const timeoutMs = ctx.timeoutSec * 1000;
  const graceMs = ctx.graceSec * 1000;

  const model = (ctx.config.model as string) || '';

  const args = [
    '-p', ctx.prompt,
    '--output-format', 'json',
    '--allowedTools', ctx.allowedTools,
    '--permission-mode', ctx.permissionMode,
    ...extraArgs,
  ];

  // Model selection
  if (model) {
    args.push('--model', model);
  }

  // Session resume — skip if agent is already running (session in use)
  if (ctx.sessionId && !ctx.config._skipSessionResume) {
    args.push('--session-id', ctx.sessionId);
  }

  return new Promise<ExecutionResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd: ctx.cwd,
        env: { ...process.env, ...ctx.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({
        exitCode: 1,
        signal: null,
        timedOut: false,
        stdout: '',
        stderr: `Spawn error: ${err}`,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killed = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Grace period before SIGKILL
      setTimeout(() => {
        if (!killed) {
          child.kill('SIGKILL');
        }
      }, graceMs);
    }, timeoutMs);

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      killed = true;

      // Parse Claude output for session, usage, cost
      const parsed = parseClaudeOutput(stdout);
      logger.debug(`Claude output parsed: session=${parsed.sessionId}, cost=${parsed.costUsd}, usage=${JSON.stringify(parsed.usage)}`);
      if (!parsed.costUsd && !parsed.usage?.inputTokens) {
        logger.warn(`No usage/cost data extracted from Claude output (${stdout.length} bytes)`);
      }

      resolve({
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
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      killed = true;
      resolve({
        exitCode: 1,
        signal: null,
        timedOut: false,
        stdout,
        stderr: `Process error: ${err.message}`,
      });
    });
  });
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
        resolve({ ok: false, message: `Claude CLI not found: ${err.message}` });
      });
    });
  } catch (err) {
    return { ok: false, message: `Failed to test: ${err}` };
  }
}

export const claudeLocalAdapter: AdapterModule = {
  type: 'claude_local',
  execute,
  testEnvironment,
};
