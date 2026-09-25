import { describe, expect, it } from 'vitest';
import { createTabPages, type PageGuard, type TabPageChrome } from './tab-page';

function fakeChrome(options: { sendMessage: (message: unknown, call: number) => Promise<unknown>; statuses?: string[]; url?: string; urls?: string[] }) {
  const log: string[] = [];
  let sends = 0;
  let gets = 0;
  const chromeApi: TabPageChrome = {
    tabs: {
      create: async (properties) => { log.push(`create ${properties.url} active=${properties.active}`); return { id: 9 }; },
      update: async (tabId, properties) => { log.push(`update ${tabId} ${properties.url}`); },
      get: async () => {
        const status = options.statuses?.[gets] ?? 'complete';
        gets += 1;
        return { status, url: options.urls?.[Math.min(gets - 1, options.urls.length - 1)] ?? options.url ?? 'https://s.1688.com/x' };
      },
      remove: async (tabId) => { log.push(`remove ${tabId}`); },
      sendMessage: async (_tabId, message) => { sends += 1; return options.sendMessage(message, sends); },
    },
    scripting: { executeScript: async (injection) => { log.push(`inject ${injection.world ?? 'ISOLATED'} ${injection.files.join(',')}`); } },
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
