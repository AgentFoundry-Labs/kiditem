import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  availabilityOutcome,
  canReadMallAvailability,
  canSendMallAvailability,
  mallReadLagsAfterSend,
  readMallAvailability,
  sendMallAvailability,
  summarizeLiveAvailability,
  type MallAvailabilitySendResult,
} from './mall-availability-send';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
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

  it('도매꾹 · 쿠팡 윙 · 카카오 톡스토어 · 올웨이즈 · 아트공구 · 롯데ON 은 품절을 보낼 수 있는 몰이다', () => {
    expect(canSendMallAvailability('lotte-on')).toBe(true);
    expect(canSendMallAvailability('teacher-mall')).toBe(true);
    expect(canSendMallAvailability('domeggook')).toBe(true);
    expect(canSendMallAvailability('coupang')).toBe(true);
    expect(canSendMallAvailability('kakao')).toBe(true);
    expect(canSendMallAvailability('always')).toBe(true);
    expect(canSendMallAvailability('art09')).toBe(true);
    expect(canSendMallAvailability('icecream-mall')).toBe(true);
    expect(canSendMallAvailability('kidsnote')).toBe(true);
    expect(canSendMallAvailability('gs-shop')).toBe(false);
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

  it('칸에서 상품 하나를 누르면 그 몰 화면을 띄우라고(show) 함께 넘긴다', async () => {
    await sendMallAvailability('coupang', ['16340985357'], { show: true });
    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'ext',
      { action: 'sendMallAvailability', mallKey: 'coupang', codes: ['16340985357'], resume: false, show: true },
      180_000,
    );
    await sendMallAvailability('coupang', codes(2));
    expect((bridge.sendToExtension.mock.calls[1][1] as { show?: boolean }).show).toBeUndefined();
  });

  it('상품 하나를 띄워 보낸 결과에 상품목록에 보였는지가 실린다', async () => {
    bridge.sendToExtension.mockReset().mockResolvedValueOnce({ success: true, sent: 1, failed: 0, confirmed: 1, listShown: false, warnings: [] });
    const result = await sendMallAvailability('coupang', ['16340985357'], { show: true });
    expect(result.listShown).toBe(false);
    bridge.sendToExtension.mockReset().mockResolvedValueOnce({ success: true, sent: 1, failed: 0, confirmed: 1, warnings: [] });
    expect('listShown' in (await sendMallAvailability('coupang', ['1']))).toBe(false);
  });

  it('해제에서 이미 재고가 있던 옵션은 그렇게 말한다', async () => {
    const result = await sendMallAvailability('coupang', codes(2), { resume: true });
    expect(result.warnings).toEqual(['1개 옵션은 이미 재고가 있었습니다.']);
  });
});

/**
 * 쿠팡 윙 지금 재고. 품절은 재고 0 이고, 판매상태(ON_SALE)와 다르다. 로켓그로스 옵션은 쿠팡 재고라 세지 않는다.
 */
