export interface AgentRuntimeEnv {
  AGENT_RUNTIME_WORKER_ENABLED?: string;
  AGENT_RUNTIME_WORKER_INTERVAL_MS?: string;
  AGENT_RUNTIME_EXECUTION_TIMEOUT_MS?: string;
  AGENT_RUNTIME_STDOUT_LIMIT_BYTES?: string;
  AGENT_RUNTIME_STDERR_LIMIT_BYTES?: string;
  AGENT_RUNTIME_OUTPUT_FILE_LIMIT_BYTES?: string;
  AGENT_RUNTIME_CONCURRENCY?: string;
  AGENT_RUNTIME_CAPACITY_WAIT_MS?: string;
  AGENT_RUNTIME_CLAUDE_MAX_BUDGET_USD?: string;
}

export const AGENT_RUNTIME_EXECUTION_TIMEOUT_MS = 45_000;
export const AGENT_RUNTIME_STDOUT_LIMIT_BYTES = 524_288;
export const AGENT_RUNTIME_STDERR_LIMIT_BYTES = 32_768;
export const AGENT_RUNTIME_OUTPUT_FILE_LIMIT_BYTES = 65_536;
export const AGENT_RUNTIME_CONCURRENCY = 2;
export const AGENT_RUNTIME_CAPACITY_WAIT_MS = 5_000;
export const AGENT_RUNTIME_CLAUDE_MAX_BUDGET_USD = '0.25';

export interface AgentLocalCliRuntimeConfig {
  executionTimeoutMs: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
  outputFileLimitBytes: number;
  concurrency: number;
  capacityWaitMs: number;
  claudeMaxBudgetUsd: string;
}

function positiveFinite(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = positiveFinite(raw, fallback);
  return Number.isInteger(value) ? value : fallback;
}

export function resolveAgentLocalCliRuntimeConfig(
  env: AgentRuntimeEnv = process.env,
): AgentLocalCliRuntimeConfig {
  return {
    executionTimeoutMs: positiveFinite(
      env.AGENT_RUNTIME_EXECUTION_TIMEOUT_MS,
      AGENT_RUNTIME_EXECUTION_TIMEOUT_MS,
    ),
    stdoutLimitBytes: positiveFinite(
      env.AGENT_RUNTIME_STDOUT_LIMIT_BYTES,
      AGENT_RUNTIME_STDOUT_LIMIT_BYTES,
    ),
    stderrLimitBytes: positiveFinite(
      env.AGENT_RUNTIME_STDERR_LIMIT_BYTES,
      AGENT_RUNTIME_STDERR_LIMIT_BYTES,
    ),
    outputFileLimitBytes: positiveFinite(
      env.AGENT_RUNTIME_OUTPUT_FILE_LIMIT_BYTES,
      AGENT_RUNTIME_OUTPUT_FILE_LIMIT_BYTES,
    ),
    concurrency: positiveInteger(
      env.AGENT_RUNTIME_CONCURRENCY,
      AGENT_RUNTIME_CONCURRENCY,
    ),
    capacityWaitMs: positiveFinite(
      env.AGENT_RUNTIME_CAPACITY_WAIT_MS,
      AGENT_RUNTIME_CAPACITY_WAIT_MS,
    ),
    claudeMaxBudgetUsd:
      positiveFinite(
        env.AGENT_RUNTIME_CLAUDE_MAX_BUDGET_USD,
        Number(AGENT_RUNTIME_CLAUDE_MAX_BUDGET_USD),
      ).toString(),
  };
}

export function resolveAgentRuntimeWorkerEnabled(
  env: AgentRuntimeEnv = process.env,
): boolean {
  const raw = env.AGENT_RUNTIME_WORKER_ENABLED;
  if (raw === undefined || raw === '') return false;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export function resolveAgentRuntimeWorkerIntervalMs(
  env: AgentRuntimeEnv = process.env,
): number {
  const raw = env.AGENT_RUNTIME_WORKER_INTERVAL_MS;
  if (raw === undefined || raw === '') return 2000;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 2000;
  return parsed;
}
