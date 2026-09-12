import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type {
  MallOperationOutcomeRepositoryPort,
  MallOperationOutcomeRow,
} from '../../port/out/repository/mall-operation-outcome.repository.port';
import { MallOperationOutcomeService } from '../mall-operation-outcome.service';

const ORG = '00000000-0000-4000-8000-000000000001';
const KEY = '11111111-1111-4111-8111-111111111111';

function row(overrides: Partial<MallOperationOutcomeRow> = {}): MallOperationOutcomeRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    mallKey: 'onch',
    operation: 'order_collection',
    outcome: 'succeeded',
    reasonCode: null,
    message: null,
    itemCount: 3,
    failedCount: null,
    warningCount: null,
    trigger: null,
    runId: null,
    occurredAt: new Date('2026-09-12T01:00:00.000Z'),
    ...overrides,
  };
}

function setup(overrides: Partial<MallOperationOutcomeRepositoryPort> = {}) {
  const repository: MallOperationOutcomeRepositoryPort = {
    record: vi.fn<MallOperationOutcomeRepositoryPort['record']>(async (input) =>
      row({ mallKey: input.mallKey, operation: input.operation, outcome: input.outcome }),
    ),
    listRecent: vi.fn<MallOperationOutcomeRepositoryPort['listRecent']>(async () => [row()]),
    countSince: vi.fn<MallOperationOutcomeRepositoryPort['countSince']>(async () => []),
    latestSince: vi.fn<MallOperationOutcomeRepositoryPort['latestSince']>(async () => []),
    ...overrides,
  };
  return { repository, service: new MallOperationOutcomeService(repository) };
}

describe('MallOperationOutcomeService', () => {
  it('records under the session organization and actor', async () => {
    const { repository, service } = setup();
    const item = await service.record(ORG, 'user-1', {
      idempotencyKey: KEY,
      mallKey: 'onch',
      operation: 'order_collection',
      outcome: 'failed',
      reasonCode: 'login_required',
    });

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        actorUserId: 'user-1',
        idempotencyKey: KEY,
        mallKey: 'onch',
        outcome: 'failed',
        reasonCode: 'login_required',
        message: null,
        itemCount: null,
      }),
    );
    expect(item.occurredAt).toBe('2026-09-12T01:00:00.000Z');
  });

  /** 매니페스트가 모르는 몰 키는 기억에 넣지 않는다. */
  it('⭐ rejects a mall the manifest does not know', async () => {
    const { repository, service } = setup();
    await expect(
      service.record(ORG, null, {
        idempotencyKey: KEY,
        mallKey: 'unknown-mall',
        operation: 'order_collection',
        outcome: 'succeeded',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.record).not.toHaveBeenCalled();
  });

  it('summarises the latest outcome and counts per mall and operation', async () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    const { repository, service } = setup({
      countSince: vi.fn<MallOperationOutcomeRepositoryPort['countSince']>(async () => [
        { mallKey: 'onch', operation: 'order_collection', outcome: 'succeeded', count: 5 },
        { mallKey: 'onch', operation: 'order_collection', outcome: 'failed', count: 2 },
        { mallKey: 'kidsnote', operation: 'login_test', outcome: 'attention', count: 1 },
      ]),
      latestSince: vi.fn<MallOperationOutcomeRepositoryPort['latestSince']>(async () => [
        row({ mallKey: 'onch', outcome: 'failed', reasonCode: 'login_required' }),
        row({ mallKey: 'kidsnote', operation: 'login_test', outcome: 'attention', reasonCode: 'no_credentials' }),
      ]),
    });

    const summary = await service.summary(ORG, 7, now);

    expect(repository.countSince).toHaveBeenCalledWith({ organizationId: ORG, since: new Date('2026-09-05T12:00:00.000Z') });
    expect(summary.total).toBe(8);
    expect(summary.rows).toEqual([
      expect.objectContaining({
        mallKey: 'onch',
        operation: 'order_collection',
        latest: expect.objectContaining({ outcome: 'failed', reasonCode: 'login_required' }),
        counts: { succeeded: 5, empty: 0, attention: 0, failed: 2, cancelled: 0 },
      }),
      expect.objectContaining({
        mallKey: 'kidsnote',
        operation: 'login_test',
        counts: { succeeded: 0, empty: 0, attention: 1, failed: 0, cancelled: 0 },
      }),
    ]);
  });

  it('lists recent outcomes with a default window', async () => {
    const { repository, service } = setup();
    const list = await service.listRecent(ORG, { mallKey: 'onch' });
    expect(repository.listRecent).toHaveBeenCalledWith({ organizationId: ORG, limit: 50, mallKey: 'onch' });
    expect(list.items).toHaveLength(1);
  });
});
