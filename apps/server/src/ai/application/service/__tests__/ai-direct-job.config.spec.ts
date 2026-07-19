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

  it('uses always-enabled runtime defaults', () => {
    expect(resolveAiDirectJobRuntimeConfig({})).toEqual({
      workerIntervalMs: 1_000,
      leaseMs: 60_000,
      providerTimeoutMs: 120_000,
      heldRecoveryMs: 30_000,
      retryDelaysMs: [5_000, 30_000, 120_000],
    });
  });
});
