import { describe, expect, it } from 'vitest';
import { RuntimeError } from './errors';
import { SITE_REQUEST_FAILED, createSiteCaller, delayUntilNext, type SiteCallerDeps } from './site-caller';

describe('delayUntilNext — 사이트 요청 간격', () => {
  it('첫 요청은 기다리지 않는다', () => {
    expect(delayUntilNext({ lastSentAt: null, now: 1_000, minIntervalMs: 2_200 })).toBe(0);
  });
  it('간격이 남았으면 남은 만큼 기다린다', () => {
    expect(delayUntilNext({ lastSentAt: 1_000, now: 1_500, minIntervalMs: 2_200 })).toBe(1_700);
  });
  it('간격이 지났으면 0', () => {
    expect(delayUntilNext({ lastSentAt: 1_000, now: 9_000, minIntervalMs: 2_200 })).toBe(0);
  });
});

function fakeSite(respond: (url: string, init: RequestInit | undefined) => Response = () => Response.json({ ok: true }), cookie: string | null = null) {
  let clock = 10_000;
  const sent: Array<{ url: string; at: number; headers: Headers; init: RequestInit | undefined }> = [];
  const sleeps: number[] = [];
  const cookieQueries: Array<{ url: string; name: string }> = [];
  const deps: SiteCallerDeps = {
    async fetch(input, init) {
      const url = String(input);
      sent.push({ url, at: clock, headers: new Headers(init?.headers), init });
      return respond(url, init);
    },
    cookies: {
      async get(details) {
        cookieQueries.push({ url: details.url, name: details.name });
        return cookie === null ? null : { value: cookie };
      },
    },
    now: () => clock,
    async sleep(ms) {
      sleeps.push(ms);
      clock += ms;
    },
  };
  return { deps, sent, sleeps, cookieQueries, advance: (ms: number) => { clock += ms; } };
}

async function rejection(promise: Promise<unknown>): Promise<RuntimeError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(RuntimeError);
  return error as RuntimeError;
}

