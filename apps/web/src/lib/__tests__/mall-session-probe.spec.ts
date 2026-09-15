import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDetectRuntime = vi.hoisted(() => vi.fn());
const mockSend = vi.hoisted(() => vi.fn());

const mockSummary = vi.hoisted(() => vi.fn());
const mockRecord = vi.hoisted(() => vi.fn());

vi.mock('../extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: mockDetectRuntime,
  sendToExtension: mockSend,
}));

vi.mock('../mall-operation-outcomes-api', () => ({
  mallOperationOutcomesApi: { summary: mockSummary },
  recordMallOperationOutcome: mockRecord,
}));

import { detectMallSessionProbe, probeMallSession, sweepMallSessions } from '../mall-session-probe';

describe('detectMallSessionProbe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for the session probe capability and separates outdated from missing', async () => {
    mockDetectRuntime.mockResolvedValueOnce({ status: 'ready', extensionId: 'ext', version: '1.0.84' });
    await expect(detectMallSessionProbe()).resolves.toEqual({ status: 'ready', extensionId: 'ext' });
    expect(mockDetectRuntime).toHaveBeenCalledWith(1500, ['mallSessionProbeV1']);

    mockDetectRuntime.mockResolvedValueOnce({
      status: 'incompatible',
      extensionId: 'ext',
      version: '1.0.83',
      missingCapabilities: ['mallSessionProbeV1'],
    });
    await expect(detectMallSessionProbe()).resolves.toEqual({ status: 'outdated', version: '1.0.83' });

    mockDetectRuntime.mockResolvedValueOnce({ status: 'not_found' });
    await expect(detectMallSessionProbe()).resolves.toEqual({ status: 'not_found' });
  });
});

describe('probeMallSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends only the mall key and keeps the verdict', async () => {
    mockSend.mockResolvedValueOnce({ success: true, mallKey: 'onch', state: 'signed_out', reason: 'login_page' });
    const result = await probeMallSession('ext', 'onch');
    expect(mockSend).toHaveBeenCalledWith('ext', { action: 'probeMallSession', mallKey: 'onch' }, 20_000);
    expect(result).toMatchObject({ mallKey: 'onch', state: 'signed_out', reason: 'login_page' });
  });

  /** 확장이 뭘 돌려주든 모르는 값은 '확인 불가'다. 실패해도 던지지 않는다. */
  it('⭐ turns anything unexpected into unknown, never throws', async () => {
    mockSend.mockResolvedValueOnce({ success: true, state: 'maybe', reason: 'http://x?token=1' });
    await expect(probeMallSession('ext', 'kidsnote')).resolves.toMatchObject({ state: 'unknown', reason: null });
    mockSend.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    await expect(probeMallSession('ext', 'kidsnote')).resolves.toMatchObject({
      state: 'unknown',
      reason: 'extension_error',
    });
  });
});

describe('sweepMallSessions — 이번 바퀴에 건너뛸 몰', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSummary.mockResolvedValue({ rows: [] });
    mockRecord.mockResolvedValue(undefined);
  });

  /**
   * 로그인이 안 된 몰을 그냥 수집하면 로그인 화면만 열고 실패하면서 몰 탭이 하나 남는다.
   * 그 탭이 바퀴마다 쌓이면 멀쩡한 몰까지 '익스텐션 응답 시간이 초과'로 끌려 내려간다.
   */
  it('⭐ 로그인 필요로 확인된 몰만 건너뛸 목록에 담는다 — 확인 불가는 담지 않는다', async () => {
    mockDetectRuntime.mockResolvedValueOnce({ status: 'ready', extensionId: 'ext', version: '1.0.85' });
    const states: Record<string, string> = {
      onch: 'signed_in',
      art09: 'signed_out',
      kidsnote: 'signed_out',
      kidkids: 'unknown',
    };
    mockSend.mockImplementation((_id: string, message: { mallKey: string }) =>
      Promise.resolve({ success: true, mallKey: message.mallKey, state: states[message.mallKey] }),
    );

    const sweep = await sweepMallSessions(['onch', 'art09', 'kidsnote', 'kidkids']);

    expect(sweep).toMatchObject({ checked: 4, signedIn: 1, signedOut: 2, unknown: 1 });
    expect([...sweep.signedOutKeys].sort()).toEqual(['art09', 'kidsnote']);
  });

  it('확장이 없으면 아무 몰도 건드리지 않고 빈 목록을 돌려준다', async () => {
    mockDetectRuntime.mockResolvedValueOnce({ status: 'not_found' });
    await expect(sweepMallSessions(['onch'])).resolves.toEqual({
      checked: 0,
      signedIn: 0,
      signedOut: 0,
      unknown: 0,
      signedOutKeys: [],
    });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
