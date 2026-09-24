import type {
  AiDirectJobModels,
  AiDirectJobType,
} from '../../domain/direct-job/ai-direct-job.schema';
import { KiditemError, KiditemExternalError } from '@kiditem/shared/errors';

export interface AiDirectJobRuntimeConfig {
  workerEnabled: boolean;
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
    throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'DIRECT_JOB_MAX_INTERVAL_TOO_SMALL' } });
  }
  if (workerErrorMaxIntervalMs < workerIntervalMs) {
    throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'DIRECT_JOB_ERROR_INTERVAL_TOO_SMALL' } });
  }
  if (leaseHeartbeatMs >= leaseMs) {
    throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'DIRECT_JOB_HEARTBEAT_NOT_SHORTER_THAN_LEASE' } });
  }
  return {
    workerEnabled: env.AI_DIRECT_JOB_WORKER_ENABLED !== '0',
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
    throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', {
      details: { reason: 'DIRECT_JOB_MODEL_MISSING' },
      cause: name,
    });
  }
  const replacement = DEPRECATED_DIRECT_AI_MODELS.get(value);
  if (replacement) {
    throw new KiditemExternalError('CONTENT_MODEL_NOT_CONFIGURED', {
      details: { reason: 'DIRECT_JOB_MODEL_DEPRECATED', model: value, replacement },
      cause: name,
    });
  }
  return value;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'DIRECT_JOB_RUNTIME_VALUE_INVALID', value: raw } });
  }
  return parsed;
}
