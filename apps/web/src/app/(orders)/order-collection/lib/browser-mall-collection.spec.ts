import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detectExtension: vi.fn(),
  ensureLogin: vi.fn(),
  collectKkomangse: vi.fn(),
  convertKkomangse: vi.fn(),
  sendToExtension: vi.fn(),
  regenerateSource: vi.fn(),
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
vi.mock('./order-collection-api', () => ({
  regenerateOrderCollectionSource: mocks.regenerateSource,
}));
// 옛 경로 몰의 예로 꼬망세를 쓴다(키즈노트는 실행 kind로 옮겼다, KID-380).
vi.mock('./kkomangse-orders-api', () => ({
  collectKkomangseXlsxFromExtension: mocks.collectKkomangse,
  convertKkomangseToSellpiaFile: mocks.convertKkomangse,
}));
vi.mock('@/lib/order-mall-account-api', () => ({
  orderMallAccountApi: { password: mocks.password },
}));

import { EXTENSION_TIMEOUT_MESSAGE } from '@/lib/extension-bridge';
import { isMallAutoLoginBlocked, resetMallLoginBlocksForTest } from '@/lib/mall-login-block';
import { createBrowserMallCollector, ensureMallLoginForRun } from './browser-mall-collection';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';

const RUN = {
  attemptId: '11111111-1111-4111-8111-111111111111',
  attemptToken: '22222222-2222-4222-8222-222222222222',
  extensionId: 'order-extension',
};

