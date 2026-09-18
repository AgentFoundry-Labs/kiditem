import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  availabilityOutcome,
  canSendMallAvailability,
  sendMallAvailability,
  type MallAvailabilitySendResult,
} from './mall-availability-send';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-bridge', () => bridge);

const result = (overrides: Partial<MallAvailabilitySendResult> = {}): MallAvailabilitySendResult => ({
  sent: 3,
  failed: 0,
  requestOnly: false,
  confirmed: null,
  warnings: [],
  ...overrides,
});

/**
 * 품절 송신 결과 → 관찰 기록. 보냈다(`sent`)는 것은 성공이 아니다. 몰을 다시 읽어 보낸 것이 전부 원하는 상태로
 * 확인된 것만 성공이다(도매꾹은 보낸 뒤 목록을 다시 읽는다).
 */
describe('품절 송신 결과', () => {
  it('⭐ 몰을 다시 읽어 전부 확인됐을 때만 성공이다', () => {
    expect(availabilityOutcome(result({ confirmed: 3 }))).toEqual({ outcome: 'succeeded', reasonCode: 'mall_rechecked' });
    expect(availabilityOutcome(result({ confirmed: 2 }))).toEqual({ outcome: 'attention', reasonCode: 'awaiting_mall_recheck' });
  });

  it('다시 읽지 않는 몰은 보냈어도 확인 대기다', () => {
    expect(availabilityOutcome(result())).toEqual({ outcome: 'attention', reasonCode: 'awaiting_mall_recheck' });
  });

  it('승인이 붙는 몰(온채널)은 확인이 있어도 승인 대기다', () => {
    expect(availabilityOutcome(result({ requestOnly: true, confirmed: 3 })))
      .toEqual({ outcome: 'attention', reasonCode: 'awaiting_mall_approval' });
  });

  it('하나라도 못 보냈으면 실패다', () => {
    expect(availabilityOutcome(result({ failed: 1, confirmed: 3 })))
      .toEqual({ outcome: 'failed', reasonCode: 'awaiting_mall_recheck' });
  });

  it('보낸 것이 없으면 확인 수로 성공을 만들지 않는다', () => {
    expect(availabilityOutcome(result({ sent: 0, confirmed: 0 }))).toEqual({ outcome: 'attention', reasonCode: 'awaiting_mall_recheck' });
  });

  it('도매꾹 · 쿠팡 윙은 품절을 보낼 수 있는 몰이다', () => {
    expect(canSendMallAvailability('domeggook')).toBe(true);
    expect(canSendMallAvailability('coupang')).toBe(true);
    expect(canSendMallAvailability('icecream-mall')).toBe(false);
  });
});

type ExtensionMessage = { codes: string[]; options?: Record<string, string[]>; resume: boolean };

const codes = (count: number) => Array.from({ length: count }, (_, index) => String(15000000000 + index));

/**
 * 쿠팡 윙은 상품마다 윙을 세 번 부른다. 253개를 한 번에 넘기면 3분 안에 안 끝나 웹이 먼저 포기했다(2026-09-18:
 * 20개쯤 보내고 멈춤). 10개씩 나눠 보내고, 합친 결과를 한 번에 말한다.
 */
describe('쿠팡 윙 품절 나눠 보내기', () => {
  beforeEach(() => {
    bridge.detectOrderCollectionExtensionId.mockReset().mockResolvedValue('ext');
    bridge.sendToExtension.mockReset().mockImplementation(async (_id: string, message: ExtensionMessage) => ({
      success: true,
      sent: message.codes.length,
      failed: 0,
      confirmed: message.codes.length,
      already: 1,
      rocket: 0,
      warnings: [],
    }));
  });

  it('⭐ 10개씩 나눠 보내고 진행을 알리며, 합친 결과를 한 줄로 말한다', async () => {
    const products = codes(23);
    const optionCodes = Object.fromEntries(products.map((code, index) => [code, [`9${index}`]]));
    const progress: string[] = [];

    const result = await sendMallAvailability('coupang', products, {
      optionCodes,
      onProgress: (done, total) => progress.push(`${done}/${total}`),
    });

    const sentCodes = bridge.sendToExtension.mock.calls.map(([, message]) => (message as ExtensionMessage).codes);
    expect(sentCodes.map((chunk) => chunk.length)).toEqual([10, 10, 3]);
    expect(sentCodes.flat()).toEqual(products);
    // 묶음마다 그 묶음의 옵션만 싣는다.
    const second = bridge.sendToExtension.mock.calls[1][1] as ExtensionMessage;
    expect(Object.keys(second.options ?? {})).toEqual(products.slice(10, 20));
    expect(progress).toEqual(['10/23', '20/23', '23/23']);
    expect(result).toEqual({
      sent: 23,
      failed: 0,
      requestOnly: false,
      confirmed: 23,
      warnings: ['3개 옵션은 이미 재고 0이었습니다.'],
    });
  });

  it('몰이 막아 멈추면(429) 남은 묶음은 보내지 않고 남은 옵션을 실패로 센다', async () => {
    bridge.sendToExtension.mockReset()
      .mockResolvedValueOnce({ success: true, sent: 10, failed: 0, confirmed: 10, warnings: [] })
      .mockResolvedValueOnce({
        success: true, sent: 4, failed: 6, confirmed: 4, stopped: 'rate_limited',
        warnings: ['쿠팡 윙이 요청을 잠시 막았습니다(HTTP 429). 상품 6개는 보내지 못했습니다 — 몇 분 뒤 다시 보내세요.'],
      });

    const result = await sendMallAvailability('coupang', codes(35));

    expect(bridge.sendToExtension).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(14);
    expect(result.failed).toBe(6 + 15);
    expect(availabilityOutcome(result).outcome).toBe('failed');
  });

  it('도중에 끊겨도 앞에서 보낸 것은 버리지 않고 멈춘 자리를 말한다', async () => {
    bridge.sendToExtension.mockReset()
      .mockResolvedValueOnce({ success: true, sent: 10, failed: 0, confirmed: 10, warnings: [] })
      .mockResolvedValueOnce({ success: false, error: '쿠팡 윙 로그인이 풀렸습니다. 로그인한 뒤 다시 보내세요.' });

    const result = await sendMallAvailability('coupang', codes(25));

    expect(result.sent).toBe(10);
    expect(result.failed).toBe(15);
    expect(result.warnings).toEqual([
      '25개 중 10개까지 보내고 멈췄습니다 — 쿠팡 윙 로그인이 풀렸습니다. 로그인한 뒤 다시 보내세요.',
    ]);
  });

  it('첫 묶음부터 안 되면 그대로 실패를 알린다', async () => {
    bridge.sendToExtension.mockReset().mockResolvedValueOnce({ success: false, error: '쿠팡 윙에 로그인되어 있지 않습니다.' });
    await expect(sendMallAvailability('coupang', codes(3))).rejects.toThrow('쿠팡 윙에 로그인되어 있지 않습니다.');
  });

  it('나눠 보내지 않는 몰은 한 번에 넘긴다', async () => {
    await sendMallAvailability('domeggook', codes(40));
    expect(bridge.sendToExtension).toHaveBeenCalledTimes(1);
  });

  it('해제에서 이미 재고가 있던 옵션은 그렇게 말한다', async () => {
    const result = await sendMallAvailability('coupang', codes(2), { resume: true });
    expect(result.warnings).toEqual(['1개 옵션은 이미 재고가 있었습니다.']);
  });
});
