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
    operation: 'login_check',
    outcome: 'succeeded',
    reasonCode: null,
    message: null,
    itemCount: null,
    failedCount: null,
    warningCount: null,
    occurredAt: new Date('2026-09-12T01:00:00.000Z'),
    ...overrides,
  };
}

function setup(overrides: Partial<MallOperationOutcomeRepositoryPort> = {}) {
  const repository: MallOperationOutcomeRepositoryPort = {
    record: vi.fn<MallOperationOutcomeRepositoryPort['record']>(async (input) =>
      row({ mallKey: input.mallKey, operation: input.operation, outcome: input.outcome }),
    ),
    readSummary: vi.fn<MallOperationOutcomeRepositoryPort['readSummary']>(async () => ({
      counts: [],
      latest: [],
    })),
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
      operation: 'login_test',
      outcome: 'failed',
      reasonCode: 'login_required',
    });

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        actorUserId: 'user-1',
        idempotencyKey: KEY,
        mallKey: 'onch',
        operation: 'login_test',
        outcome: 'failed',
        reasonCode: 'login_required',
        message: null,
        itemCount: null,
      }),
    );
    expect(item.occurredAt).toBe('2026-09-12T01:00:00.000Z');
  });

  /** 매니페스트가 모르는 몰 키는 기록에 넣지 않는다. */
  it('⭐ rejects a mall the manifest does not know', async () => {
    const { repository, service } = setup();
    await expect(
      service.record(ORG, null, {
        idempotencyKey: KEY,
        mallKey: 'unknown-mall',
        operation: 'login_check',
        outcome: 'succeeded',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.record).not.toHaveBeenCalled();
  });

  /**
   * 쿠팡직배송은 로켓 계정 행을 함께 쓴다. 관찰 기록도 그 행 하나에 모여야 화면이 로그인 상태를
   * 한 줄로 읽는다 — 매니페스트 확인은 보낸 키 그대로 한다(둘 다 아는 몰이다).
   */
  it('⭐ folds a shared-account mall onto the row it shares', async () => {
    const { repository, service } = setup();
    const item = await service.record(ORG, 'user-1', {
      idempotencyKey: KEY,
      mallKey: 'coupang-direct',
      operation: 'login_check',
      outcome: 'succeeded',
      reasonCode: 'session_alive',
    });

    expect(repository.record).toHaveBeenCalledWith(expect.objectContaining({ mallKey: 'rocket' }));
    expect(item.mallKey).toBe('rocket');
  });

  /**
   * 몰이 돌려준 문장에는 아이디 · 주문번호가 섞여 들어온다("아이디(abc123)가 존재하지
   * 않습니다"). 무슨 일인지는 이유 코드가 말하므로 글은 저장하지 않는다 — 웹이 넘기더라도
   * 표의 주인인 여기서 버린다.
   */
  it('⭐ drops the message when a reason code already says what happened', async () => {
    const { repository, service } = setup();
    await service.record(ORG, 'user-1', {
      idempotencyKey: KEY,
      mallKey: 'kidsnote',
      operation: 'login_test',
      outcome: 'failed',
      reasonCode: 'credentials_rejected',
      message: '키즈노트: 아이디(abc123)가 존재하지 않습니다',
    });

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'credentials_rejected', message: null }),
    );
    expect(JSON.stringify(vi.mocked(repository.record).mock.calls)).not.toContain('abc123');
  });

  /** 이유 코드가 없으면 그 한 줄이 무슨 일인지 말하는 유일한 것이라 그대로 둔다. */
  it('keeps a short summary when no reason code says what happened', async () => {
    const { repository, service } = setup();
    await service.record(ORG, null, {
      idempotencyKey: KEY,
      mallKey: 'onch',
      operation: 'registration_fill',
      outcome: 'succeeded',
      message: '12건 채움',
    });

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: null, message: '12건 채움' }),
    );
  });

  it('summarises the latest outcome and counts per mall and operation', async () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    const { repository, service } = setup({
      readSummary: vi.fn<MallOperationOutcomeRepositoryPort['readSummary']>(async () => ({
        counts: [
          { mallKey: 'onch', operation: 'login_check', outcome: 'succeeded', count: 5 },
          { mallKey: 'onch', operation: 'login_check', outcome: 'attention', count: 2 },
          { mallKey: 'kidsnote', operation: 'login_test', outcome: 'attention', count: 1 },
        ],
        latest: [
          row({ mallKey: 'onch', outcome: 'attention', reasonCode: 'login_required' }),
          row({ mallKey: 'kidsnote', operation: 'login_test', outcome: 'attention', reasonCode: 'no_credentials' }),
        ],
      })),
    });

    const summary = await service.summary(ORG, 7, now);

    // 7 Korean calendar days including today (KST 2026-09-12 21:00) start at KST 09-06 00:00.
    expect(repository.readSummary).toHaveBeenCalledWith({ organizationId: ORG, since: new Date('2026-09-05T15:00:00.000Z') });
    expect(summary.total).toBe(8);
    expect(summary.rows).toEqual([
      expect.objectContaining({
        mallKey: 'onch',
        operation: 'login_check',
        latest: expect.objectContaining({ outcome: 'attention', reasonCode: 'login_required' }),
        counts: { succeeded: 5, empty: 0, attention: 2, failed: 0, cancelled: 0 },
      }),
      expect.objectContaining({
        mallKey: 'kidsnote',
        operation: 'login_test',
        counts: { succeeded: 0, empty: 0, attention: 1, failed: 0, cancelled: 0 },
      }),
    ]);
  });

  it('starts a one-day summary at KST midnight so yesterday morning stays out', async () => {
    const { repository, service } = setup();
    // KST 2026-09-12 09:30 — a rolling 24 hours would reach back into KST 09-11.
    const summary = await service.summary(ORG, 1, new Date('2026-09-12T00:30:00.000Z'));

    expect(repository.readSummary).toHaveBeenCalledWith({ organizationId: ORG, since: new Date('2026-09-11T15:00:00.000Z') });
    expect(summary.since).toBe('2026-09-11T15:00:00.000Z');
  });
});
