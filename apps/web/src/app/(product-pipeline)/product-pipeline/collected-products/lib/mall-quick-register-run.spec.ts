import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  domeggookAdapter,
  elevenStAdapter,
  kidsnoteAdapter,
} from '@/app/(channels)/_shared/adapters';
import {
  EMPTY_MALL_REGISTER_VALUES,
  mallRegisterValuesWithDefaults,
} from '@/app/(channels)/_shared/mall-register-values';
import type { MallSendOutcome } from '@/app/(channels)/_shared/mall-publish-adapter';
import {
  runMallRegistrations,
  runOneMallRegistration,
  summarizeMallRun,
} from './mall-quick-register-run';

/**
 * 몰 등록 실행기.
 *
 * 지키는 것 셋 —
 *  1. **한 번에 한 몰.** 폼 채움은 탭 하나를 점유한다. 동시에 돌리면 서로를 밟는다.
 *  2. **막힌 몰에서 멈추지 않는다.** 하나 때문에 전부 못 하면 '한번에 등록하기' 는
 *     쓸모가 없다.
 *  3. **막히면 확장을 부르지 않는다.** 반쯤 빈 폼이 열리면 사람이 그대로 제출한다.
 */

const item = { candidateId: 'c1', name: '할로윈 LED 거미줄', salePrice: 3500, thumbnailUrl: null };

const filled = (categoryPath = '문구/사무용품>디자인/팬시용품>기능성 팬시') => {
  const values = mallRegisterValuesWithDefaults(EMPTY_MALL_REGISTER_VALUES);
  values.byMall['11st'] = { ...values.byMall['11st'], categoryPath };
  return values;
};

const ok = (): MallSendOutcome => ({
  ok: true, confirmed: false, manualSteps: ['열린 탭에서 확인하세요.'], warnings: [],
});

afterEach(() => { vi.restoreAllMocks(); });

describe('몰 하나 실행', () => {
  it('폼을 채우면 채웠다고만 말한다 — 등록은 사람이 한다', async () => {
    const send = vi.spyOn(kidsnoteAdapter, 'send').mockResolvedValue(ok());
    const outcome = await runOneMallRegistration('kidsnote', item, filled());
    expect(outcome.status).toBe('filled');
    expect(outcome.message).toContain('직접 등록');
    expect(outcome.manualSteps).toContain('열린 탭에서 확인하세요.');
    expect(send).toHaveBeenCalledOnce();
  });

  it('공통 값을 몰 값과 합쳐 넘긴다', async () => {
    const send = vi.spyOn(domeggookAdapter, 'send').mockResolvedValue(ok());
    const values = filled();
    values.shared = { ...values.shared, certNumber: 'CB065R1579-2008' };
    await runOneMallRegistration('domeggook', item, values);
    expect(send.mock.calls[0]![0].values.certNumber).toBe('CB065R1579-2008');
  });

  it('막힌 몰은 확장을 부르지 않는다', async () => {
    // 11번가 분류는 등록 후 바꾸기 어렵다. 비운 채로 열면 사람이 대충 고른다.
    const send = vi.spyOn(elevenStAdapter, 'send').mockResolvedValue(ok());
    const outcome = await runOneMallRegistration('11st', item, filled(''));
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('분류');
    expect(send).not.toHaveBeenCalled();
  });

  it('어댑터가 실패를 알리면 왜 못 했는지 남긴다', async () => {
    vi.spyOn(kidsnoteAdapter, 'send').mockResolvedValue({
      ok: false, confirmed: false, manualSteps: [], warnings: [], error: '확장프로그램이 필요합니다.',
    });
    const outcome = await runOneMallRegistration('kidsnote', item, filled());
    expect(outcome).toMatchObject({ status: 'failed', message: '확장프로그램이 필요합니다.' });
  });

  it('던진 예외도 결과의 한 줄로 접는다 — 실행기는 던지지 않는다', async () => {
    vi.spyOn(kidsnoteAdapter, 'send').mockRejectedValue(new Error('상세페이지를 먼저 확정하세요.'));
    const outcome = await runOneMallRegistration('kidsnote', item, filled());
    expect(outcome).toMatchObject({ status: 'failed', message: '상세페이지를 먼저 확정하세요.' });
  });

  it('상품이 없으면 막는다', async () => {
    const outcome = await runOneMallRegistration('kidsnote', null, filled());
    expect(outcome).toMatchObject({ status: 'blocked', message: '보낼 상품이 없습니다.' });
  });

  it('폼 방식이 아닌 몰은 이 흐름에 태우지 않는다', async () => {
    const outcome = await runOneMallRegistration('coupang', item, filled());
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('어댑터가 없습니다');
  });
});

