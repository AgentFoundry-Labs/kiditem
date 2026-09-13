import { describe, expect, it, vi } from 'vitest';
import { SourcingBrowserSourceAttemptController } from '../sourcing-browser-source-attempt.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000010';

describe('SourcingBrowserSourceAttemptController', () => {
  it('keeps owner attempt tokens out of read and source-status responses', async () => {
    const sourceAttempts = {
      read1688: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT_ID,
        attemptToken: '11111111-1111-4111-8111-111111111111',
        state: 'RUNNING',
      }),
      read1688Status: vi.fn().mockResolvedValue({
        ready: true,
        latestAttempt: {
          attemptId: ATTEMPT_ID,
          attemptToken: '11111111-1111-4111-8111-111111111111',
          state: 'RUNNING',
        },
        latestComplete: {
          attemptId: '00000000-0000-4000-8000-000000000011',
          attemptToken: '22222222-2222-4222-8222-222222222222',
          state: 'COMPLETE',
        },
      }),
    };
    const controller = new SourcingBrowserSourceAttemptController(sourceAttempts as never);

    const attempt = await controller.read1688(ATTEMPT_ID, ORGANIZATION_ID);
    const status = await controller.read1688Status(ORGANIZATION_ID);

    expect(attempt).not.toHaveProperty('attemptToken');
    expect(status.latestAttempt).not.toHaveProperty('attemptToken');
    expect(status.latestComplete).not.toHaveProperty('attemptToken');
    expect(sourceAttempts.read1688).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, attemptId: ATTEMPT_ID });
    expect(sourceAttempts.read1688Status).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
  });

  it('returns the attempt token only from begin, not from terminal responses', async () => {
    const terminal = {
      attemptId: ATTEMPT_ID,
      attemptToken: '11111111-1111-4111-8111-111111111111',
      state: 'COMPLETE',
    };
    const sourceAttempts = {
      begin1688: vi.fn().mockResolvedValue({ ...terminal, state: 'RUNNING' }),
      complete1688: vi.fn().mockResolvedValue(terminal),
      fail1688: vi.fn().mockResolvedValue({ ...terminal, state: 'FAILED' }),
    };
    const controller = new SourcingBrowserSourceAttemptController(sourceAttempts as never);

    const begun = await controller.begin1688(
      ORGANIZATION_ID,
      { id: '00000000-0000-4000-8000-000000000002' } as never,
      'request-key',
    );
    const completed = await controller.complete1688(
      ATTEMPT_ID,
      terminal.attemptToken,
      { keywords: [], errors: [] },
      ORGANIZATION_ID,
    );
    const failed = await controller.fail1688(
      ATTEMPT_ID,
      terminal.attemptToken,
      { code: 'FAILED', message: 'failed' },
      ORGANIZATION_ID,
    );

    expect(begun).toHaveProperty('attemptToken', terminal.attemptToken);
    expect(completed).not.toHaveProperty('attemptToken');
    expect(failed).not.toHaveProperty('attemptToken');
  });
});
