import { ServiceUnavailableException } from '@nestjs/common';
import type {
  AiDirectJobModels,
  AiDirectJobType,
} from '../../domain/direct-job/ai-direct-job.schema';

export interface AiDirectJobRuntimeConfig {
  workerIntervalMs: number;
  leaseMs: number;
  providerTimeoutMs: number;
  heldRecoveryMs: number;
  retryDelaysMs: readonly [number, number, number];
}

export const AI_DIRECT_JOB_RUNTIME_CONFIG = Symbol(
  'AI_DIRECT_JOB_RUNTIME_CONFIG',
);

export function resolveAiDirectJobModels(
  jobType: AiDirectJobType,
  env: NodeJS.ProcessEnv = process.env,
): AiDirectJobModels {
  const image = requireEnv('AI_IMAGE_MODEL', env);
  if (jobType === 'detail_page_generate') {
    return {
      image,
      text: requireEnv('AI_TEXT_MODEL', env),
      vision: requireEnv('AI_IMAGE_ANALYSIS_MODEL', env),
    };
  }
  return { image };
}

export function resolveAiDirectJobRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): AiDirectJobRuntimeConfig {
  return {
    workerIntervalMs: positiveInt(
      env.AI_DIRECT_JOB_WORKER_INTERVAL_MS,
      1_000,
    ),
    leaseMs: positiveInt(env.AI_DIRECT_JOB_LEASE_MS, 60_000),
    providerTimeoutMs: positiveInt(env.AI_PROVIDER_TIMEOUT_MS, 120_000),
    heldRecoveryMs: 30_000,
    retryDelaysMs: [5_000, 30_000, 120_000],
  };
}

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value) {
    throw Object.assign(
      new ServiceUnavailableException(
        `${name} is required for direct AI jobs.`,
      ),
      { code: 'model_required' },
    );
  }
  return value;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `AI direct job runtime value must be a positive integer: ${raw}`,
    );
  }
  return parsed;
}
