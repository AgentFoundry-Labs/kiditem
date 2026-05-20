export interface AgentRuntimeEnv {
  AGENT_RUNTIME_ALLOW_NOOP?: string;
  AGENT_RUNTIME_WORKER_ENABLED?: string;
  AGENT_RUNTIME_WORKER_INTERVAL_MS?: string;
}

export function resolveAgentRuntimeAllowNoop(
  env: AgentRuntimeEnv = process.env,
): boolean {
  return env.AGENT_RUNTIME_ALLOW_NOOP === '1';
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
