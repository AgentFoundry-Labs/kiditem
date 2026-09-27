import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detectExtension: vi.fn(),
  ensureLogin: vi.fn(),
  sendToExtension: vi.fn(),
  password: vi.fn(),
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
// 자동 로그인 차단은 확장 응답 시간 초과 문구(`EXTENSION_TIMEOUT_MESSAGE`)를 실제 값으로 비교한다.
vi.mock('@/lib/extension-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/extension-bridge')>()),
  sendToExtension: mocks.sendToExtension,
}));
vi.mock('./order-collection-extension', () => ({
  createOrderCollectionExtensionError: (
    response: { error?: string; errorCode?: string; pendingLogin?: boolean; failure?: unknown },
    fallback: string,
  ) => Object.assign(new Error(response.error ?? fallback), response),
  detectOrderCollectionSessionExtension: mocks.detectExtension,
  ensureMallLoggedInViaExtension: mocks.ensureLogin,
  orderCollectionExtensionRunFields: (run: Record<string, unknown> | undefined) => ({
    attemptId: run?.attemptId,
    deferTerminal: true,
    ...(run?.serverOwned ? { serverOwned: true } : {}),
    ...(run?.selectionMode ? { selectionMode: run.selectionMode } : {}),
    ...(run?.seenRowKeys ? { seenRowKeys: [...run.seenRowKeys] } : {}),
  }),
}));
vi.mock('@/lib/order-mall-account-api', () => ({
  orderMallAccountApi: { password: mocks.password },
}));

import { EXTENSION_TIMEOUT_MESSAGE } from '@/lib/extension-bridge';
import { isMallAutoLoginBlocked, resetMallLoginBlocksForTest } from '@/lib/mall-login-block';
import { createBrowserMallCollector, ensureMallLoginForRun } from './browser-mall-collection';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';

// KID-379: 옛 attempt 경로에 남는 몰은 카카오뿐이다 — 서버 소유 수집(serverOwned)으로 돌고, 셀피아 변환 규격이 없어
// 확장이 그 시도를 원본과 함께 실패(UNSUPPORTED_CONVERSION)로 닫는다. 이 절차가 파일을 만드는 일은 없다.
const KAKAO_UNSUPPORTED = {
  success: false,
  terminalState: 'FAILED',
  errorCode: 'UNSUPPORTED_CONVERSION',
  error: '카카오는 셀피아 변환 규격이 검증되지 않아 지원하지 않습니다.',
};
const RUN = {
  attemptId: '11111111-1111-4111-8111-111111111111',
  attemptToken: '22222222-2222-4222-8222-222222222222',
  extensionId: 'order-extension',
  date: '2026-09-10' as string | null,
  serverOwned: true as const,
};

const ACCOUNT: OrderCollectionMallAccount = {
  key: 'kakao',
  name: '카카오',
  configured: true,
  enabled: true,
  loginId: 'operator',
  hasPassword: true,
  siteUrl: 'https://shopping-seller.kakao.com',
  memo: null,
  passwordUpdatedAt: null,
  updatedAt: null,
};

