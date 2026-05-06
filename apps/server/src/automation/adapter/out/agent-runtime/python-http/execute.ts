import { Logger } from '@nestjs/common';
import type { AdapterModule, ExecutionContext, ExecutionResult, EnvironmentTestResult, StreamEvent } from '../types';

const logger = new Logger('PythonHttpAdapter');

async function* execute(ctx: ExecutionContext): AsyncGenerator<StreamEvent, ExecutionResult> {
  const baseUrl = (ctx.config.baseUrl as string) || 'http://localhost:8001';
  const timeoutMs = ctx.timeoutSec * 1000;
  const input = ctx.payload ?? (ctx.config.input as Record<string, unknown> | undefined) ?? {};

  try {
    const response = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_type: ctx.agent.type,
        input,
        run_id: ctx.runId,
        env: ctx.env,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        stdout: JSON.stringify(data),
        stderr: data.error ?? `HTTP ${response.status}`,
      };
    }

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: JSON.stringify(data.output ?? data),
      stderr: '',
    };
  } catch (err: any) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return {
      exitCode: 1,
      signal: null,
      timedOut,
      stdout: '',
      stderr: timedOut ? `Timeout after ${ctx.timeoutSec}s` : `Fetch error: ${err.message}`,
    };
  }
}

async function testEnvironment(config: Record<string, unknown>): Promise<EnvironmentTestResult> {
  const baseUrl = (config.baseUrl as string) || 'http://localhost:8001';
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return { ok: res.ok, message: res.ok ? `Python agent server at ${baseUrl}` : `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, message: `Cannot reach ${baseUrl}: ${err.message}` };
  }
}

export const pythonHttpAdapter: AdapterModule = {
  type: 'python_http',
  execute,
  testEnvironment,
};
