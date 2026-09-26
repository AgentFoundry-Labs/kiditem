import { describe, expect, it } from 'vitest';
import bridgeSource from '../kiditem-os/content/page-call/bridge.js?raw';
import runnerSource from '../kiditem-os/content/page-call/runner.js?raw';

// 페이지 호출 브리지(ISOLATED)·러너(MAIN) 파일을 실제 그대로, 한 창(window)을 나눠 쓰는 두 world로 돌린다.
// 가짜는 창의 postMessage와 chrome.runtime.onMessage 경계뿐이다.
const ORIGIN = 'https://kiditem.sellpia.com';

function page() {
  const listeners: Array<(event: { source: unknown; origin: string; data: unknown }) => void> = [];
  const posted: unknown[] = [];
  const window = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: { source: unknown; origin: string; data: unknown }) => void) => {
      if (type === 'message') listeners.push(listener);
    },
    postMessage: (data: unknown, origin: string) => {
      expect(origin).toBe(ORIGIN);
      posted.push(data);
      setTimeout(() => listeners.slice().forEach((listener) => listener({ source: window, origin: ORIGIN, data })), 0);
    },
  } as Record<string, unknown>;
  let onMessage: ((message: unknown, sender: unknown, sendResponse: (answer: unknown) => void) => unknown) | null = null;
  // 두 world는 창(window)만 나눠 쓴다. ISOLATED의 전역(globalThis)은 따로 둔다.
  const isolated: Record<string, unknown> = {};
  const chrome = { runtime: { onMessage: { addListener: (listener: typeof onMessage) => { onMessage = listener; } } } };
  return {
    window,
    installBridge: () => new Function('window', 'globalThis', 'chrome', bridgeSource)(window, isolated, chrome),
    installRunner: () => new Function('window', runnerSource)(window),
    isolated,
    posted,
    send: (message: Record<string, unknown>) =>
      new Promise((resolve) => {
        if (!onMessage) throw new Error('bridge not installed');
        onMessage(message, {}, resolve);
      }),
  };
}

describe('page-call bridge (ISOLATED) + runner (MAIN)', () => {
  it('MAIN 처리기의 값을 돌려주고, 처리기가 던지면 ok:false와 문장을 돌려준다', async () => {
    const tab = page();
    tab.installBridge();
    tab.installRunner();
    const calls = tab.window.__kiditemPageCalls as Record<string, (args: unknown) => unknown>;
    calls['site.read'] = async (args) => ({ echoed: args });
    calls['site.broken'] = async () => {
      throw new Error('boom');
    };
    await expect(tab.send({ type: 'KIDITEM_PAGE_CALL', call: 'site.read', args: { day: '2026-09-07' } })).resolves.toEqual({ ok: true, value: { echoed: { day: '2026-09-07' } } });
    await expect(tab.send({ type: 'KIDITEM_PAGE_CALL', call: 'site.broken' })).resolves.toEqual({ ok: false, error: 'boom' });
  });

  it('러너는 있는데 처리기가 없으면 곧바로, 러너도 없으면 1초 뒤 content_script_missing(호출하는 쪽이 주입하고 다시 묻는다)', async () => {
    const withRunner = page();
    withRunner.installBridge();
    withRunner.installRunner();
    await expect(withRunner.send({ type: 'KIDITEM_PAGE_CALL', call: 'site.absent' })).resolves.toEqual({ ok: false, error: 'content_script_missing' });

    const bare = page();
    bare.installBridge();
    const started = Date.now();
    await expect(bare.send({ type: 'KIDITEM_PAGE_CALL', call: 'site.read' })).resolves.toEqual({ ok: false, error: 'content_script_missing' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it('ISOLATED world에 등록된 처리기는 MAIN을 거치지 않고 부른다, 다른 메시지는 받지 않는다', async () => {
    const tab = page();
    tab.installBridge();
    (tab.isolated.__kiditemIsolatedPageCalls as Record<string, () => Promise<string>>)['site.dom'] = async () => 'from isolated';
    await expect(tab.send({ type: 'KIDITEM_PAGE_CALL', call: 'site.dom' })).resolves.toEqual({ ok: true, value: 'from isolated' });
  });

  it('ISOLATED 전용 호출(world: isolated — 로그인 폼 채우기)은 처리기가 없으면 MAIN으로 넘기지 않고 곧바로 content_script_missing(KID-377 리뷰 S2)', async () => {
    // 프레임이 옮겨 가 브리지만 다시 들어온 문서: 로그인 처리기는 없고 MAIN 러너는 있다. 자격이 페이지로 새면 안 된다.
    const tab = page();
    tab.installBridge();
    tab.installRunner();
    const message = { type: 'KIDITEM_PAGE_CALL', call: 'login.fill', world: 'isolated', args: { values: { loginId: 'fake-id', password: 'fake-password' } } };
    await expect(tab.send(message)).resolves.toEqual({ ok: false, error: 'content_script_missing' });
    expect(JSON.stringify(tab.posted)).not.toContain('fake-password');
    expect(tab.posted).toEqual([]);

    (tab.isolated.__kiditemIsolatedPageCalls as Record<string, () => unknown>)['login.fill'] = () => ({ state: 'submitted' });
    await expect(tab.send(message)).resolves.toEqual({ ok: true, value: { state: 'submitted' } });
  });
});
