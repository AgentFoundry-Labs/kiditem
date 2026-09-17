import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MallOperationOutcomeSummaryRow } from '@kiditem/shared/mall-operation-outcomes';

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

import {
  detectMallSessionProbe,
  loginCheckRecord,
  probeMallSession,
  shouldRememberLogin,
  sweepMallSessions,
} from '../mall-session-probe';

describe('detectMallSessionProbe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for the three-state login check and separates outdated from missing', async () => {
    mockDetectRuntime.mockResolvedValueOnce({ status: 'ready', extensionId: 'ext', version: '1.0.96' });
    await expect(detectMallSessionProbe()).resolves.toEqual({ status: 'ready', extensionId: 'ext' });
    expect(mockDetectRuntime).toHaveBeenCalledWith(1500, ['mallLoginCheckV2']);

    mockDetectRuntime.mockResolvedValueOnce({
      status: 'incompatible',
      extensionId: 'ext',
      version: '1.0.95',
      missingCapabilities: ['mallLoginCheckV2'],
    });
    await expect(detectMallSessionProbe()).resolves.toEqual({ status: 'outdated', version: '1.0.95' });

    mockDetectRuntime.mockResolvedValueOnce({ status: 'not_found' });
    await expect(detectMallSessionProbe()).resolves.toEqual({ status: 'not_found' });
  });
});

describe('probeMallSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the mall key and its saved site address, and keeps the verdict', async () => {
    mockSend.mockResolvedValueOnce({ success: true, mallKey: 'always', state: 'signed_out', reason: 'login_page' });
    const result = await probeMallSession('ext', 'always', 'https://alwayzseller.ilevit.com/login');
    expect(mockSend).toHaveBeenCalledWith(
      'ext',
      { action: 'checkMallLogin', mallKey: 'always', siteUrl: 'https://alwayzseller.ilevit.com/login' },
      45_000,
    );
    expect(result).toMatchObject({ mallKey: 'always', state: 'signed_out', reason: 'login_page' });
  });

  it('sends no address when none is saved', async () => {
    mockSend.mockResolvedValueOnce({ success: true, state: 'signed_in', reason: 'admin_page' });
    await probeMallSession('ext', 'onch');
    expect(mockSend).toHaveBeenCalledWith('ext', { action: 'checkMallLogin', mallKey: 'onch' }, 45_000);
  });

  it('keeps a verification answer as its own state', async () => {
    mockSend.mockResolvedValueOnce({ success: true, state: 'verification_required', reason: 'verification_required' });
    await expect(probeMallSession('ext', 'kidkids')).resolves.toMatchObject({
      state: 'verification_required',
      reason: 'verification_required',
    });
  });

  /**
   * 사장님: "로그인됨 / 인증 필요 / 로그인 필요 3가지 아냐?" — 확인 불가는 없다. 확장이 뭘
   * 돌려주든 모르는 값이나 무응답은 사람이 몰에 들어가 봐야 하므로 로그인 필요다. 던지지 않는다.
   */
  it('⭐ turns anything unexpected into sign-in needed with the reason, never throws', async () => {
    mockSend.mockResolvedValueOnce({ success: true, state: 'maybe', reason: 'http://x?token=1' });
    await expect(probeMallSession('ext', 'kidsnote')).resolves.toMatchObject({ state: 'signed_out', reason: null });
    mockSend.mockResolvedValueOnce(undefined);
    await expect(probeMallSession('ext', 'kidsnote')).resolves.toMatchObject({
      state: 'signed_out',
      reason: 'extension_no_answer',
    });
    mockSend.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    await expect(probeMallSession('ext', 'kidsnote')).resolves.toMatchObject({
      state: 'signed_out',
      reason: 'extension_no_answer',
    });
  });
});

