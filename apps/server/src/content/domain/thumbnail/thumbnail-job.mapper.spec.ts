import { describe, expect, it } from 'vitest';
import { toThumbnailJob } from './thumbnail-job.mapper';

const row = {
  id: '33333333-3333-4333-8333-333333333333',
  contentWorkspaceId: '11111111-1111-4111-8111-111111111111',
  status: 'succeeded',
  method: 'generate',
  prompt: null,
  inputMeta: { originalUrl: 'https://cdn.example.com/o.png' },
  errorMessage: null,
  attemptCount: 1,
  triggeredByUserId: null,
  createdAt: new Date('2026-09-23T00:00:00Z'),
  updatedAt: new Date('2026-09-23T00:01:00Z'),
};

describe('toThumbnailJob', () => {
  it('describes the job only; candidates and the representative image live elsewhere', () => {
    expect(toThumbnailJob(row)).toEqual({
      id: row.id,
      contentWorkspaceId: row.contentWorkspaceId,
      status: 'succeeded',
      method: 'generate',
      prompt: null,
      errorMessage: null,
      attemptCount: 1,
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:01:00.000Z',
    });
  });

  it('reads an unknown stored status as failed and an unknown method as edit', () => {
    expect(toThumbnailJob({ ...row, status: 'weird', method: 'legacy' })).toMatchObject({
      status: 'failed',
      method: 'edit',
    });
  });
});
