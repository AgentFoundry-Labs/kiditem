import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../core/errors';
import { createTabPages, installDialogGuardAnswer, leftForOperator, sweepDialogGuards, type PageGuard, type TabPageChrome } from './tab-page';

function fakeChrome(options: { sendMessage: (message: unknown, call: number) => Promise<unknown>; statuses?: string[]; url?: string; urls?: string[]; openTabs?: Array<{ id?: number; url?: string; status?: string }> }) {
  const log: string[] = [];
  let sends = 0;
  let gets = 0;
  const chromeApi: TabPageChrome = {
    tabs: {
      create: async (properties) => { log.push(`create ${properties.url} active=${properties.active}`); return { id: 9 }; },
      update: async (tabId, properties) => { log.push(properties.active ? `activate ${tabId}` : `update ${tabId} ${properties.url}`); },
      get: async () => {
        const status = options.statuses?.[gets] ?? 'complete';
        gets += 1;
        return { status, url: options.urls?.[Math.min(gets - 1, options.urls.length - 1)] ?? options.url ?? 'https://s.1688.com/x' };
      },
      query: async (query) => { log.push(`query ${query.url}`); return options.openTabs ?? []; },
      remove: async (tabId) => { log.push(`remove ${tabId}`); },
      sendMessage: async (_tabId, message, sendOptions) => {
        sends += 1;
        if (sendOptions?.frameId !== undefined) log.push(`send frame ${sendOptions.frameId}`);
        return options.sendMessage(message, sends);
      },
    },
    scripting: {
      executeScript: async (injection) => {
        const target = injection.target as { allFrames?: boolean; frameIds?: number[] };
        const where = target.allFrames ? ' all frames' : target.frameIds ? ` frames ${target.frameIds.join(',')}` : '';
        log.push(`inject ${injection.world ?? 'ISOLATED'} ${injection.files.join(',')}${where}`);
        return target.allFrames ? [{ frameId: 0, result: { top: true } }, { frameId: 5, result: { top: false } }, { frameId: 6 }] : [];
      },
    },
    runtime: { onMessage: { addListener: () => undefined, removeListener: () => undefined } },
  };
  return { chromeApi, log };
}

const deps = (chromeApi: TabPageChrome) => ({ chrome: chromeApi, fetch: async () => new Response('x'), sleep: async () => undefined, now: () => 0 });