describe('createBrowserMallCollector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 자동 로그인 차단은 모듈 상태다 — 한 테스트의 로그인 실패가 다음 테스트를 막지 않게 비운다.
    resetMallLoginBlocksForTest();
    window.localStorage.clear();
    mocks.detectExtension.mockResolvedValue(RUN.extensionId);
    mocks.password.mockResolvedValue({ password: 'secret' });
    mocks.sendToExtension.mockReset();
    mocks.sendToExtension.mockResolvedValue(KAKAO_UNSUPPORTED);
  });

  it('stops collection when login preflight needs attention', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: true,
      error: '로그인 확인이 필요합니다.',
    });
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
    });

    await expect(collector(ACCOUNT, RUN)).rejects.toThrow('로그인 확인이 필요합니다.');

    // 확장에 고정 로그인 주소가 없는 몰은 이 주소로 들어가 로그인 버튼까지 누른다.
    expect(mocks.ensureLogin).toHaveBeenCalledWith(
      'kakao',
      { loginId: 'operator', password: 'secret', siteUrl: 'https://shopping-seller.kakao.com' },
      expect.objectContaining(RUN),
    );
    expect(mocks.sendToExtension).not.toHaveBeenCalled();
  });

  it('reuses the original date when restarting a managed collection', async () => {
    const run = { ...RUN, date: '2026-07-14' };
    mocks.ensureLogin.mockResolvedValue({ success: true });
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
    });

    await collector(ACCOUNT, run).catch(() => undefined);

    expect(mocks.sendToExtension).toHaveBeenCalledWith(
      RUN.extensionId,
      expect.objectContaining({ action: 'collectKakaoOrders', attemptId: RUN.attemptId, date: '2026-07-14' }),
      200000,
    );
  });

  it('uses the refreshed account credentials supplied at execution time', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    const collector = createBrowserMallCollector({
      mallAccounts: [{ ...ACCOUNT, loginId: 'stale-operator' }],
    });

    await collector({ ...ACCOUNT, loginId: 'fresh-operator' }, RUN).catch(() => undefined);

    expect(mocks.ensureLogin).toHaveBeenCalledWith(
      'kakao',
      { loginId: 'fresh-operator', password: 'secret', siteUrl: 'https://shopping-seller.kakao.com' },
      expect.objectContaining(RUN),
    );
  });

  it('카카오 시도는 확장이 원본과 함께 실패로 닫는다 — 그 오류·원본을 그대로 올리고 파일을 만들지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    mocks.sendToExtension.mockResolvedValue({ ...KAKAO_UNSUPPORTED, sourcePayload: { orders: [{ paymentId: 1 }] } });
    const collector = createBrowserMallCollector({ mallAccounts: [ACCOUNT] });

    await expect(collector(ACCOUNT, RUN)).rejects.toMatchObject({
      message: KAKAO_UNSUPPORTED.error,
      code: 'UNSUPPORTED_CONVERSION',
      sourcePayload: { orders: [{ paymentId: 1 }] },
    });
    expect(mocks.sendToExtension).toHaveBeenCalledWith(
      RUN.extensionId,
      expect.objectContaining({ action: 'collectKakaoOrders', attemptId: RUN.attemptId, serverOwned: true, deferTerminal: true, date: '2026-09-10' }),
      200000,
    );
  });

  it('확장 응답을 잃으면 다시 걷지 않고 owner 상태로 맞추도록 남긴다(옛 재변환은 없다)', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    mocks.sendToExtension.mockRejectedValue(new Error('extension response lost'));
    const collector = createBrowserMallCollector({ mallAccounts: [ACCOUNT] });

    await expect(collector(ACCOUNT, RUN)).rejects.toMatchObject({ message: 'extension response lost', ownerReconciliationRequired: true });
    expect(mocks.sendToExtension).toHaveBeenCalledTimes(1);
  });

  it('확장이 완료라고 답해도 옛 경로에는 변환이 없다 — 파일 없이 준비 중으로 끝난다', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    mocks.sendToExtension.mockResolvedValue({ success: true, terminalState: 'COMPLETE' });
    await expect(createBrowserMallCollector({ mallAccounts: [ACCOUNT] })(ACCOUNT, RUN))
      .rejects.toMatchObject({ message: '카카오 셀피아 변환은 아직 준비 중입니다.', code: 'UNSUPPORTED_CONVERSION' });
  });

  it('announces "no new orders" the same way for every mall', () => {
    // 몰마다 문구도 심각도도 달랐다(키즈노트만 빨간 error, 어떤 몰은 날짜를, 어떤 몰은
    // 상태명을 문장에 섞었다). 주문이 없는 건 실패가 아니므로 한 헬퍼만 쓰게 고정한다.
    const source = readFileSync(
      path.resolve(import.meta.dirname, 'browser-mall-collection.ts'),
      'utf8',
    );

    expect(source).toContain('function toastNoNewOrders(');
    // 헬퍼 안의 한 곳에서만 문구를 만든다.
    expect(source.match(/신규 주문이 없습니다/g)).toHaveLength(1);
    // 주문 없음을 오류로 알리지 않는다.
    expect(source).not.toMatch(/toast\.(error|warning)\([^)]*주문[^)]*없/);
    expect(source).not.toContain('/주문이 없|없습니다/');
  });

  it('defers every managed mall session until web conversion finishes', () => {
    const apiFiles = [
      'order-collection-extension.ts',
      'coupang-directship-api.ts',
    ];

    for (const apiFile of apiFiles) {
      const source = readFileSync(path.resolve(import.meta.dirname, apiFile), 'utf8');
      expect(source, apiFile).not.toContain('runId');
      expect(source, apiFile).toContain('attemptId');
      if (apiFile === 'coupang-directship-api.ts') {
        expect(source, apiFile).not.toContain('deferTerminal: true');
      } else {
        expect(source, apiFile).toContain('deferTerminal: true');
      }
    }
  });

});

