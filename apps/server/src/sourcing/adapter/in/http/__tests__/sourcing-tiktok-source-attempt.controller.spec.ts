import { describe, expect, it, vi } from 'vitest';
import { SourcingTiktokSourceAttemptController } from '../sourcing-tiktok-source-attempt.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000010';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000011';

describe('SourcingTiktokSourceAttemptController', () => {
  it('starts the TikTok owner attempt from authenticated scope and returns the fence token only from begin', async () => {
    const sourceAttempts = {
      beginTiktok: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        state: 'RUNNING',
      }),
      readTiktok: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        state: 'RUNNING',
      }),
      readTiktokStatus: vi.fn().mockResolvedValue({
        status: 'READY',
        latestAttempt: { attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, state: 'RUNNING' },
        latestComplete: null,
      }),
      completeTiktok: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        state: 'COMPLETE',
      }),
      failTiktok: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT_ID,
        attemptToken: ATTEMPT_TOKEN,
        state: 'FAILED',
      }),
    };
    const controller = new SourcingTiktokSourceAttemptController(sourceAttempts as never);

    const begun = await controller.beginTiktok(
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      'tiktok-owner-key',
      { maxItems: 12, region: 'KR' },
    );
    const read = await controller.readTiktok(ATTEMPT_ID, ORGANIZATION_ID);
    const status = await controller.readTiktokStatus(ORGANIZATION_ID);
    const completed = await controller.completeTiktok(
      ATTEMPT_ID,
      ATTEMPT_TOKEN,
      { region: 'KR', items: [], visitedTargetIds: ['hashtag', 'product'] },
      ORGANIZATION_ID,
    );
    const failed = await controller.failTiktok(
      ATTEMPT_ID,
      ATTEMPT_TOKEN,
      { code: 'COLLECTION_CANCELLED', message: 'cancelled by user' },
      ORGANIZATION_ID,
    );

    expect(begun).toMatchObject({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, state: 'RUNNING' });
    expect(read).not.toHaveProperty('attemptToken');
    expect(status.latestAttempt).not.toHaveProperty('attemptToken');
    expect(completed).not.toHaveProperty('attemptToken');
    expect(failed).not.toHaveProperty('attemptToken');
    expect(sourceAttempts.beginTiktok).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: 'tiktok-owner-key',
      maxItems: 12,
      region: 'KR',
    });
    expect(sourceAttempts.completeTiktok).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: { region: 'KR', items: [], visitedTargetIds: ['hashtag', 'product'] },
    });
    expect(sourceAttempts.failTiktok).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      code: 'COLLECTION_CANCELLED',
      message: 'cancelled by user',
    });
  });

  it('requires the owner-issued token on terminal TikTok requests', async () => {
    const controller = new SourcingTiktokSourceAttemptController({
      beginTiktok: vi.fn(),
      readTiktok: vi.fn(),
      readTiktokStatus: vi.fn(),
      completeTiktok: vi.fn(),
      failTiktok: vi.fn(),
    } as never);

    expect(() => controller.completeTiktok(
      ATTEMPT_ID,
      undefined,
      { region: 'KR', items: [], visitedTargetIds: [] },
      ORGANIZATION_ID,
    )).toThrow('INVALID_SOURCE_ATTEMPT_TOKEN');
    expect(() => controller.failTiktok(
      ATTEMPT_ID,
      'not-a-token',
      { code: 'FAILED', message: 'failed' },
      ORGANIZATION_ID,
    )).toThrow('INVALID_SOURCE_ATTEMPT_TOKEN');
  });

  it('preserves the old strict start-input boundary before calling the owner', () => {
    const sourceAttempts = {
      beginTiktok: vi.fn(),
    };
    const controller = new SourcingTiktokSourceAttemptController(sourceAttempts as never);

    for (const body of [
      { maxItems: 999 },
      { region: 'not valid!' },
      { maxItems: 10, unexpected: true },
    ]) {
      expect(() => controller.beginTiktok(
        ORGANIZATION_ID,
        { id: USER_ID } as never,
        'tiktok-owner-key',
        body,
      )).toThrow('INVALID_TIKTOK_SOURCE_ATTEMPT_REQUEST');
    }
    expect(sourceAttempts.beginTiktok).not.toHaveBeenCalled();
  });
});