describe('chrome tab pages (KID-360)', () => {
  it('opens a background tab, waits for complete, and closes only the tab it opened', async () => {
    const { chromeApi, log } = fakeChrome({ sendMessage: async () => ({ ok: true }), statuses: ['loading', 'complete'] });
    const tabs = createTabPages(deps(chromeApi));
    const page = await tabs.open('about:blank');
    await expect(page.navigate('https://s.1688.com/x', { timeoutMs: 10_000 })).resolves.toBe('https://s.1688.com/x');
    await page.close();
    await tabs.attach(3).close();
    expect(log).toEqual(['create about:blank active=false', 'update 9 https://s.1688.com/x', 'remove 9']);
  });

  it('injects ISOLATED then MAIN files and asks again when no content script is listening', async () => {
    const { chromeApi, log } = fakeChrome({
      sendMessage: async (_message, call) => {
        if (call === 1) throw new Error('Could not establish connection. Receiving end does not exist.');
        return { ok: true, items: [] };
      },
    });
    const page = createTabPages(deps(chromeApi)).attach(4);
    await expect(page.ask({ type: 'X' }, { timeoutMs: 1_000, inject: { isolated: ['a.js'], main: ['b.js'] } })).resolves.toEqual({ ok: true, items: [] });
    expect(log).toEqual(['inject ISOLATED a.js', 'inject MAIN b.js']);
  });

  it('runs a file in every frame and returns each frame result; asks one frame and injects into that frame only (KID-359 H3)', async () => {
    const { chromeApi, log } = fakeChrome({
      sendMessage: async (_message, call) => {
        if (call === 1) throw new Error('Could not establish connection. Receiving end does not exist.');
        return { ok: true };
      },
    });
    const page = createTabPages(deps(chromeApi)).attach(4);
    await expect(page.frames(['detect.js'])).resolves.toEqual([{ frameId: 0, result: { top: true } }, { frameId: 5, result: { top: false } }]);
    await expect(page.ask({ type: 'X' }, { timeoutMs: 1_000, frameId: 5, inject: { isolated: ['a.js'], main: ['b.js'] } })).resolves.toEqual({ ok: true });
    expect(log).toEqual(['inject ISOLATED detect.js all frames', 'send frame 5', 'inject ISOLATED a.js frames 5', 'inject MAIN b.js frames 5', 'send frame 5']);
  });

  it('answers a timeout instead of hanging', async () => {
    const { chromeApi } = fakeChrome({ sendMessage: () => new Promise(() => undefined) });
    await expect(createTabPages(deps(chromeApi)).attach(4).ask({ type: 'X' }, { timeoutMs: 5 })).resolves.toEqual({ ok: false, error: 'timeout' });
  });

  it('with continueOnTimeout returns the last URL of a page that never finishes loading; without it, fails', async () => {
    let clock = 0;
    const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }), statuses: Array(100).fill('loading') });
    const tabs = createTabPages({ chrome: chromeApi, fetch: async () => new Response('x'), sleep: async (ms) => { clock += ms; }, now: () => clock });
    const page = await tabs.open('about:blank');
    await expect(page.navigate('https://s.1688.com/x', { timeoutMs: 1_000, continueOnTimeout: true })).resolves.toBe('https://s.1688.com/x');
    await expect(page.navigate('https://s.1688.com/x', { timeoutMs: 1_000 })).rejects.toMatchObject({ code: 'SITE_TAB_UNAVAILABLE' });
  });

  it('fails at once when the tab is closed while loading, even with continueOnTimeout', async () => {
    const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }) });
    chromeApi.tabs.get = async () => { throw new Error('No tab with id: 9'); };
    const page = await createTabPages(deps(chromeApi)).open('about:blank');
    await expect(page.navigate('https://s.1688.com/x', { timeoutMs: 60_000, continueOnTimeout: true }))
      .rejects.toMatchObject({ code: 'SITE_TAB_UNAVAILABLE', message: '수집 탭이 닫혔습니다.' });
  });

  describe('page guard: never inject into a host outside the site (KID-355 QA: 1688 → login.taobao.com)', () => {
    const guard: PageGuard = {
      allows: (url) => url.hostname.endsWith('.1688.com'),
      isLogin: (url) => ['login.taobao.com', 'login.1688.com'].includes(url.hostname),
      loginMessage: '1688 로그인이 필요합니다. 열려 있는 1688 탭에서 로그인한 뒤 다시 수집해 주세요.',
    };
    const missing = async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); };

    it('refuses a login redirect as SITE_LOGIN_REQUIRED without injecting or closing the tab', async () => {
      const { chromeApi, log } = fakeChrome({ sendMessage: missing, url: 'https://login.taobao.com/?redirect_url=https%3A%2F%2Flogin.1688.com' });
      const page = createTabPages(deps(chromeApi)).attach(4);
      await expect(page.ask({ type: 'X' }, { timeoutMs: 1_000, inject: { isolated: ['a.js'] }, guard }))
        .rejects.toMatchObject({ code: 'SITE_LOGIN_REQUIRED', message: guard.loginMessage });
      expect(log).toEqual([]);
    });

    it('refuses an unknown host as SITE_REQUEST_FAILED unexpected_url', async () => {
      const { chromeApi, log } = fakeChrome({ sendMessage: missing, url: 'https://www.example.com/x' });
      await expect(createTabPages(deps(chromeApi)).attach(4).ask({ type: 'X' }, { timeoutMs: 1_000, inject: { isolated: ['a.js'] }, guard }))
        .rejects.toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'unexpected_url', url: 'https://www.example.com/x' } });
      expect(log).toEqual([]);
    });

    it('injects as before on the site host', async () => {
      const { chromeApi, log } = fakeChrome({
        sendMessage: async (_message, call) => { if (call === 1) return missing(); return { ok: true }; },
        url: 'https://s.1688.com/selloffer/offer_search.htm',
      });
      await expect(createTabPages(deps(chromeApi)).attach(4).ask({ type: 'X' }, { timeoutMs: 1_000, inject: { isolated: ['a.js'] }, guard }))
        .resolves.toEqual({ ok: true });
      expect(log).toEqual(['inject ISOLATED a.js']);
    });
  });

  describe('waiting for the operator on a verification page (KID-355 QA: 1688 slider at keyword 8/18)', () => {
    const PUNISH = 'https://s.1688.com/_____tmd_____/punish?x5secdata=a';
    const isPunish = (url: string) => url.includes('/punish');

    it('polls every 2 seconds until the tab leaves the verification page, reminding every 3 minutes', async () => {
      let clock = 0;
      const urls = [...Array(100).fill(PUNISH), 'https://s.1688.com/selloffer/offer_search.htm'];
      const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }), urls });
      const sleeps: number[] = [];
      const page = createTabPages({ chrome: chromeApi, fetch: async () => new Response('x'), sleep: async (ms) => { sleeps.push(ms); clock += ms; }, now: () => clock }).attach(4);
      let reminders = 0;
      await expect(page.waitWhile(isPunish, { onRemind: () => { reminders += 1; } })).resolves.toBe(true);
      expect(new Set(sleeps)).toEqual(new Set([2_000]));
      expect(reminders).toBe(1);
    });

    it('blocked may look at the page (async) — GS샵 SMS 화면처럼 주소가 그대로인 벽도 풀리면 멈춘다(KID-380)', async () => {
      const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }), url: 'https://partners.gsshop.com/logistics/partner-logistics-mng' });
      let clock = 0;
      const page = createTabPages({ ...deps(chromeApi), sleep: async (ms) => { clock += ms; }, now: () => clock }).attach(4);
      let checks = 0;
      await expect(page.waitWhile(async () => (checks += 1) < 3, {})).resolves.toBe(true);
      expect(checks).toBe(3);
    });

    it('gives up after 10 minutes and fails at once when the tab is closed', async () => {
      let clock = 0;
      const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }), url: PUNISH });
      const page = createTabPages({ chrome: chromeApi, fetch: async () => new Response('x'), sleep: async (ms) => { clock += ms; }, now: () => clock }).attach(4);
      await expect(page.waitWhile(isPunish, {})).resolves.toBe(false);
      expect(clock).toBeGreaterThanOrEqual(10 * 60_000);

      chromeApi.tabs.get = async () => { throw new Error('No tab'); };
      await expect(page.waitWhile(isPunish, {})).rejects.toMatchObject({ code: 'SITE_TAB_UNAVAILABLE' });
    });
  });
});

