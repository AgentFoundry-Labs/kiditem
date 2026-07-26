import { ServiceUnavailableException } from '@nestjs/common';
import type {
  AiDirectJobModels,
  AiDirectJobType,
} from '../../domain/direct-job/ai-direct-job.schema';

export interface AiDirectJobRuntimeConfig {
  workerIntervalMs: number;
  workerMaxIntervalMs: number;
  workerErrorMaxIntervalMs: number;
  leaseHeartbeatMs: number;
  leaseMs: number;
  providerTimeoutMs: number;
  heldRecoveryMs: number;
  retryDelaysMs: readonly [number, number, number];
}

export const AI_DIRECT_JOB_RUNTIME_CONFIG = Symbol(
  'AI_DIRECT_JOB_RUNTIME_CONFIG',
);

const DEPRECATED_DIRECT_AI_MODELS = new Map<string, string>([
  ['gemini-2.5-flash-image-preview', 'gemini-3.1-flash-image'],
  ['models/gemini-2.5-flash-image-preview', 'gemini-3.1-flash-image'],
  ['gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image'],
  ['models/gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image'],
  ['gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite'],
  ['models/gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite'],
]);

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
  const workerIntervalMs = positiveInt(
    env.AI_DIRECT_JOB_WORKER_INTERVAL_MS,
    1_000,
  );
  const workerMaxIntervalMs = positiveInt(
    env.AI_DIRECT_JOB_WORKER_MAX_INTERVAL_MS,
    10_000,
  );
  const workerErrorMaxIntervalMs = positiveInt(
    env.AI_DIRECT_JOB_WORKER_ERROR_MAX_INTERVAL_MS,
    30_000,
  );
  const leaseMs = positiveInt(env.AI_DIRECT_JOB_LEASE_MS, 60_000);
  const leaseHeartbeatMs = positiveInt(
    env.AI_DIRECT_JOB_HEARTBEAT_MS,
    5_000,
  );
  if (workerMaxIntervalMs < workerIntervalMs) {
    throw new Error(
      'AI direct job maximum interval must be at least the minimum interval.',
    );
  }
  if (workerErrorMaxIntervalMs < workerIntervalMs) {
    throw new Error(
      'AI direct job error maximum interval must be at least the minimum interval.',
    );
  }
  if (leaseHeartbeatMs >= leaseMs) {
    throw new Error('AI direct job heartbeat must be shorter than the lease.');
  }
  return {
    workerIntervalMs,
    workerMaxIntervalMs,
    workerErrorMaxIntervalMs,
    leaseHeartbeatMs,
    leaseMs,
    providerTimeoutMs: positiveInt(env.AI_PROVIDER_TIMEOUT_MS, 20 * 60_000),
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
  const replacement = DEPRECATED_DIRECT_AI_MODELS.get(value);
  if (replacement) {
    throw Object.assign(
      new ServiceUnavailableException(
        `${name} ${value} is deprecated or unavailable. Set ${name}=${replacement}.`,
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
