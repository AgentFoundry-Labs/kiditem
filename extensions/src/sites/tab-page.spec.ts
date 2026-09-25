import { describe, expect, it } from 'vitest';
import { createTabPages, type TabPageChrome } from './tab-page';

function fakeChrome(options: { sendMessage: (message: unknown, call: number) => Promise<unknown>; statuses?: string[] }) {
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
        return { status, url: 'https://s.1688.com/x' };
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
});
