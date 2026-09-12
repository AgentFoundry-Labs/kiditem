import { describe, expect, it } from 'vitest';
import type { MallOperationOutcomeItem } from '@kiditem/shared/mall-operation-outcomes';
import {
  buildServerMallCollectionStats,
  describeServerMallCollection,
  type ServerMallCollectionStat,
} from './server-mall-collection-stats';

const TODAY = new Date(2026, 8, 14, 15, 0, 0);

function outcome(overrides: Partial<MallOperationOutcomeItem> = {}): MallOperationOutcomeItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    mallKey: 'onch',
    operation: 'order_collection',
    outcome: 'succeeded',
    reasonCode: null,
    message: null,
    itemCount: 12,
    failedCount: null,
    warningCount: null,
    trigger: 'manual',
    runId: null,
    occurredAt: new Date(2026, 8, 14, 10, 0, 0).toISOString(),
    ...overrides,
  };
}

describe('buildServerMallCollectionStats — 당일', () => {
  it('⭐ 오늘 마지막 성공 수집의 건수를 쓴다 — 다시 수집해도 두 번 세지 않는다', () => {
    const stats = buildServerMallCollectionStats(
      [
        outcome({ itemCount: 12, occurredAt: new Date(2026, 8, 14, 10).toISOString() }),
        outcome({ itemCount: 12, occurredAt: new Date(2026, 8, 14, 13).toISOString() }),
      ],
      TODAY,
    );
    expect(stats.get('onch')).toMatchObject({ orderRows: 12, runs: 2 });
  });

  it('어제 수집은 오늘 숫자에 넣지 않는다', () => {
    const stats = buildServerMallCollectionStats(
      [outcome({ occurredAt: new Date(2026, 8, 13, 17).toISOString() })],
      TODAY,
    );
    expect(stats.size).toBe(0);
  });

  it('⭐ 마지막이 실패 · 로그인 필요면 그 결과를 남기고 건수는 마지막 성공분을 지킨다', () => {
    const stats = buildServerMallCollectionStats(
      [
        outcome({ itemCount: 8, occurredAt: new Date(2026, 8, 14, 9).toISOString() }),
        outcome({
          outcome: 'attention',
          reasonCode: 'login_required',
          itemCount: null,
          occurredAt: new Date(2026, 8, 14, 14).toISOString(),
        }),
      ],
      TODAY,
    );
    expect(stats.get('onch')).toMatchObject({ orderRows: 8, latestOutcome: 'attention', runs: 2 });
  });

  it('빈 수집(신규 주문 없음)은 0건으로 선다 — 수집이 돌았다는 사실은 남는다', () => {
    const stats = buildServerMallCollectionStats(
      [outcome({ outcome: 'empty', itemCount: null, reasonCode: 'no_new_orders' })],
      TODAY,
    );
    expect(stats.get('onch')).toMatchObject({ orderRows: 0, latestOutcome: 'empty', runs: 1 });
  });

  it('로그인 확인 · 송장 기록은 수집으로 세지 않는다', () => {
    const stats = buildServerMallCollectionStats(
      [outcome({ operation: 'login_check' }), outcome({ operation: 'tracking_upload' })],
      TODAY,
    );
    expect(stats.size).toBe(0);
  });
});

describe('buildServerMallCollectionStats — 신규(미전송)', () => {
  const transfer = (itemCount: number, hour: number) =>
    outcome({
      operation: 'sellpia_transfer',
      reasonCode: 'transmission_requested',
      itemCount,
      occurredAt: new Date(2026, 8, 14, hour).toISOString(),
    });

  it('⭐ 신규 = 오늘 수집 − 오늘 셀피아 전송. 나눠 보낸 전송은 합산한다', () => {
    const stats = buildServerMallCollectionStats(
      [outcome({ itemCount: 12 }), transfer(5, 11), transfer(4, 12)],
      TODAY,
    );
    expect(stats.get('onch')).toMatchObject({ orderRows: 12, sentRows: 9, newRows: 3 });
  });

  it('다 보냈으면 신규는 0 이고, 더 보내도 음수가 되지 않는다', () => {
    const stats = buildServerMallCollectionStats(
      [outcome({ itemCount: 6 }), transfer(6, 11), transfer(6, 13)],
      TODAY,
    );
    expect(stats.get('onch')).toMatchObject({ sentRows: 12, newRows: 0 });
  });

  it('제출되지 않은 전송(succeeded 아님)은 보낸 것으로 세지 않는다', () => {
    const stats = buildServerMallCollectionStats(
      [
        outcome({ itemCount: 7 }),
        outcome({
          operation: 'sellpia_transfer',
          outcome: 'cancelled',
          itemCount: 7,
          occurredAt: new Date(2026, 8, 14, 12).toISOString(),
        }),
      ],
      TODAY,
    );
    expect(stats.get('onch')).toMatchObject({ sentRows: 0, newRows: 7 });
  });
});

