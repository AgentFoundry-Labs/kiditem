import { describe, expect, it } from 'vitest';
import { createBrowserResources, type BrowserChrome } from './browser';
import { RuntimeError } from './errors';

const OP = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '33333333-3333-4333-8333-333333333333';
const SITES = { wing: { origin: 'https://wing.example.com' }, 'ad-center': { origin: 'https://ads.example.com' } };

function fakeChrome(existing: Array<{ id: number; url: string }> = []) {
  const created: Array<{ url: string; active?: boolean }> = [];
  const removed: number[] = [];
  const queries: string[] = [];
  let nextId = 100;
  const chrome: BrowserChrome = {
    tabs: {
      async query(query) {
        const pattern = String(query.url);
        queries.push(pattern);
        const prefix = pattern.replace(/\*$/, '');
        return existing.filter((tab) => tab.url.startsWith(prefix)).map((tab) => ({ id: tab.id }));
      },
      async create(properties) {
        created.push({ url: String(properties.url), active: properties.active });
        return { id: nextId++ };
      },
      async remove(tabId) {
        removed.push(tabId as number);
      },
    },
  };
  return { chrome, created, removed, queries };
}

const signal = () => new AbortController().signal;

describe('createBrowserResources — lockKey 이름으로 탭을 잡고 푼다', () => {
  it('org만 잡는 실행은 탭이 없다', async () => {
    const fake = fakeChrome();
    const lease = await createBrowserResources(fake.chrome, SITES).acquire({ operationId: OP, lockKeys: ['org'], signal: signal() });

    expect(lease.tabId).toBeNull();
    await lease.release();
    expect(fake.created).toEqual([]);
    expect(fake.queries).toEqual([]);
  });

  it('resource:<site>:<id>는 그 사이트 탭을 재사용하고 release해도 닫지 않는다', async () => {
    const fake = fakeChrome([{ id: 7, url: 'https://ads.example.com/campaigns' }]);
    const lease = await createBrowserResources(fake.chrome, SITES).acquire({
      operationId: OP,
      lockKeys: [`resource:ad-center:${ACCOUNT}`],
      signal: signal(),
    });

    expect(lease.tabId).toBe(7);
    expect(fake.queries).toEqual(['https://ads.example.com/*']);
    await lease.release();
    expect(fake.removed).toEqual([]);
  });

  it('탭이 없으면 새로 열고 release에서 그 탭만 닫는다(두 번째 release는 no-op)', async () => {
    const fake = fakeChrome([{ id: 7, url: 'https://other.example.com/' }]);
    const lease = await createBrowserResources(fake.chrome, SITES).acquire({ operationId: OP, lockKeys: ['resource:wing:vendor-1'], signal: signal() });

    expect(lease.tabId).toBe(100);
    expect(fake.created).toEqual([{ url: 'https://wing.example.com', active: false }]);
    await lease.release();
    await lease.release();
    expect(fake.removed).toEqual([100]);
  });

  it('account:<id>는 accountSite로 정한 사이트의 탭을 쓴다', async () => {
    const fake = fakeChrome([{ id: 9, url: 'https://wing.example.com/vendor' }]);
    const lease = await createBrowserResources(fake.chrome, SITES, { accountSite: 'wing' }).acquire({
      operationId: OP,
      lockKeys: [`account:${ACCOUNT}`],
      signal: signal(),
    });

    expect(lease.tabId).toBe(9);
  });

  it('sites에 없는 resource 슬롯(예 keyword)은 탭이 필요 없다', async () => {
    const fake = fakeChrome();
    const lease = await createBrowserResources(fake.chrome, SITES).acquire({ operationId: OP, lockKeys: ['resource:keyword:장난감'], signal: signal() });

    expect(lease.tabId).toBeNull();
    expect(fake.queries).toEqual([]);
  });

  it('같은 실행이 release 전에 acquire를 또 부르면 오류', async () => {
    const resources = createBrowserResources(fakeChrome().chrome, SITES);
    await resources.acquire({ operationId: OP, lockKeys: ['org'], signal: signal() });

    const error = await resources.acquire({ operationId: OP, lockKeys: ['org'], signal: signal() }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RuntimeError);
    expect((error as RuntimeError).code).toBe('RUNTIME_BROWSER_ALREADY_ACQUIRED');
  });

  it('두 사이트의 탭을 한 실행이 동시에 잡을 수는 없다', async () => {
    const resources = createBrowserResources(fakeChrome().chrome, SITES);

    const error = await resources
      .acquire({ operationId: OP, lockKeys: ['resource:wing:a', 'resource:ad-center:b'], signal: signal() })
      .catch((caught: unknown) => caught);

    expect((error as RuntimeError).code).toBe('RUNTIME_BROWSER_UNAVAILABLE');
  });
});
