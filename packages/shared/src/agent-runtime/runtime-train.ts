import { z } from 'zod';

export const ATTEMPT_RUNTIME_TRAIN = Object.freeze({
  controlRevision: 'kiditem-runner-control-v1',
  cliContractIdentity: 'office-cli-contract-v2',
  mcpProtocolRevision: '2026-07-28',
  codexVersion: '0.149.1',
  claudeVersion: '2.1.241',
  nodeMajor: 22,
} as const);

export const RunnerPlatformSchema = z.enum(['macos', 'windows']);
export type RunnerPlatform = z.infer<typeof RunnerPlatformSchema>;

export const AgentCliRuntimeSchema = z.enum(['codex_cli', 'claude_cli']);
export type AgentCliRuntime = z.infer<typeof AgentCliRuntimeSchema>;

/** Compatibility type for the existing API readiness boundary. */
export type AttemptRuntimeType = AgentCliRuntime;

export function attemptRuntimeVersion(runtime: AgentCliRuntime): string {
  return runtime === 'codex_cli'
    ? ATTEMPT_RUNTIME_TRAIN.codexVersion
    : ATTEMPT_RUNTIME_TRAIN.claudeVersion;
}

export function runnerPlatformFromNodePlatform(platform: string = process.platform): RunnerPlatform {
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  throw new Error('runner_platform_unsupported');
}