describe('describeServerMallCollection — 카드에 뭐라고 적히나', () => {
  const stat = (overrides: Partial<ServerMallCollectionStat> = {}): ServerMallCollectionStat => ({
    mallKey: 'icecream-mall',
    orderRows: 0,
    sentRows: 0,
    newRows: 0,
    latestAt: Date.parse('2026-09-14T06:32:13.000Z'),
    latestOutcome: 'succeeded',
    latestReasonCode: null,
    latestMessage: null,
    normalToday: false,
    runs: 1,
    ...overrides,
  });

  it('⭐ 오늘 이미 받아 둔 주문이 있는데 마지막 시도만 실패하면 "마지막 수집 실패"라고 적는다', () => {
    // 받아 둔 4건은 그대로 있는데 "수집 실패"라고만 적히면 주문이 사라진 것처럼 읽힌다.
    expect(
      describeServerMallCollection(
        stat({
          orderRows: 4,
          latestOutcome: 'failed',
          latestMessage: '배송조회 화면은 열었지만 배송목록 표 머리글을 찾지 못했습니다.',
        }),
      ),
    ).toEqual({
      label: '마지막 수집 실패',
      tone: 'failed',
      detail: '배송조회 화면은 열었지만 배송목록 표 머리글을 찾지 못했습니다.',
    });
  });

  it('오늘 받아 둔 주문이 하나도 없이 실패면 그냥 "수집 실패"다', () => {
    expect(describeServerMallCollection(stat({ latestOutcome: 'failed' }))).toMatchObject({
      label: '수집 실패',
      tone: 'failed',
    });
  });

  it('로그인 필요와 인증 필요를 구분해 적는다 — 사람이 할 일이 다르다', () => {
    expect(
      describeServerMallCollection(
        stat({ latestOutcome: 'attention', latestReasonCode: 'login_required' }),
      ),
    ).toMatchObject({ label: '로그인 필요', tone: 'attention' });
    expect(
      describeServerMallCollection(
        stat({ latestOutcome: 'attention', latestReasonCode: 'operator_action_required' }),
      ),
    ).toMatchObject({ label: '인증 필요', tone: 'attention' });
  });

  /**
   * 해법몰: 여섯 번 연속 '신규 주문 없음'으로 잘 돌다가 마지막 한 번만 확장이 답을 안 줬는데
   * 카드는 '수집 실패'로 빨갛게 섰다. 몰도 로그인도 멀쩡한데 고장으로 읽힌다.
   */
  it('⭐ 오늘 잘 돌던 몰이 한 번 답을 못 받은 것은 실패가 아니다 — 다음 바퀴가 다시 묻는다', () => {
    expect(
      describeServerMallCollection(
        stat({
          latestOutcome: 'failed',
          latestReasonCode: 'extension_timeout',
          normalToday: true,
          latestMessage: '익스텐션 응답 시간이 초과되었습니다.',
        }),
      ),
    ).toMatchObject({ label: '응답 없음 · 다시 확인', tone: 'empty' });
  });

  it('하루 종일 답을 못 받고 있으면 그건 봐야 할 일이다', () => {
    expect(
      describeServerMallCollection(
        stat({ latestOutcome: 'failed', latestReasonCode: 'extension_timeout', normalToday: false }),
      ),
    ).toMatchObject({ label: '응답 없음', tone: 'failed' });
  });

  /** 몰 화면이 바뀌어 우리 수집기가 못 따라간 것 — 사람이 코드를 고쳐야 하는 진짜 신호다. */
  it('⭐ 수집기가 몰 화면을 못 따라간 것은 이름을 붙여 드러낸다', () => {
    expect(
      describeServerMallCollection(
        stat({
          latestOutcome: 'failed',
          latestReasonCode: 'provider_contract_changed',
          normalToday: true,
          latestMessage: 'GS샵 배송관리 화면에서 조회 버튼을 찾지 못했습니다.',
        }),
      ),
    ).toMatchObject({ label: '수집 로직 점검 필요', tone: 'failed' });
  });

  it('신규 주문이 없는 것은 실패가 아니다 — 빨갛게 세우지 않는다', () => {
    expect(describeServerMallCollection(stat({ latestOutcome: 'empty' }))).toMatchObject({
      label: '신규 주문 없음',
      tone: 'empty',
    });
  });
});

describe('buildServerMallCollectionStats — 오늘 제대로 돈 적이 있나', () => {
  it('⭐ 성공이든 빈 수집이든 정상으로 돈 적이 있으면 normalToday 로 남는다', () => {
    const stats = buildServerMallCollectionStats(
      [
        outcome({ outcome: 'empty', itemCount: null, occurredAt: new Date(2026, 8, 14, 10).toISOString() }),
        outcome({
          outcome: 'failed',
          reasonCode: 'extension_timeout',
          itemCount: null,
          occurredAt: new Date(2026, 8, 14, 14).toISOString(),
        }),
      ],
      TODAY,
    );
    expect(stats.get('onch')).toMatchObject({ normalToday: true, latestReasonCode: 'extension_timeout' });
  });

  it('하루 종일 실패만 했으면 normalToday 는 거짓이다', () => {
    const stats = buildServerMallCollectionStats(
      [outcome({ outcome: 'failed', reasonCode: 'extension_timeout', itemCount: null })],
      TODAY,
    );
    expect(stats.get('onch')).toMatchObject({ normalToday: false });
  });
});
