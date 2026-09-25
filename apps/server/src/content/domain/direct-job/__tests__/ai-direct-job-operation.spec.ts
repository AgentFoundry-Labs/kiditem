import { describe, expect, it } from 'vitest';
import { OperationKindSchema, OperationLockKeySchema } from '@kiditem/shared/operation';
import {
  AI_DIRECT_JOB_KINDS,
  aiDirectJobKind,
  aiDirectJobLockKey,
  aiDirectJobPlan,
  aiDirectJobTypeOfKind,
  aiDirectJobRetryAfterMs,
} from '../ai-direct-job-operation';

const SOURCE = '33333333-3333-4333-8333-333333333333';
const imageEdit = {
  jobType: 'image_edit' as const,
  models: { image: 'image-model' },
  input: { image_url: 'https://storage.example.com/input.png', preset: 'custom' },
};

describe('AI direct job as an operation', () => {
  it('runs each job type as its own content kind', () => {
    expect(AI_DIRECT_JOB_KINDS).toEqual([
      'content.thumbnail_generate',
      'content.thumbnail_reedit',
      'content.detail_page_generate',
      'content.image_edit',
    ]);
    for (const kind of AI_DIRECT_JOB_KINDS) {
      expect(OperationKindSchema.parse(kind)).toBe(kind);
      expect(aiDirectJobKind(aiDirectJobTypeOfKind(kind))).toBe(kind);
    }
  });

  it('locks one job per (job type, source resource), like the old (org, jobType, source) unique', () => {
    expect(aiDirectJobLockKey('thumbnail_reedit', SOURCE)).toBe(`resource:thumbnail-reedit:${SOURCE}`);
    expect(aiDirectJobLockKey('thumbnail_generate', SOURCE)).not.toBe(aiDirectJobLockKey('thumbnail_reedit', SOURCE));
    expect(OperationLockKeySchema.parse(aiDirectJobLockKey('detail_page_generate', SOURCE))).toBeTruthy();
  });

  it('reads the job back from the operation plan, and refuses a plan whose job type is not the kind', () => {
    const plan = { sourceResourceId: SOURCE, payload: imageEdit };
    expect(aiDirectJobPlan('content.image_edit', plan)).toEqual(plan);
    expect(() => aiDirectJobPlan('content.thumbnail_generate', plan)).toThrow();
    expect(() => aiDirectJobPlan('content.image_edit', { payload: imageEdit })).toThrow();
  });

  it('backs a retryable failure off 5s, 30s, then 120s by attempt; a non-retryable one has no retry', () => {
    const delays = [5_000, 30_000, 120_000] as const;
    expect(aiDirectJobRetryAfterMs({ retryable: true, attempts: 1 }, delays)).toBe(5_000);
    expect(aiDirectJobRetryAfterMs({ retryable: true, attempts: 2 }, delays)).toBe(30_000);
    expect(aiDirectJobRetryAfterMs({ retryable: true, attempts: 7 }, delays)).toBe(120_000);
    expect(aiDirectJobRetryAfterMs({ retryable: false, attempts: 1 }, delays)).toBeUndefined();
  });
});