describe('여러 몰 실행', () => {
  it('한 번에 하나씩 돈다 — 탭을 나눠 쓴다', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<MallSendOutcome>((resolve) => {
        setTimeout(() => { inFlight -= 1; resolve(ok()); }, 5);
      });
    };
    vi.spyOn(kidsnoteAdapter, 'send').mockImplementation(slow);
    vi.spyOn(domeggookAdapter, 'send').mockImplementation(slow);

    await runMallRegistrations({
      mallKeys: ['kidsnote', 'domeggook'],
      item,
      values: filled(),
    });
    expect(maxInFlight).toBe(1);
  });

  it('한 몰이 실패해도 나머지를 계속한다', async () => {
    vi.spyOn(kidsnoteAdapter, 'send').mockRejectedValue(new Error('열지 못했습니다.'));
    const domeggook = vi.spyOn(domeggookAdapter, 'send').mockResolvedValue(ok());

    const outcomes = await runMallRegistrations({
      mallKeys: ['kidsnote', 'domeggook'],
      item,
      values: filled(),
    });
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['failed', 'filled']);
    expect(domeggook).toHaveBeenCalledOnce();
  });

  it('시작과 끝을 순서대로 알린다 — 화면이 어느 몰이 도는지 보여 준다', async () => {
    vi.spyOn(kidsnoteAdapter, 'send').mockResolvedValue(ok());
    vi.spyOn(domeggookAdapter, 'send').mockResolvedValue(ok());
    const events: string[] = [];

    await runMallRegistrations({
      mallKeys: ['kidsnote', 'domeggook'],
      item,
      values: filled(),
      onStart: (mallKey) => events.push(`start:${mallKey}`),
      onOutcome: (outcome) => events.push(`done:${outcome.mallKey}`),
    });
    expect(events).toEqual(['start:kidsnote', 'done:kidsnote', 'start:domeggook', 'done:domeggook']);
  });

  it('보낼 몰이 없으면 아무것도 하지 않는다', async () => {
    const send = vi.spyOn(kidsnoteAdapter, 'send').mockResolvedValue(ok());
    expect(await runMallRegistrations({ mallKeys: [], item, values: filled() })).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('결과 요약', () => {
  const outcome = (mallName: string, status: 'filled' | 'failed', message = '') =>
    ({ mallKey: mallName, mallName, status, message, manualSteps: [] });

  it('전부 성공하면 제출하지 않았다고 말한다', () => {
    const summary = summarizeMallRun([outcome('키즈노트', 'filled'), outcome('도매꾹', 'filled')]);
    expect(summary).toMatchObject({ filled: 2, title: '2개 몰 폼을 채웠어요' });
    expect(summary.description).toContain('제출은 하지 않았습니다');
  });

  it('일부 실패하면 어느 몰이 왜 실패했는지 남긴다', () => {
    const summary = summarizeMallRun([
      outcome('키즈노트', 'filled'),
      outcome('11번가', 'failed', '분류를 입력하세요.'),
    ]);
    expect(summary.title).toBe('1개 몰은 채우고 1개는 못 채웠어요');
    expect(summary.description).toBe('11번가: 분류를 입력하세요.');
  });

  it('전부 실패하면 그렇게 말한다', () => {
    const summary = summarizeMallRun([outcome('11번가', 'failed', '분류를 입력하세요.')]);
    expect(summary).toMatchObject({ filled: 0, title: '폼을 채우지 못했어요' });
  });
});
