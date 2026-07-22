import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  resolveAiDirectJobModels,
  resolveAiDirectJobRuntimeConfig,
} from '../ai-direct-job.config';

describe('ai direct job configuration', () => {
  it('requires the image model for every direct media job', () => {
    expect(() =>
      resolveAiDirectJobModels('image_edit', {}),
    ).toThrow(ServiceUnavailableException);
  });

  it.each(['AI_TEXT_MODEL', 'AI_IMAGE_ANALYSIS_MODEL'] as const)(
    'requires %s for detail page jobs',
    (missing) => {
      const env: NodeJS.ProcessEnv = {
        AI_IMAGE_MODEL: 'image-model',
        AI_TEXT_MODEL: 'text-model',
        AI_IMAGE_ANALYSIS_MODEL: 'vision-model',
      };
      delete env[missing];

      expect(() =>
        resolveAiDirectJobModels('detail_page_generate', env),
      ).toThrow(expect.objectContaining({ code: 'model_required' }));
    },
  );

  it('returns the complete detail-page model plan', () => {
    expect(
      resolveAiDirectJobModels('detail_page_generate', {
        AI_IMAGE_MODEL: ' image-model ',
        AI_TEXT_MODEL: ' text-model ',
        AI_IMAGE_ANALYSIS_MODEL: ' vision-model ',
      }),
    ).toEqual({
      image: 'image-model',
      text: 'text-model',
      vision: 'vision-model',
    });
  });

  it.each([
    [
      'AI_IMAGE_MODEL',
      'gemini-3.1-flash-image-preview',
      'gemini-3.1-flash-image',
    ],
    [
      'AI_IMAGE_ANALYSIS_MODEL',
      'models/gemini-3.1-flash-lite-preview',
      'gemini-3.1-flash-lite',
    ],
  ] as const)(
    'rejects deprecated direct-job model %s and points to its stable replacement',
    (name, deprecated, replacement) => {
      const env: NodeJS.ProcessEnv = {
        AI_IMAGE_MODEL: 'gemini-3.1-flash-image',
        AI_TEXT_MODEL: 'gemini-2.5-flash',
        AI_IMAGE_ANALYSIS_MODEL: 'gemini-3.1-flash-lite',
        [name]: deprecated,
      };

      expect(() =>
        resolveAiDirectJobModels('detail_page_generate', env),
      ).toThrow(
        `${name} ${deprecated} is deprecated or unavailable. Set ${name}=${replacement}.`,
      );
    },
  );

  it.each(['0', '-1', '1.5', 'not-a-number'])(
    'rejects an invalid worker interval override: %s',
    (value) => {
      expect(() =>
        resolveAiDirectJobRuntimeConfig({
          AI_DIRECT_JOB_WORKER_INTERVAL_MS: value,
        }),
      ).toThrow(/positive integer/);
    },
  );

  it('rejects queue backoff maxima shorter than the minimum polling interval', () => {
    expect(() =>
      resolveAiDirectJobRuntimeConfig({
        AI_DIRECT_JOB_WORKER_INTERVAL_MS: '5000',
        AI_DIRECT_JOB_WORKER_MAX_INTERVAL_MS: '1000',
      }),
    ).toThrow(/maximum interval/i);

    expect(() =>
      resolveAiDirectJobRuntimeConfig({
        AI_DIRECT_JOB_WORKER_INTERVAL_MS: '5000',
        AI_DIRECT_JOB_WORKER_ERROR_MAX_INTERVAL_MS: '1000',
      }),
    ).toThrow(/error maximum interval/i);
  });

  it('rejects a lease heartbeat that is not shorter than the lease', () => {
    expect(() =>
      resolveAiDirectJobRuntimeConfig({
        AI_DIRECT_JOB_LEASE_MS: '5000',
        AI_DIRECT_JOB_HEARTBEAT_MS: '5000',
      }),
    ).toThrow(/heartbeat/i);
  });

  it('uses always-enabled runtime defaults', () => {
    expect(resolveAiDirectJobRuntimeConfig({})).toEqual({
      workerIntervalMs: 1_000,
      workerMaxIntervalMs: 10_000,
      workerErrorMaxIntervalMs: 30_000,
      leaseHeartbeatMs: 5_000,
      leaseMs: 60_000,
      providerTimeoutMs: 20 * 60_000,
      heldRecoveryMs: 30_000,
      retryDelaysMs: [5_000, 30_000, 120_000],
    });
  });
});