describe('TabPage.focus — 운영자가 할 일이 있는 탭을 앞으로(KID-380)', () => {
  it('그 탭을 활성 탭으로 만든다', async () => {
    const { chromeApi, log } = fakeChrome({ sendMessage: async () => ({ ok: true }) });
    await createTabPages(deps(chromeApi)).attach(4).focus();
    expect(log).toEqual(['activate 4']);
  });
});

describe('leftForOperator — 운영자에게 남기는 탭', () => {
  it('로그인 필요·사이트 밖 주소·운영자 조치(OPERATOR_ACTION_REQUIRED)는 남기고, 다른 실패는 아니다', () => {
    expect(leftForOperator(new RuntimeError('SITE_LOGIN_REQUIRED', 'x'))).toBe(true);
    expect(leftForOperator(new RuntimeError('SITE_REQUEST_FAILED', 'x', { reason: 'unexpected_url' }))).toBe(true);
    expect(leftForOperator(new RuntimeError('OPERATOR_ACTION_REQUIRED', 'x'))).toBe(true);
    expect(leftForOperator(new RuntimeError('SITE_REQUEST_FAILED', 'x', { reason: 'page_error' }))).toBe(false);
  });
});

describe('TabPages.find — 열린 탭 재사용 고르기(옛 borrowOpenTab과 같다)', () => {
  it('로그인·인증 화면 탭을 건너뛰고 다 그려진 탭을 먼저 고르며, 고른 탭은 닫지 않는다', async () => {
    const { chromeApi, log } = fakeChrome({
      sendMessage: async () => ({ ok: true }),
      openTabs: [
        { id: 1, url: 'https://store.lotteon.com/login_SO.wsp', status: 'complete' },
        { id: 2, url: 'https://store.lotteon.com/order/list', status: 'loading' },
        { id: 3, url: 'https://store.lotteon.com/index_SO.wsp', status: 'complete' },
      ],
    });
    const tabs = createTabPages({ chrome: chromeApi, fetch: async () => new Response(''), sleep: async () => undefined, now: () => 0 });
    const found = await tabs.find('https://store.lotteon.com/*');
    expect(found?.tabId).toBe(3);
    await found?.close();
    expect(log).toContain('query https://store.lotteon.com/*');
    expect(log).not.toContain('remove 3');
  });

  it('맞는 탭이 없으면 null', async () => {
    const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }), openTabs: [] });
    const tabs = createTabPages({ chrome: chromeApi, fetch: async () => new Response(''), sleep: async () => undefined, now: () => 0 });
    expect(await tabs.find('https://store.lotteon.com/*')).toBeNull();
  });
});

