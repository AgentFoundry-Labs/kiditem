import { describe, expect, it, vi } from 'vitest';
import { SourcingLiveCommerceSourceAttemptController } from '../sourcing-live-commerce-source-attempt.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000010';
const PAGE_URL = 'https://live.douyin.com/123';

describe('SourcingLiveCommerceSourceAttemptController', () => {
  it('starts a browser live source attempt from the authenticated organization and never returns its fence token on reads', async () => {
    const sourceAttempts = {
      beginBrowser: vi.fn().mockResolvedValue({ attemptId: ATTEMPT_ID, state: 'RUNNING' }),
      readBrowser: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT_ID,
        attemptToken: '11111111-1111-4111-8111-111111111111',
        state: 'RUNNING',
      }),
      completeBrowser: vi.fn(),
      failBrowser: vi.fn(),
    };
    const controller = new SourcingLiveCommerceSourceAttemptController(sourceAttempts as never);

    await expect(controller.beginBrowser(
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      'live-refresh-1',
      { url: PAGE_URL },
    )).resolves.toEqual({ attemptId: ATTEMPT_ID, state: 'RUNNING' });
    await expect(controller.readBrowser(ATTEMPT_ID, ORGANIZATION_ID)).resolves.not.toHaveProperty('attemptToken');

    expect(sourceAttempts.beginBrowser).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      idempotencyKey: 'live-refresh-1',
      url: PAGE_URL,
    });
  });

  it('returns current browser source status by URL without exposing any owner token', async () => {
    const sourceAttempts = {
      beginBrowser: vi.fn(),
      readBrowser: vi.fn(),
      readBrowserStatus: vi.fn().mockResolvedValue({
        ready: false,
        refreshing: false,
        actualCutoffAt: new Date('2026-09-04T00:00:00.000Z'),
        errorCode: 'SOURCE_COLLECTION_FAILED',
        errorMessage: 'Collection failed.',
        latestAttempt: {
          attemptId: ATTEMPT_ID,
          attemptToken: '11111111-1111-4111-8111-111111111111',
        },
        latestComplete: {
          attemptId: '00000000-0000-4000-8000-000000000012',
          attemptToken: '22222222-2222-4222-8222-222222222222',
        },
      }),
      completeBrowser: vi.fn(),
      failBrowser: vi.fn(),
    };
    const controller = new SourcingLiveCommerceSourceAttemptController(sourceAttempts as never);

    await expect(controller.readBrowserStatus(PAGE_URL, ORGANIZATION_ID)).resolves.toEqual({
      ready: false,
      refreshing: false,
      actualCutoffAt: new Date('2026-09-04T00:00:00.000Z'),
      errorCode: 'SOURCE_COLLECTION_FAILED',
      errorMessage: 'Collection failed.',
      latestAttempt: { attemptId: ATTEMPT_ID },
      latestComplete: { attemptId: '00000000-0000-4000-8000-000000000012' },
    });
    expect(sourceAttempts.readBrowserStatus).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      url: PAGE_URL,
    });
  });
});