describe('자동 로그인 차단은 진짜 로그인 실패에만', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMallLoginBlocksForTest();
    window.localStorage.clear();
    mocks.detectExtension.mockResolvedValue(RUN.extensionId);
    mocks.password.mockResolvedValue({ password: 'secret' });
    mocks.sendToExtension.mockResolvedValue(KAKAO_UNSUPPORTED);
  });

  const collect = () =>
    createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
    })(ACCOUNT, RUN);

  /**
   * 확장이 답을 안 준 것으로 차단하면, 멀쩡히 로그인된 몰이 '직접 로그인 필요'로 굳는다.
   * 사장님은 로그인돼 있는데 로그인하라는 화면을 보게 된다 — 실제로 그렇게 나왔다.
   */
  it('⭐ 확장 응답 시간 초과로는 차단하지 않는다 — 비밀번호가 틀린 게 아니다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: EXTENSION_TIMEOUT_MESSAGE,
    });

    // This is the login preflight deadline. A missing preflight reply must not
    // turn an otherwise runnable collection into a failed source run.
    await collect().catch(() => undefined);
    expect(mocks.sendToExtension).toHaveBeenCalledTimes(1);
    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
  });

  it('비밀번호가 거부되면 차단한다 — 또 두드리면 계정이 잠긴다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: '아이디 또는 비밀번호가 올바르지 않습니다.',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kakao')).toBe(true);
  });

  /** 12:29 라이브: 전체수집이 서버 요청 한도(분당 120)를 넘겨 몰 20곳이 한꺼번에 차단됐다. */
  it('⭐ 우리 서버가 요청 한도로 막은 실패로는 차단하지 않는다 — 비밀번호 문제가 아니다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: 'ThrottlerException: Too Many Requests',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
  });

  /** 로그인 뒤 화면은 몰마다 다르다. 확인하지 못한 것을 실패로 굳히지 않고, 대신 자주 넣지 않는다. */
  it('⭐ 스스로 도는 수집은 로그인했는지 확인하지 못하면 한 시간 안에 다시 넣지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true, submitted: true, verified: false });
    const automatic = () =>
      createBrowserMallCollector({
        mallAccounts: [ACCOUNT],
      })(ACCOUNT, { ...RUN, selectionMode: 'automatic' as const });

    await automatic().catch(() => undefined);

    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
    expect(mocks.ensureLogin).toHaveBeenCalledTimes(1);

    await automatic().catch(() => undefined);
    expect(mocks.ensureLogin).toHaveBeenCalledTimes(1);
  });

  /** 사람이 누른 수집은 지금 되기를 바라고 누른 것이다 — 간격 때문에 로그인을 건너뛰지 않는다. */
  it('⭐ 사람이 누른 수집은 방금 시도했더라도 로그인부터 확인한다', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true, submitted: true, verified: false });

    await createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
    })(ACCOUNT, { ...RUN, selectionMode: 'automatic' as const }).catch(() => undefined);
    await collect().catch(() => undefined);

    expect(mocks.ensureLogin).toHaveBeenCalledTimes(2);
  });

  /**
   * 알림 창으로 답하는 몰이 많다. 그 답을 받아 오면 "확인 못 함"으로 얼버무리지
   * 않고 몰의 말을 그대로 보여 주고, 아이디·비밀번호를 거부한 것이면 더 두드리지 않는다.
   */
  it('⭐ 몰이 아이디·비밀번호를 거부했다고 말하면 그 몰의 자동 로그인을 막는다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.',
    });

    await collect().catch(() => undefined);

    expect(isMallAutoLoginBlocked('kakao')).toBe(true);
  });

  it('몰이 다른 말을 남기면 막지 않는다 — 점검 중 · 세션 만료는 자격증명 문제가 아니다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '서비스 점검 중입니다.',
    });

    await collect().catch(() => undefined);

    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
  });

  /**
   * 쿠팡처럼 로그인 화면이 다른 도메인으로 넘어가는 몰은 확장 권한이 없으면 우리가 화면을
   * 들여다보지도 못한다. 비밀번호가 틀린 게 아니므로 그 몰을 막으면 안 된다 — 확장을 새로
   * 불러오면 풀린다.
   */
  it('⭐ 확장이 로그인 화면에 접근하지 못한 것은 비밀번호 문제가 아니다 — 막지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: true,
      loginPageUnreachable: true,
      errorCode: 'login_page_not_reachable',
      error: 'xauth.coupang.com 화면에 확장이 접근할 수 없어 자동 로그인을 하지 못했습니다.',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
  });

  it('사람이 인증만 하면 되는 상태는 차단하지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: true,
      error: '본인 인증이 필요합니다.',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
  });

});