describe('TabPages.guardDialogs — 불러오는 중 알림 창 가드(KID-380 D4)', () => {
  it('주소를 옮기기 전에 그 호스트의 MAIN·document_start 가드를 등록하고, 해제하면 지운다 — 알림 창을 띄우는 화면도 다 그려진다', async () => {
    const registered: Array<Record<string, unknown>> = [];
    const removed: string[][] = [];
    const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }) });
    // 가드가 없으면 알림 창이 탭을 멈춰 'complete'에 닿지 못한다(아이스크림몰 "로그인이 만료되었습니다.").
    chromeApi.tabs.get = async () => ({ status: registered.length > 0 ? 'complete' : 'loading', url: 'https://po.i-screammall.co.kr/main.do' });
    chromeApi.scripting.registerContentScripts = async (scripts) => { registered.push(...(scripts as Array<Record<string, unknown>>)); };
    chromeApi.scripting.unregisterContentScripts = async (filter) => { removed.push([...(filter?.ids ?? [])]); };
    let now = 0;
    const tabs = createTabPages({ chrome: chromeApi, fetch: async () => new Response(''), sleep: async (ms: number) => { now += ms; }, now: () => now });
    const page = await tabs.open('about:blank');
    await expect(page.navigate('https://po.i-screammall.co.kr/main.do', { timeoutMs: 1 })).rejects.toMatchObject({ code: 'SITE_TAB_UNAVAILABLE' });

    const release = await tabs.guardDialogs(['i-screammall.co.kr']);
    await expect(page.navigate('https://po.i-screammall.co.kr/main.do', { timeoutMs: 1 })).resolves.toBe('https://po.i-screammall.co.kr/main.do');
    // MAIN 가드와 ISOLATED 짝(수집 탭인지 런타임에 묻는다, 실기기 R1)을 함께 건다.
    expect(registered).toHaveLength(2);
    expect(registered[0]).toMatchObject({
      matches: ['https://i-screammall.co.kr/*', 'https://*.i-screammall.co.kr/*'],
      js: ['content/page-call/dialog-guard.js'],
      world: 'MAIN',
      runAt: 'document_start',
      allFrames: true,
      persistAcrossSessions: false,
    });
    expect(registered[1]).toMatchObject({
      matches: ['https://i-screammall.co.kr/*', 'https://*.i-screammall.co.kr/*'],
      js: ['content/page-call/dialog-guard-bridge.js'],
      world: 'ISOLATED',
      runAt: 'document_start',
      allFrames: true,
      persistAcrossSessions: false,
    });
    expect(String(registered[1]!.id)).toMatch(/^kiditem-dialog-guard-/);
    await release();
    await release();
    expect(removed).toEqual([[registered[0]!.id, registered[1]!.id]]);
  });

  it('등록이 안 되는 환경이면 가드 없이 이어 간다', async () => {
    const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }) });
    chromeApi.scripting.registerContentScripts = async () => { throw new Error('Duplicate script ID'); };
    const release = await createTabPages(deps(chromeApi)).guardDialogs(['mall.test']);
    await expect(release()).resolves.toBeUndefined();
  });
});