describe('createSiteCaller — 사이트 요청 공용 규칙', () => {
  it('같은 호출기의 요청 사이 최소 간격을 지킨다', async () => {
    const site = fakeSite();
    const caller = createSiteCaller({ minIntervalMs: 2_200 }, site.deps);

    await caller.json('https://site.example.com/a');
    site.advance(500);
    await caller.json('https://site.example.com/b');
    site.advance(5_000);
    await caller.json('https://site.example.com/c');

    expect(site.sleeps).toEqual([1_700]);
    expect(site.sent.map((request) => request.at)).toEqual([10_000, 12_200, 17_200]);
  });

  it('동시에 부른 요청도 차례로 간격을 둔다', async () => {
    const site = fakeSite();
    const caller = createSiteCaller({ minIntervalMs: 1_000 }, site.deps);

    await Promise.all([caller.json('https://site.example.com/a'), caller.json('https://site.example.com/b')]);

    expect(site.sent.map((request) => request.at)).toEqual([10_000, 11_000]);
  });

  it('xsrf 옵션이 있으면 쿠키 값을 디코딩해 헤더로 싣고 쿠키를 포함해 보낸다', async () => {
    const site = fakeSite(undefined, 'abc%3D%3D');
    const caller = createSiteCaller(
      { minIntervalMs: 0, xsrf: { cookieUrl: 'https://wing.example.com', cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' } },
      site.deps,
    );

    await expect(caller.json('https://wing.example.com/api/x')).resolves.toEqual({ ok: true });

    expect(site.cookieQueries).toEqual([{ url: 'https://wing.example.com', name: 'XSRF-TOKEN' }]);
    expect(site.sent[0].headers.get('X-XSRF-TOKEN')).toBe('abc==');
    expect(site.sent[0].init?.credentials).toBe('include');
  });

  it('xsrf 쿠키가 없으면 헤더 없이 보낸다 — 로그인 판정은 응답(401·403·리다이렉트)으로만 한다', async () => {
    const site = fakeSite();
    const caller = createSiteCaller(
      { minIntervalMs: 0, xsrf: { cookieUrl: 'https://wing.example.com', cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' } },
      site.deps,
    );

    await expect(caller.json('https://wing.example.com/api/x')).resolves.toEqual({ ok: true });

    expect(site.sent).toHaveLength(1);
    expect(site.sent[0]!.headers.has('X-XSRF-TOKEN')).toBe(false);
  });

  it('XSRF가 꼭 필요한 요청(requireXsrf)은 쿠키가 없으면 보내지 않고 SITE_LOGIN_REQUIRED', async () => {
    const site = fakeSite();
    const caller = createSiteCaller(
      { minIntervalMs: 0, xsrf: { cookieUrl: 'https://wing.example.com', cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' } },
      site.deps,
    );

    const error = await rejection(caller.json('https://wing.example.com/api/x', { method: 'POST', requireXsrf: true }));

    expect(error.code).toBe('SITE_LOGIN_REQUIRED');
    expect(site.sent).toEqual([]);
  });

  it.each([401, 403])('%s는 SITE_LOGIN_REQUIRED', async (status) => {
    const site = fakeSite(() => new Response('', { status }));

    const error = await rejection(createSiteCaller({ minIntervalMs: 0 }, site.deps).json('https://site.example.com/a'));

    expect(error.code).toBe('SITE_LOGIN_REQUIRED');
    expect(error.details).toEqual({ status, url: 'https://site.example.com/a' });
  });

  it('로그인 페이지로 가는 리다이렉트(manual → opaqueredirect)는 SITE_LOGIN_REQUIRED', async () => {
    const site = fakeSite();
    const opaque = { ok: false, status: 0, type: 'opaqueredirect', url: 'https://site.example.com/a', redirected: false } as unknown as Response;
    site.deps.fetch = async () => opaque;

    const error = await rejection(createSiteCaller({ minIntervalMs: 0 }, site.deps).text('https://site.example.com/a'));

    expect(error.code).toBe('SITE_LOGIN_REQUIRED');
  });

  it('그 밖의 2xx 아닌 응답은 SITE_REQUEST_FAILED{status, url}', async () => {
    const site = fakeSite(() => new Response('busy', { status: 503 }));

    const error = await rejection(createSiteCaller({ minIntervalMs: 0 }, site.deps).text('https://site.example.com/a'));

    expect(error.code).toBe('SITE_REQUEST_FAILED');
    expect(error.details).toEqual({ status: 503, url: 'https://site.example.com/a', reason: 'http', bodyHead: 'busy' });
  });

  it('2xx인데 JSON이 아니면 SITE_REQUEST_FAILED{reason: not_json} — 본문 앞 120자를 공백을 줄여 싣는다(봇·레이트 페이지 진단)', async () => {
    const html = `<html>\n  <head><title>Access   Denied</title></head>\n<body>${'x'.repeat(200)}</body></html>`;
    const site = fakeSite(() => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }));

    const error = await rejection(createSiteCaller({ minIntervalMs: 0 }, site.deps).json('https://site.example.com/a'));

    const expectedHead = html.replace(/\s+/g, ' ').trim().slice(0, 120);
    expect(expectedHead.startsWith('<html> <head><title>Access Denied</title></head> <body>xxx')).toBe(true);
    expect(error.code).toBe('SITE_REQUEST_FAILED');
    expect(error.details).toEqual({ status: 200, url: 'https://site.example.com/a', reason: 'not_json', bodyHead: expectedHead });
  });

  it('연결 오류는 SITE_REQUEST_FAILED{status: null, reason: network}', async () => {
    const site = fakeSite();
    site.deps.fetch = async () => { throw new TypeError('Failed to fetch'); };

    const error = await rejection(createSiteCaller({ minIntervalMs: 0 }, site.deps).json('https://site.example.com/a'));

    expect(error.code).toBe('SITE_REQUEST_FAILED');
    expect(error.details).toEqual({ status: null, url: 'https://site.example.com/a', reason: 'network', bodyHead: null });
  });

  it('timeoutMs 안에 응답이 없으면 요청을 끊고 SITE_REQUEST_FAILED{reason: timeout}', async () => {
    const site = fakeSite();
    site.deps.fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    });

    const error = await rejection(createSiteCaller({ minIntervalMs: 0, timeoutMs: 20 }, site.deps).json('https://site.example.com/a'));

    expect(error.code).toBe('SITE_REQUEST_FAILED');
    expect(error.details).toEqual({ status: null, url: 'https://site.example.com/a', reason: 'timeout', bodyHead: null });
  });

  it('text는 본문을 그대로 돌려준다', async () => {
    const site = fakeSite(() => new Response('<html>ok</html>', { status: 200 }));

    await expect(createSiteCaller({ minIntervalMs: 0 }, site.deps).text('https://site.example.com/a')).resolves.toBe('<html>ok</html>');
  });

  it('bytes는 본문 바이트를 그대로 돌려준다(엑셀 내려받기)', async () => {
    const site = fakeSite(() => new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { status: 200 }));

    await expect(createSiteCaller({ minIntervalMs: 0 }, site.deps).bytes('https://site.example.com/file'))
      .resolves.toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
  });

  it('displayName이 있으면 로그인 문장에 사이트 이름을 싣는다(운영자가 어디에 로그인할지 안다)', async () => {
    const site = fakeSite(() => new Response('', { status: 401 }));

    const error = await rejection(createSiteCaller({ minIntervalMs: 0, displayName: '쿠팡 윙' }, site.deps).json('https://site.example.com/a'));

    expect(error.message).toBe('쿠팡 윙 로그인이 필요합니다.');
  });

  it('names a 200 body that is not JSON (a login page served as 200)', async () => {
    const site = fakeSite(() => new Response('<html>login</html>', { status: 200 }));

    const error = await rejection(createSiteCaller({ minIntervalMs: 0 }, site.deps).json('https://site.example.com/a'));

    expect(error).toMatchObject({ code: SITE_REQUEST_FAILED, details: { status: 200, reason: 'not_json' } });
  });
});
