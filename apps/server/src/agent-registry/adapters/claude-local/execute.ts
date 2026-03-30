import { spawn, ChildProcess } from 'child_process';
import { Logger } from '@nestjs/common';
import type { AdapterModule, ExecutionContext, ExecutionResult, EnvironmentTestResult } from '../types';

const logger = new Logger('ClaudeLocalAdapter');

function parseClaudeOutput(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/```json\n([\s\S]*?)\n```/);
    if (match) return JSON.parse(match[1]);
    const jsonMatch = raw.match(/\{[\s\S]*"task_id"[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { raw_output: raw.slice(0, 2000) };
  }
}

async function execute(ctx: ExecutionContext): Promise<ExecutionResult> {
  const command = (ctx.config.command as string) || 'claude';
  const extraArgs = (ctx.config.extraArgs as string[]) || [];
  const timeoutMs = ctx.timeoutSec * 1000;
  const graceMs = ctx.graceSec * 1000;

  const args = [
    '-p', ctx.prompt,
    '--output-format', 'json',
    '--allowedTools', ctx.allowedTools,
    '--permission-mode', ctx.permissionMode,
    ...extraArgs,
  ];

  // Session resume
  if (ctx.sessionId) {
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

      // Extract session ID from Claude output if available
      let sessionIdAfter: string | undefined;
      try {
        const parsed = JSON.parse(stdout);
        if (parsed?.session_id) sessionIdAfter = parsed.session_id;
      } catch { /* ignore */ }

      resolve({
        exitCode: code,
        signal: signal ?? null,
        timedOut,
        stdout,
        stderr: stderr.slice(0, 2000),
        sessionIdAfter,
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