describe('TabPages.keep·reclaimKept — 사이트마다 남긴 탭 하나(KID-380 D8)', () => {
  it('남긴 탭을 다시 가져오면 이 확장이 연 탭이라 닫을 수 있고, 한 번 가져오면 비운다', async () => {
    const { chromeApi, log } = fakeChrome({ sendMessage: async () => ({ ok: true }) });
    const tabs = createTabPages(deps(chromeApi));
    const page = await tabs.open('about:blank');
    await tabs.keep('https://store.lotteon.com', page);
    const again = await tabs.reclaimKept('https://store.lotteon.com');
    expect(again?.tabId).toBe(9);
    expect(await tabs.reclaimKept('https://store.lotteon.com')).toBeNull();
    await again?.close();
    expect(log).toContain('remove 9');
  });

  it('운영자가 그 탭을 보고 있거나(active) 로그인·빈 화면을 벗어났으면 가져오지 않고 잊는다(리뷰 SHOULD 3)', async () => {
    const { chromeApi, log } = fakeChrome({ sendMessage: async () => ({ ok: true }) });
    let tab = { status: 'complete', url: 'https://store.lotteon.com/cm/main/login_SO.wsp', active: true };
    chromeApi.tabs.get = async () => tab;
    const tabs = createTabPages(deps(chromeApi));
    await tabs.keep('https://store.lotteon.com', tabs.attach(5));
    expect(await tabs.reclaimKept('https://store.lotteon.com')).toBeNull();
    expect(await tabs.reclaimKept('https://store.lotteon.com')).toBeNull();

    await tabs.keep('https://store.lotteon.com', tabs.attach(5));
    tab = { status: 'complete', url: 'https://store.lotteon.com/cm/main/index_SO.wsp', active: false };
    expect(await tabs.reclaimKept('https://store.lotteon.com')).toBeNull();

    // 운영자가 로그인해 다른 화면으로 옮긴 탭은 새로 남길 때도 닫지 않는다.
    tab = { status: 'complete', url: 'https://store.lotteon.com/cm/main/login_SO.wsp', active: false };
    await tabs.keep('https://store.lotteon.com', tabs.attach(5));
    const urls: Record<number, string> = { 5: 'https://store.lotteon.com/cm/main/index_SO.wsp', 6: 'https://store.lotteon.com/cm/main/login_SO.wsp' };
    chromeApi.tabs.get = async (tabId) => ({ status: 'complete', url: urls[tabId], active: false });
    await tabs.keep('https://store.lotteon.com', tabs.attach(6));
    expect(log).not.toContain('remove 5');
    expect((await tabs.reclaimKept('https://store.lotteon.com'))?.tabId).toBe(6);
  });

  it('닫힌 탭은 가져오지 않고, 같은 사이트에 새로 남기면 먼저 남긴 탭은 닫는다', async () => {
    const { chromeApi, log } = fakeChrome({ sendMessage: async () => ({ ok: true }) });
    chromeApi.tabs.get = async (tabId) => {
      if (tabId === 3) throw new Error('No tab with id: 3');
      return { status: 'complete', url: 'https://store.lotteon.com/cm/main/login_SO.wsp' };
    };
    const tabs = createTabPages(deps(chromeApi));
    await tabs.keep('https://store.lotteon.com', tabs.attach(3));
    expect(await tabs.reclaimKept('https://store.lotteon.com')).toBeNull();

    const first = await tabs.open('about:blank');
    await tabs.keep('https://store.lotteon.com', first);
    await tabs.keep('https://store.lotteon.com', { ...first, tabId: 11 });
    expect(log).toContain('remove 9');
    expect((await tabs.reclaimKept('https://store.lotteon.com'))?.tabId).toBe(11);
  });
});

describe('sweepDialogGuards — 서비스워커가 다시 뜰 때 남은 가드 지우기(리뷰 MUST 2)', () => {
  it('등록된 content script 중 kiditem-dialog-guard-* 만 지운다', async () => {
    const removed: string[][] = [];
    const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }) });
    chromeApi.scripting.getRegisteredContentScripts = async () => [
      { id: 'kiditem-dialog-guard-1-1' }, { id: 'other-script' }, { id: 'kiditem-dialog-guard-2-5' },
    ];
    chromeApi.scripting.unregisterContentScripts = async (filter) => { removed.push([...(filter?.ids ?? [])]); };
    await sweepDialogGuards(chromeApi);
    expect(removed).toEqual([['kiditem-dialog-guard-1-1', 'kiditem-dialog-guard-2-5']]);
  });

  it('남은 가드가 없거나 API가 없으면 아무것도 하지 않고, 실패해도 던지지 않는다', async () => {
    const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }) });
    await expect(sweepDialogGuards(chromeApi)).resolves.toBeUndefined();
    chromeApi.scripting.getRegisteredContentScripts = async () => { throw new Error('boom'); };
    await expect(sweepDialogGuards(chromeApi)).resolves.toBeUndefined();
  });
});