const ACCOUNT: OrderCollectionMallAccount = {
  key: 'kkomangse',
  name: '꼬망세',
  configured: true,
  enabled: true,
  loginId: 'operator',
  hasPassword: true,
  siteUrl: 'https://nstore.edupre.co.kr',
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
    mocks.collectKkomangse.mockResolvedValue('UEsDBA==');
    mocks.convertKkomangse.mockRejectedValue(new Error('꼬망세 신규 주문이 없습니다.'));
    mocks.sendToExtension.mockReset();
    mocks.regenerateSource.mockReset();
  });

  it('stops collection when login preflight needs attention', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: true,
      error: '로그인 확인이 필요합니다.',
    });
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await expect(collector(ACCOUNT, RUN)).rejects.toThrow('로그인 확인이 필요합니다.');

    // 확장에 고정 로그인 주소가 없는 몰은 이 주소로 들어가 로그인 버튼까지 누른다.
    expect(mocks.ensureLogin).toHaveBeenCalledWith(
      'kkomangse',
      { loginId: 'operator', password: 'secret', siteUrl: 'https://nstore.edupre.co.kr' },
      expect.objectContaining(RUN),
    );
    expect(mocks.collectKkomangse).not.toHaveBeenCalled();
  });

  it('reuses the original date when restarting a managed collection', async () => {
    const run = { ...RUN, date: '2026-07-14' };
    mocks.ensureLogin.mockResolvedValue({ success: true });
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await collector(ACCOUNT, run);

    expect(mocks.collectKkomangse).toHaveBeenCalledWith(run);
    expect(mocks.convertKkomangse).toHaveBeenCalledWith('UEsDBA==', { date: '2026-07-14', run });
  });

  it('uses the refreshed account credentials supplied at execution time', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    const collector = createBrowserMallCollector({
      mallAccounts: [{ ...ACCOUNT, loginId: 'stale-operator' }],
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await collector({ ...ACCOUNT, loginId: 'fresh-operator' }, RUN);

    expect(mocks.ensureLogin).toHaveBeenCalledWith(
      'kkomangse',
      { loginId: 'fresh-operator', password: 'secret', siteUrl: 'https://nstore.edupre.co.kr' },
      expect.objectContaining(RUN),
    );
  });

  it('keeps server-owned capture and conversion inside the extension and regenerates after a delayed ACK', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      terminalState: 'COMPLETE',
      // The converter response may be lost after the source owner commits.
    });
    mocks.regenerateSource.mockResolvedValue({
      fileName: 'kkomangse.xls',
      blob: new Blob(['converted']),
      previewRows: [['converted']],
      sourceRows: 2,
      productRows: 2,
      outputRows: 2,
      skippedRows: 0,
    });
    const addGeneratedFile = vi.fn();
    const setPreviewId = vi.fn();
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      addGeneratedFile,
      setPreviewId,
    });

    const result = await collector(ACCOUNT, {
      ...RUN,
      date: '2026-09-10',
      serverOwned: true,
      selectionMode: 'manual',
    });

    expect(mocks.sendToExtension).toHaveBeenCalledWith(
      RUN.extensionId,
      expect.objectContaining({
        action: 'collectKkomangseOrders',
        attemptId: RUN.attemptId,
        serverOwned: true,
        deferTerminal: true,
        date: '2026-09-10',
      }),
      200000,
    );
    expect(mocks.regenerateSource).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: RUN.attemptId }),
      { download: false },
    );
    expect(addGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({
      mallKey: 'kkomangse',
      collectedRows: 2,
      fileName: 'kkomangse.xls',
    }));
    expect(setPreviewId).toHaveBeenCalled();
    expect(result).toEqual({
      rowCount: 2,
      masked: false,
      date: '2026-09-10',
    });
  });

  it.each([false, true])('shows a confirmed empty collection without adding a generated file (lost response: %s)', async (lostResponse) => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    if (lostResponse) mocks.sendToExtension.mockRejectedValue(new Error('response lost'));
    else mocks.sendToExtension.mockResolvedValue({ success: true, terminalState: 'COMPLETE' });
    mocks.regenerateSource.mockResolvedValue({
      fileName: '', blob: new Blob([]), previewRows: [],
      sourceRows: 0, productRows: 0, outputRows: 0, skippedRows: 0,
    });
    const addGeneratedFile = vi.fn();
    const account = { ...ACCOUNT, key: 'haebub-mall' as const, name: '해법몰' };
    const collector = createBrowserMallCollector({
      mallAccounts: [account],
      addGeneratedFile, setPreviewId: vi.fn(),
    });
    await expect(collector(account, { ...RUN, date: '2026-09-10', serverOwned: true }))
      .resolves.toMatchObject({ rowCount: 0 });
    expect(addGeneratedFile).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith('해법몰 신규 주문이 없습니다.', undefined);
  });

  it('reconciles a lost extension response from the retained source without recollecting', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    mocks.sendToExtension.mockRejectedValue(new Error('extension response lost'));
    mocks.regenerateSource.mockResolvedValue({
      fileName: 'kkomangse.xls',
      blob: new Blob(['converted']),
      previewRows: [['converted']],
      sourceRows: 3,
      productRows: 3,
      outputRows: 3,
      skippedRows: 0,
    });
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await expect(collector(ACCOUNT, {
      ...RUN,
      date: '2026-09-10',
      serverOwned: true,
    })).resolves.toMatchObject({ rowCount: 3 });

    expect(mocks.sendToExtension).toHaveBeenCalledTimes(1);
    expect(mocks.regenerateSource).toHaveBeenCalledTimes(1);
  });

  it('passes both IDs from the single art09 account to the login preflight', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    const art09Account: OrderCollectionMallAccount = {
      ...ACCOUNT,
      key: 'art09',
      name: '아트공구',
      supplierLoginId: 'supplier-operator',
    };
    // 아트공구는 실행 kind로 옮긴 몰이라 수집 전에 시도 없이 로그인만 맞춘다(KID-359 H3).
    const run = { attemptId: '', attemptToken: '', extensionId: RUN.extensionId, date: null, sourceOwner: 'mall_orders_operation' as const };

    await ensureMallLoginForRun(art09Account, run);

    expect(mocks.ensureLogin).toHaveBeenCalledWith(
      'art09',
      {
        loginId: 'operator',
        supplierLoginId: 'supplier-operator',
        password: 'secret',
        siteUrl: 'https://nstore.edupre.co.kr',
      },
      run,
    );
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
    // 모든 몰 분기가 헬퍼를 거친다.
    expect((source.match(/toastNoNewOrders\(/g) ?? []).length).toBeGreaterThanOrEqual(13);
    expect(source).not.toContain('/주문이 없|없습니다/');
    expect(source).toContain('isNoNewOrdersMessage(msg)');
  });

  it('derives every generated-file collection date from the resolved run', () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, 'browser-mall-collection.ts'),
      'utf8',
    );

    expect(source.match(/todayYmd\(\)/g)).toHaveLength(2);
    expect(source).toContain('function collectionDateOf(');
  });

  it('defers every managed mall session until web conversion finishes', () => {
    const apiFiles = [
      'order-collection-extension.ts',
      'kkomangse-orders-api.ts',
      'lotteon-orders-api.ts',
      'gsshop-orders-api.ts',
      'alwayz-orders-api.ts',
      'kakao-orders-api.ts',
      'boribori-orders-api.ts',
      'teacherville-orders-api.ts',
      'haebeop-orders-api.ts',
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
    mocks.collectKkomangse.mockResolvedValue('UEsDBA==');
    mocks.convertKkomangse.mockRejectedValue(new Error('꼬망세 신규 주문이 없습니다.'));
  });

  const collect = () =>
    createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
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
    await collect();
    expect(mocks.collectKkomangse).toHaveBeenCalledTimes(1);
    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
  });

  it('비밀번호가 거부되면 차단한다 — 또 두드리면 계정이 잠긴다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: '아이디 또는 비밀번호가 올바르지 않습니다.',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kkomangse')).toBe(true);
  });

  /** 12:29 라이브: 전체수집이 서버 요청 한도(분당 120)를 넘겨 몰 20곳이 한꺼번에 차단됐다. */
  it('⭐ 우리 서버가 요청 한도로 막은 실패로는 차단하지 않는다 — 비밀번호 문제가 아니다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: 'ThrottlerException: Too Many Requests',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
  });

  /** 로그인 뒤 화면은 몰마다 다르다. 확인하지 못한 것을 실패로 굳히지 않고, 대신 자주 넣지 않는다. */
  it('⭐ 스스로 도는 수집은 로그인했는지 확인하지 못하면 한 시간 안에 다시 넣지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true, submitted: true, verified: false });
    const automatic = () =>
      createBrowserMallCollector({
        mallAccounts: [ACCOUNT],
          addGeneratedFile: vi.fn(),
        setPreviewId: vi.fn(),
      })(ACCOUNT, { ...RUN, selectionMode: 'automatic' as const });

    await automatic();

    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
    expect(mocks.ensureLogin).toHaveBeenCalledTimes(1);

    await automatic();
    expect(mocks.ensureLogin).toHaveBeenCalledTimes(1);
  });

  /** 사람이 누른 수집은 지금 되기를 바라고 누른 것이다 — 간격 때문에 로그인을 건너뛰지 않는다. */
  it('⭐ 사람이 누른 수집은 방금 시도했더라도 로그인부터 확인한다', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true, submitted: true, verified: false });

    await createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    })(ACCOUNT, { ...RUN, selectionMode: 'automatic' as const });
    await collect();

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

    await collect();

    expect(isMallAutoLoginBlocked('kkomangse')).toBe(true);
  });

  it('몰이 다른 말을 남기면 막지 않는다 — 점검 중 · 세션 만료는 자격증명 문제가 아니다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '서비스 점검 중입니다.',
    });

    await collect();

    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
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
    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
  });

  it('사람이 인증만 하면 되는 상태는 차단하지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: true,
      error: '본인 인증이 필요합니다.',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
  });

});