describe('자동 로그인 차단은 진짜 로그인 실패에만', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMallLoginBlocksForTest();
    window.localStorage.clear();
    mocks.detectExtension.mockResolvedValue(RUN.extensionId);
    mocks.password.mockResolvedValue({ password: 'secret' });
    mocks.sendToExtension.mockResolvedValue(KAKAO_UNSUPPORTED);
  });

  const collect = () =>
    createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
    })(ACCOUNT, RUN);

  /**
   * 확장이 답을 안 준 것으로 차단하면, 멀쩡히 로그인된 몰이 '직접 로그인 필요'로 굳는다.
   * 사장님은 로그인돼 있는데 로그인하라는 화면을 보게 된다 — 실제로 그렇게 나왔다.
   */
  it('⭐ 확장 응답 시간 초과로는 차단하지 않는다 — 비밀번호가 틀린 게 아니다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: EXTENSION_TIMEOUT_MESSAGE,
    });

    await collect().catch(() => undefined);
    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
  });

  /**
   * 2026-09-18 라이브: 전체 수집 중 도매꾹 · GS샵이 로그인된 채로 '파일 생성 실패: 익스텐션 응답
   * 시간이 초과되었습니다'로 끝났다. 로그인 확인에 답을 못 들은 것일 뿐이라, 수집은 그대로 한다 —
   * 세션이 살아 있으면 수집되고, 죽었으면 수집기가 '로그인 필요'로 알린다.
   */
  it('⭐ 로그인 확인이 시간 초과여도 수집은 그대로 한다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: EXTENSION_TIMEOUT_MESSAGE,
    });

    await expect(collect()).rejects.toThrow(KAKAO_UNSUPPORTED.error);
    expect(mocks.sendToExtension).toHaveBeenCalledTimes(1);
  });

  it('비밀번호가 거부되면 차단한다 — 또 두드리면 계정이 잠긴다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: '아이디 또는 비밀번호가 올바르지 않습니다.',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kakao')).toBe(true);
  });

  /** 12:29 라이브: 전체수집이 서버 요청 한도(분당 120)를 넘겨 몰 20곳이 한꺼번에 차단됐다. */
  it('⭐ 우리 서버가 요청 한도로 막은 실패로는 차단하지 않는다 — 비밀번호 문제가 아니다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: 'ThrottlerException: Too Many Requests',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
  });

  /** 로그인 뒤 화면은 몰마다 다르다. 확인하지 못한 것을 실패로 굳히지 않고, 대신 자주 넣지 않는다. */
  it('⭐ 스스로 도는 수집은 로그인했는지 확인하지 못하면 한 시간 안에 다시 넣지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true, submitted: true, verified: false });
    const automatic = () =>
      createBrowserMallCollector({
        mallAccounts: [ACCOUNT],
      })(ACCOUNT, { ...RUN, selectionMode: 'automatic' as const });

    await automatic().catch(() => undefined);

    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
    expect(mocks.ensureLogin).toHaveBeenCalledTimes(1);

    await automatic().catch(() => undefined);
    expect(mocks.ensureLogin).toHaveBeenCalledTimes(1);
  });

  /** 사람이 누른 수집은 지금 되기를 바라고 누른 것이다 — 간격 때문에 로그인을 건너뛰지 않는다. */
  it('⭐ 사람이 누른 수집은 방금 시도했더라도 로그인부터 확인한다', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true, submitted: true, verified: false });

    await createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
    })(ACCOUNT, { ...RUN, selectionMode: 'automatic' as const }).catch(() => undefined);
    await collect().catch(() => undefined);

    expect(mocks.ensureLogin).toHaveBeenCalledTimes(2);
  });

  /**
   * 알림 창으로 답하는 몰이 많다. 그 답을 받아 오면 "확인 못 함"으로 얼버무리지
   * 않고 몰의 말을 그대로 보여 주고, 아이디·비밀번호를 거부한 것이면 더 두드리지 않는다.
   */
  it('⭐ 몰이 아이디·비밀번호를 거부했다고 말하면 그 몰의 자동 로그인을 막는다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.',
    });

    await collect().catch(() => undefined);

    expect(isMallAutoLoginBlocked('kakao')).toBe(true);
  });

  it('몰이 다른 말을 남기면 막지 않는다 — 점검 중 · 세션 만료는 자격증명 문제가 아니다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '서비스 점검 중입니다.',
    });

    await collect().catch(() => undefined);

    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
  });

  /**
   * 쿠팡처럼 로그인 화면이 다른 도메인으로 넘어가는 몰은 확장 권한이 없으면 우리가 화면을
   * 들여다보지도 못한다. 비밀번호가 틀린 게 아니므로 그 몰을 막으면 안 된다 — 확장을 새로
   * 불러오면 풀린다.
   */
  it('⭐ 확장이 로그인 화면에 접근하지 못한 것은 비밀번호 문제가 아니다 — 막지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: true,
      loginPageUnreachable: true,
      errorCode: 'login_page_not_reachable',
      error: 'xauth.coupang.com 화면에 확장이 접근할 수 없어 자동 로그인을 하지 못했습니다.',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
  });

  it('사람이 인증만 하면 되는 상태는 차단하지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: true,
      error: '본인 인증이 필요합니다.',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kakao')).toBe(false);
  });
});