describe('sweepDialogGuards — 시작 시 남은 대화상자 가드 정리', () => {
  it('scripting이 없는 chrome(옛 하네스)에서는 던지지 않고 끝낸다', async () => {
    await expect(sweepDialogGuards(undefined)).resolves.toBeUndefined();
    await expect(sweepDialogGuards({} as never)).resolves.toBeUndefined();
  });

  it('kiditem-dialog-guard- 접두 id만 해제한다', async () => {
    const unregistered: string[][] = [];
    await sweepDialogGuards({
      scripting: {
        executeScript: async () => [],
        getRegisteredContentScripts: async () => [{ id: 'kiditem-dialog-guard-a' }, { id: 'other' }, { id: 'kiditem-dialog-guard-b' }],
        unregisterContentScripts: async (filter?: { ids?: string[] }) => { unregistered.push(filter?.ids ?? []); },
      },
    } as never);
    expect(unregistered).toEqual([['kiditem-dialog-guard-a', 'kiditem-dialog-guard-b']]);
  });
});

describe('installDialogGuardAnswer — 수집 탭인지 답한다(실기기 R1)', () => {
  it('이 런타임이 연 탭(수집 중)만 수집 탭이다 — 닫거나 운영자에게 남기면 아니다, 붙인 운영자 탭은 아니다', async () => {
    const { chromeApi } = fakeChrome({ sendMessage: async () => ({ ok: true }) });
    const tabs = createTabPages(deps(chromeApi));
    const listeners: Array<(message: unknown, sender: { tab?: { id?: number } }, sendResponse: (answer: unknown) => void) => unknown> = [];
    installDialogGuardAnswer({ runtime: { onMessage: { addListener: (listener) => listeners.push(listener) } } }, tabs);
    const ask = (tabId: number | undefined, message: unknown = { action: 'kiditem.dialogGuard.isRunTab' }) => {
      const answers: unknown[] = [];
      const handled = listeners[0]!(message, tabId === undefined ? {} : { tab: { id: tabId } }, (answer) => answers.push(answer));
      return { handled, answers };
    };
    const page = await tabs.open('about:blank');
    expect(ask(9).answers).toEqual([{ runTab: true }]);
    expect(ask(4).answers).toEqual([{ runTab: false }]);
    expect(ask(undefined).answers).toEqual([{ runTab: false }]);
    // 다른 메시지는 받지 않는다(다른 수신자가 답한다).
    expect(ask(9, { action: 'other' })).toEqual({ handled: undefined, answers: [] });

    await tabs.keep('https://mall.test', page);
    expect(ask(9).answers).toEqual([{ runTab: false }]);
    const again = await tabs.reclaimKept('https://mall.test');
    expect(again?.tabId).toBe(9);
    expect(ask(9).answers).toEqual([{ runTab: true }]);
    await again!.close();
    expect(ask(9).answers).toEqual([{ runTab: false }]);
    tabs.attach(4);
    expect(ask(4).answers).toEqual([{ runTab: false }]);
  });
});

describe('TabPage.ask — 읽기가 답하지 못하면 탭 주소를 다시 본다(실기기 R4)', () => {
  const GUARD: PageGuard = {
    allows: (url) => url.hostname === 'shopping-seller.kakao.com',
    isLogin: (url) => url.hostname === 'accounts.kakao.com',
    loginMessage: '카카오 로그인이 필요합니다.',
  };

  it('읽는 사이 로그인 화면으로 넘어가 처리기가 없으면(content_script_missing) SITE_LOGIN_REQUIRED — 탭은 운영자에게 남는다', async () => {
    const { chromeApi } = fakeChrome({
      sendMessage: async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); },
      urls: ['https://shopping-seller.kakao.com/product/store-seller/list', 'https://shopping-seller.kakao.com/product/store-seller/list', 'https://accounts.kakao.com/login?continue=x'],
    });
    const page = createTabPages(deps(chromeApi)).attach(4);
    const error = await page.ask({ type: 'X' }, { timeoutMs: 1_000, inject: { isolated: ['a.js'] }, guard: GUARD }).then(() => null, (caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'SITE_LOGIN_REQUIRED', message: '카카오 로그인이 필요합니다.' });
    expect(leftForOperator(error)).toBe(true);
  });

  it('주소가 그대로면 답을 그대로 돌려준다', async () => {
    const { chromeApi } = fakeChrome({
      sendMessage: async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); },
      url: 'https://shopping-seller.kakao.com/product/store-seller/list',
    });
    const page = createTabPages(deps(chromeApi)).attach(4);
    await expect(page.ask({ type: 'X' }, { timeoutMs: 1_000, inject: { isolated: ['a.js'] }, guard: GUARD })).resolves.toEqual({ ok: false, error: 'content_script_missing' });
  });
});