describe('몰 지금 재고', () => {
  beforeEach(() => {
    bridge.detectOrderCollectionExtensionId.mockReset().mockResolvedValue('ext');
    bridge.sendToExtension.mockReset();
  });

  it('쿠팡 윙 · 카카오 톡스토어 · 올웨이즈 · 아트공구 · 롯데ON 은 지금 재고를 읽는다', () => {
    expect(canReadMallAvailability('lotte-on')).toBe(true);
    expect(canReadMallAvailability('kkomangse')).toBe(true);
    expect(canReadMallAvailability('teacher-mall')).toBe(true);
    expect(canReadMallAvailability('coupang')).toBe(true);
    expect(canReadMallAvailability('kakao')).toBe(true);
    expect(canReadMallAvailability('always')).toBe(true);
    expect(canReadMallAvailability('art09')).toBe(true);
    expect(canReadMallAvailability('icecream-mall')).toBe(true);
    expect(canReadMallAvailability('kidsnote')).toBe(true);
    expect(canReadMallAvailability('domeggook')).toBe(false);
  });

  it('재고 수를 주지 않는 몰(올웨이즈)은 판매중이면 "판매 가능"만 말한다', () => {
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: null, rocket: false }])).toEqual({ tone: 'on_sale', label: '판매 가능' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }])).toEqual({ tone: 'sold_out', label: '품절 · 재고 0' });
    // 품절인지만 주는 몰은 '재고 0' 이라고 적지 않는다 — 판매안함(아트공구)은 재고가 0 인 것이 아니다.
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], 'art09')).toEqual({ tone: 'sold_out', label: '품절' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], 'always')).toEqual({ tone: 'sold_out', label: '품절' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], 'lotte-on')).toEqual({ tone: 'sold_out', label: '품절' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], 'icecream-mall')).toEqual({ tone: 'sold_out', label: '품절' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], 'kidsnote')).toEqual({ tone: 'sold_out', label: '품절' });
  });

  it('롯데ON 은 보낸 직후 다시 읽지 않는다 — 조회가 옛 판매상태를 섞어 준다', () => {
    expect(mallReadLagsAfterSend('lotte-on')).toBe(true);
    expect(mallReadLagsAfterSend('coupang')).toBe(false);
    expect(mallReadLagsAfterSend('art09')).toBe(false);
  });

  it('⭐ 확장에 읽기만 부탁하고 그 상품의 옵션 재고를 돌려준다', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      products: [{ code: '16340985357', options: [{ optionCode: '95903875495', stock: 0, rocket: false }] }],
      missing: [],
    });
    await expect(readMallAvailability('coupang', '16340985357')).resolves.toEqual([
      { optionCode: '95903875495', stock: 0, rocket: false },
    ]);
    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'ext',
      { action: 'readMallAvailability', mallKey: 'coupang', codes: ['16340985357'] },
      90_000,
    );
  });

  it('옛 확장이면 새로고침하라고 말한다', async () => {
    bridge.sendToExtension.mockRejectedValue(new Error('The message port closed before a response was received.'));
    await expect(readMallAvailability('coupang', '1')).rejects.toThrow(/확장을 새로고침하세요/);
  });

  it('몰에 없는 상품이면 그렇게 말한다', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, products: [], missing: ['1'] });
    await expect(readMallAvailability('coupang', '1')).rejects.toThrow('이 상품을 몰에서 찾지 못했습니다.');
  });

  it('재고 0 이면 품절, 일부면 몇 개 품절, 아니면 판매 가능이다', () => {
    const option = (stock: number, rocket = false) => ({ optionCode: String(stock), stock, rocket });
    expect(summarizeLiveAvailability([option(0)])).toEqual({ tone: 'sold_out', label: '품절 · 재고 0' });
    expect(summarizeLiveAvailability([option(0), option(0)])).toEqual({ tone: 'sold_out', label: '품절 · 옵션 2개 모두 재고 0' });
    expect(summarizeLiveAvailability([option(0), option(5)])).toEqual({ tone: 'partial', label: '옵션 2개 중 1개 품절' });
    expect(summarizeLiveAvailability([option(1861)])).toEqual({ tone: 'on_sale', label: '판매 가능 · 재고 1,861' });
    expect(summarizeLiveAvailability([option(3), option(5)])).toEqual({ tone: 'on_sale', label: '판매 가능 · 옵션 2개 재고 있음' });
    expect(summarizeLiveAvailability([option(0, true)]).tone).toBe('rocket');
    expect(summarizeLiveAvailability([option(0), option(9, true)])).toEqual({ tone: 'sold_out', label: '품절 · 재고 0' });
  });
});

/**
 * 1.2.16 전 확장은 꼬망세를 페이지 전체(2,602줄) 재저장으로 보냈고, 재개 때 재고 칸에 "{stock}" 글자를 넣었다.
 * 새 방식([개별수정])을 아는 확장이 아니면 꼬망세는 보내지 않는다.
 */
describe('꼬망세는 새 방식을 아는 확장으로만 보낸다', () => {
  beforeEach(() => {
    bridge.detectOrderCollectionExtensionId.mockReset().mockResolvedValue('ext');
    bridge.detectOrderCollectionExtensionRuntime.mockReset();
    bridge.sendToExtension.mockReset().mockResolvedValue({ success: true, sent: 1, failed: 0, confirmed: 1, warnings: [] });
  });

  it('⭐ 옛 확장이면 보내지 않고 새로고침하라고 말한다', async () => {
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({
      status: 'incompatible', extensionId: 'ext', version: '1.2.10', missingCapabilities: ['mallAvailabilityKkomangseDirectV1'],
    });
    await expect(sendMallAvailability('kkomangse', ['M0450-U7839-J6532'], { resume: true }))
      .rejects.toThrow(/1\.2\.10.*새로고침/);
    expect(bridge.detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(1200, ['mallAvailabilityKkomangseDirectV1']);
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });

  it('아이스크림몰도 새 방식(판매상태 일괄변경)을 아는 확장으로만 보낸다', async () => {
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({
      status: 'incompatible', extensionId: 'ext', version: '1.2.17', missingCapabilities: ['mallAvailabilityIcecreamSaleStateV1'],
    });
    await expect(sendMallAvailability('icecream-mall', ['11411122'])).rejects.toThrow(/1\.2\.17.*새로고침/);
    expect(bridge.detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(1200, ['mallAvailabilityIcecreamSaleStateV1']);
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });

  it('새 확장이면 보내고, 다른 몰은 이 확인을 하지 않는다', async () => {
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({ status: 'ready', extensionId: 'ext', version: '1.2.16' });
    await sendMallAvailability('kkomangse', ['M0450-U7839-J6532']);
    expect(bridge.sendToExtension).toHaveBeenCalledTimes(1);
    bridge.detectOrderCollectionExtensionRuntime.mockClear();
    await sendMallAvailability('domeggook', ['12345678']);
    expect(bridge.detectOrderCollectionExtensionRuntime).not.toHaveBeenCalled();
  });
});