describe('shouldRememberLogin — 계정 행을 함께 쓰는 몰', () => {
  const NOW = Date.parse('2026-09-17T03:00:00.000Z');

  function rocketRow(occurredAt: string): MallOperationOutcomeSummaryRow {
    return {
      mallKey: 'rocket',
      operation: 'login_check',
      latest: {
        id: '44444444-4444-4444-8444-444444444444',
        mallKey: 'rocket',
        operation: 'login_check',
        outcome: 'attention',
        reasonCode: 'login_required',
        message: null,
        itemCount: null,
        failedCount: null,
        warningCount: null,
        occurredAt,
      },
      counts: { succeeded: 0, empty: 0, attention: 1, failed: 0, cancelled: 0 },
    };
  }

  /**
   * 쿠팡직배송 카드가 로켓 줄을 읽지 못하면 같은 상태인데도 한 바퀴마다 한 줄씩 새로 쌓인다.
   */
  it('⭐ 쿠팡직배송 카드가 로켓 줄을 제 기록으로 읽는다', () => {
    const record = loginCheckRecord({
      mallKey: 'coupang-direct',
      state: 'signed_out',
      reason: 'login_page',
      checkedAt: NOW,
    })!;

    expect(shouldRememberLogin(record, NOW, [rocketRow(new Date(NOW - 60 * 60 * 1000).toISOString())])).toBe(false);
    expect(shouldRememberLogin(record, NOW, [])).toBe(true);
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
   * 인증을 기다리는 몰도 사람이 해야 끝나므로 이번 바퀴에서 뺀다.
   */
  it('⭐ 로그인 필요 · 인증 필요로 확인된 몰을 건너뛸 목록에 담는다', async () => {
    mockDetectRuntime.mockResolvedValueOnce({ status: 'ready', extensionId: 'ext', version: '1.0.96' });
    const states: Record<string, string> = {
      onch: 'signed_in',
      art09: 'signed_out',
      kidsnote: 'signed_out',
      kidkids: 'verification_required',
    };
    mockSend.mockImplementation((_id: string, message: { mallKey: string }) =>
      Promise.resolve({ success: true, mallKey: message.mallKey, state: states[message.mallKey] }),
    );

    const sweep = await sweepMallSessions(['onch', 'art09', 'kidsnote', 'kidkids'], {
      art09: 'https://zzogzzog1.cafe24.com/admin/php/main.php',
    });

    expect(sweep).toMatchObject({ checked: 4, signedIn: 1, verification: 1, signedOut: 2 });
    expect([...sweep.signedOutKeys].sort()).toEqual(['art09', 'kidkids', 'kidsnote']);
    expect(mockSend).toHaveBeenCalledWith(
      'ext',
      { action: 'checkMallLogin', mallKey: 'art09', siteUrl: 'https://zzogzzog1.cafe24.com/admin/php/main.php' },
      45_000,
    );
  });

  /**
   * 계정 행을 함께 쓰는 몰들(쿠팡직배송 · 로켓)의 로그인 확인은 한 줄에 쌓인다. 기억 요약은
   * 바퀴 처음에 한 번만 읽고 일꾼 셋이 동시에 도니, 이번 바퀴에 적은 것을 서로 모르면 둘 다
   * '적어야 한다'로 보고 같은 줄을 두 번 쌓는다 — 한 바퀴에 한 줄이어야 한다.
   */
  it('⭐ 한 바퀴에 같은 줄로 접히는 몰은 한 번만 적는다', async () => {
    mockDetectRuntime.mockResolvedValueOnce({ status: 'ready', extensionId: 'ext', version: '1.0.96' });
    mockSend.mockImplementation((_id: string, message: { mallKey: string }) =>
      Promise.resolve({ success: true, mallKey: message.mallKey, state: 'signed_out' }),
    );

    const sweep = await sweepMallSessions(['coupang-direct', 'rocket']);

    // 확인은 몰마다 한다 — 접는 것은 기록뿐이다.
    expect(sweep).toMatchObject({ checked: 2, signedOut: 2 });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0]?.[0]).toMatchObject({
      operation: 'login_check',
      outcome: 'attention',
      reasonCode: 'login_required',
    });
  });

  it('확장이 없으면 아무 몰도 건드리지 않고 빈 목록을 돌려준다', async () => {
    mockDetectRuntime.mockResolvedValueOnce({ status: 'not_found' });
    await expect(sweepMallSessions(['onch'])).resolves.toEqual({
      checked: 0,
      signedIn: 0,
      verification: 0,
      signedOut: 0,
      signedOutKeys: [],
    });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