describe('자동 로그인 차단은 진짜 로그인 실패에만', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMallLoginBlocksForTest();
    window.localStorage.clear();
    mocks.detectExtension.mockResolvedValue(RUN.extensionId);
    mocks.password.mockResolvedValue({ password: 'secret' });
    mocks.collectKkomangse.mockResolvedValue('UEsDBA==');
    mocks.convertKkomangse.mockRejectedValue(new Error('꼬망세 신규 주문이 없습니다.'));
  });

  const collect = () =>
    createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      rocketChannelAccountId: null,
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
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

    await collect();
    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
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

    await expect(collect()).resolves.toBeDefined();
    expect(mocks.collectKkomangse).toHaveBeenCalledTimes(1);
  });

  it('비밀번호가 거부되면 차단한다 — 또 두드리면 계정이 잠긴다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: '아이디 또는 비밀번호가 올바르지 않습니다.',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kkomangse')).toBe(true);
  });

  /** 12:29 라이브: 전체수집이 서버 요청 한도(분당 120)를 넘겨 몰 20곳이 한꺼번에 차단됐다. */
  it('⭐ 우리 서버가 요청 한도로 막은 실패로는 차단하지 않는다 — 비밀번호 문제가 아니다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: false,
      error: 'ThrottlerException: Too Many Requests',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
  });

  /** 로그인 뒤 화면은 몰마다 다르다. 확인하지 못한 것을 실패로 굳히지 않고, 대신 자주 넣지 않는다. */
  it('⭐ 스스로 도는 수집은 로그인했는지 확인하지 못하면 한 시간 안에 다시 넣지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true, submitted: true, verified: false });
    const automatic = () =>
      createBrowserMallCollector({
        mallAccounts: [ACCOUNT],
        rocketChannelAccountId: null,
        addGeneratedFile: vi.fn(),
        setPreviewId: vi.fn(),
      })(ACCOUNT, { ...RUN, selectionMode: 'automatic' as const });

    await automatic();

    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
    expect(mocks.ensureLogin).toHaveBeenCalledTimes(1);

    await automatic();
    expect(mocks.ensureLogin).toHaveBeenCalledTimes(1);
  });

  /** 사람이 누른 수집은 지금 되기를 바라고 누른 것이다 — 간격 때문에 로그인을 건너뛰지 않는다. */
  it('⭐ 사람이 누른 수집은 방금 시도했더라도 로그인부터 확인한다', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true, submitted: true, verified: false });

    await createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      rocketChannelAccountId: null,
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    })(ACCOUNT, { ...RUN, selectionMode: 'automatic' as const });
    await collect();

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

    await collect();

    expect(isMallAutoLoginBlocked('kkomangse')).toBe(true);
  });

  it('몰이 다른 말을 남기면 막지 않는다 — 점검 중 · 세션 만료는 자격증명 문제가 아니다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: true,
      submitted: true,
      verified: false,
      mallMessage: '서비스 점검 중입니다.',
    });

    await collect();

    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
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
    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
  });

  it('사람이 인증만 하면 되는 상태는 차단하지 않는다', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: true,
      error: '본인 인증이 필요합니다.',
    });

    await expect(collect()).rejects.toThrow();
    expect(isMallAutoLoginBlocked('kkomangse')).toBe(false);
  });
});
