import { describe, expect, it } from 'vitest';
import type { ThumbnailExecutionStatus } from '@kiditem/shared/thumbnail-execution';
import { thumbnailExecutionIdChunks, thumbnailRegistrationFor } from './thumbnail-registration';

const SP1 = '00000000-0000-4000-8000-0000000000a1';
const SP2 = '00000000-0000-4000-8000-0000000000a2';
const A1 = '00000000-0000-4000-8000-0000000000b1';
const A2 = '00000000-0000-4000-8000-0000000000b2';

const status = (salesProductId: string, assetId: string, patch: Partial<ThumbnailExecutionStatus> = {}): ThumbnailExecutionStatus => ({
  salesProductId,
  assetId,
  executionId: `${salesProductId}-${assetId}-execution`,
  status: 'succeeded',
  providerOutcome: 'succeeded',
  checkedAt: '2026-09-23T01:00:00.000Z',
  error: null,
  screenshotPath: null,
  ...patch,
});

describe('thumbnailRegistrationFor', () => {
  it('reads the latest execution of the sales product when it uploaded one of the line assets', () => {
    const statuses = [
      status(SP1, A1, { status: 'reconciling', providerOutcome: 'uncertain', error: 'port closed' }),
      status(SP2, A2, { status: 'failed', providerOutcome: 'definitive_failure', error: '로그인 필요' }),
    ];

    expect(thumbnailRegistrationFor(statuses, { salesProductId: SP1, assetIds: [A2, A1] })).toEqual({
      registrationExecutionId: `${SP1}-${A1}-execution`,
      registrationExecutionStatus: 'reconciling',
      registrationStatus: 'checking',
      registrationError: 'port closed',
      registrationCheckedAt: '2026-09-23T01:00:00.000Z',
    });
    expect(thumbnailRegistrationFor(statuses, { salesProductId: SP2, assetIds: [A2] })).toMatchObject({
      registrationStatus: 'failed',
      registrationError: '로그인 필요',
    });
  });

  it('does not claim an execution that uploaded another asset, or a line without a sales product', () => {
    const statuses = [status(SP1, A1)];
    const none = {
      registrationExecutionId: null,
      registrationExecutionStatus: null,
      registrationStatus: null,
      registrationError: null,
      registrationCheckedAt: null,
    };

    expect(thumbnailRegistrationFor(statuses, { salesProductId: SP1, assetIds: [A2] })).toEqual(none);
    expect(thumbnailRegistrationFor(statuses, { salesProductId: null, assetIds: [A1] })).toEqual(none);
  });
});

describe('thumbnailExecutionIdChunks', () => {
  it('splits the listed sales product ids into 100-id pages so each query string stays short, without duplicates', () => {
    const ids = Array.from({ length: 250 }, (_, index) => `sp${index}`);
    const chunks = thumbnailExecutionIdChunks([...ids, 'sp0']);
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(ids);
  });
});
