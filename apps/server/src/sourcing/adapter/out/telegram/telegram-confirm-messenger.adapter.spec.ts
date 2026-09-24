import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeConfirmPayload, itemKeyPrefix, type ConfirmMessage } from '../../../domain/sourcing-confirm-report';
import { TelegramConfirmMessengerAdapter } from './telegram-confirm-messenger.adapter';

const TOKEN = '123456:telegram-test-secret';
const CHAT_ID = '987654321';
const ORG = '0f9c2b1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b';
const ORIGINAL_FETCH = globalThis.fetch;
const ENV_KEYS = [
  'SOURCING_CONFIRM_TELEGRAM_BOT_TOKEN',
  'SOURCING_CONFIRM_TELEGRAM_CHAT_ID',
  'SOURCING_CONFIRM_TELEGRAM_ALLOWED_USER_IDS',
  'SOURCING_CONFIRM_TELEGRAM_POLLING',
  'SOURCING_CONFIRM_TELEGRAM_ORGANIZATION_ID',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function ok(result: unknown): Response {
  return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function fail(status: number, description: string): Response {
  return new Response(JSON.stringify({ ok: false, error_code: status, description }), { status });
}

const payload = encodeConfirmPayload({ action: 'approve', no: 1, organizationId: ORG, keyPrefix: itemKeyPrefix('ab'.repeat(32)), version: 0 });
const message: ConfirmMessage = {
  lines: [[{ text: '⬜ 1. ' }, { text: '슬라임 <대용량> & 키트', bold: true }], [{ text: '1688에서 보기', href: 'https://detail.1688.com/offer/1.html?a=1&b="2"' }]],
  buttons: [[{ label: '✅ 1 승인', payload }]],
};

describe('TelegramConfirmMessengerAdapter', () => {
  beforeEach(() => {
    process.env.SOURCING_CONFIRM_TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.SOURCING_CONFIRM_TELEGRAM_CHAT_ID = CHAT_ID;
    delete process.env.SOURCING_CONFIRM_TELEGRAM_ALLOWED_USER_IDS;
    delete process.env.SOURCING_CONFIRM_TELEGRAM_POLLING;
    process.env.SOURCING_CONFIRM_TELEGRAM_ORGANIZATION_ID = ORG;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    for (const key of ENV_KEYS) {
      if (ORIGINAL_ENV[key] == null) delete process.env[key];
      else process.env[key] = ORIGINAL_ENV[key];
    }
    vi.restoreAllMocks();
  });

  it('설정이 없으면 보고도 답장 받기도 꺼져 있다', () => {
    delete process.env.SOURCING_CONFIRM_TELEGRAM_BOT_TOKEN;
    delete process.env.SOURCING_CONFIRM_TELEGRAM_CHAT_ID;
    expect(new TelegramConfirmMessengerAdapter().setup()).toEqual({
      configured: false,
      chatConfigured: false,
      listening: false,
      organizationId: ORG,
    });

    process.env.SOURCING_CONFIRM_TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.SOURCING_CONFIRM_TELEGRAM_POLLING = '0';
    expect(new TelegramConfirmMessengerAdapter().setup()).toEqual({
      configured: true,
      chatConfigured: false,
      listening: false,
      organizationId: ORG,
    });
  });

  it('⭐ 묶을 조직(SOURCING_CONFIRM_TELEGRAM_ORGANIZATION_ID)이 없거나 UUID 가 아니면 답장 받기를 켜지 않는다', () => {
    expect(new TelegramConfirmMessengerAdapter().setup()).toMatchObject({ listening: true, organizationId: ORG });

    delete process.env.SOURCING_CONFIRM_TELEGRAM_ORGANIZATION_ID;
    expect(new TelegramConfirmMessengerAdapter().setup()).toMatchObject({ listening: false, organizationId: null });

    process.env.SOURCING_CONFIRM_TELEGRAM_ORGANIZATION_ID = 'not-a-uuid';
    expect(new TelegramConfirmMessengerAdapter().setup()).toMatchObject({ listening: false, organizationId: null });
  });

  it('⭐ 보고는 설정된 채팅으로, 글자는 HTML 로 이스케이프하고 버튼 값에는 서명을 붙인다', async () => {
    const fetchMock = vi.fn(async () => ok({ message_id: 77 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(new TelegramConfirmMessengerAdapter().sendReport(message)).resolves.toEqual({ messageId: 77 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe(CHAT_ID);
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toBe(
      '⬜ 1. <b>슬라임 &lt;대용량&gt; &amp; 키트</b>\n<a href="https://detail.1688.com/offer/1.html?a=1&amp;b=&quot;2&quot;">1688에서 보기</a>',
    );
    const data = body.reply_markup.inline_keyboard[0][0].callback_data as string;
    expect(data.startsWith(`${payload}.`)).toBe(true);
    expect(Buffer.byteLength(data, 'utf8')).toBeLessThanOrEqual(64);
  });

  it('⭐ 실패해도 토큰은 오류 문구에 싣지 않는다', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError(`fetch failed https://api.telegram.org/bot${TOKEN}/sendMessage`);
    }) as typeof fetch;
    const error = await new TelegramConfirmMessengerAdapter().sendReport(message).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain(TOKEN);

    globalThis.fetch = vi.fn(async () => fail(400, 'Bad Request: chat not found')) as typeof fetch;
    await expect(new TelegramConfirmMessengerAdapter().sendReport(message)).rejects.toMatchObject({ status: 400 });
  });

  it('고친 내용이 같다는 답은 실패가 아니다', async () => {
    globalThis.fetch = vi.fn(async () => fail(400, 'Bad Request: message is not modified')) as typeof fetch;
    await expect(new TelegramConfirmMessengerAdapter().editReport(77, message)).resolves.toBeUndefined();
  });

  it('⭐ 답장은 서명을 검사하고, 설정된 채팅의 주인만 결정할 수 있다', async () => {
    // 보낸 버튼의 서명을 얻는다.
    const sendMock = vi.fn(async () => ok({ message_id: 77 }));
    globalThis.fetch = sendMock as typeof fetch;
    const adapter = new TelegramConfirmMessengerAdapter();
    await adapter.sendReport(message);
    const signed = JSON.parse(String((sendMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).reply_markup
      .inline_keyboard[0][0].callback_data as string;

    const callback = (id: number, from: number, chat: string, data: string) => ({
      update_id: id,
      callback_query: {
        id: `cb-${id}`,
        from: { id: from },
        data,
        message: { message_id: 77, chat: { id: Number(chat) }, reply_markup: { inline_keyboard: [[{ text: '✅ 1 승인', callback_data: signed }]] } },
      },
    });
    const updates = vi.fn(async () =>
      ok([
        callback(10, Number(CHAT_ID), CHAT_ID, signed),
        callback(11, Number(CHAT_ID), CHAT_ID, `${payload}.forgedsig0`),
        callback(12, 555, CHAT_ID, signed),
        callback(13, Number(CHAT_ID), '-100200', signed),
        { update_id: 14, message: { chat: { id: 42 }, from: { id: 42 }, text: '/start' } },
      ]),
    );
    globalThis.fetch = updates as typeof fetch;

    const result = await adapter.receive(new AbortController().signal);
    expect(result.kind).toBe('ok');
    const events = result.kind === 'ok' ? result.events : [];
    expect(events.map((event) => (event.kind === 'button' ? [event.authorized, event.payload] : [event.authorized, event.text]))).toEqual([
      [true, payload],
      [true, null],
      [false, payload],
      [false, payload],
      [false, '/start'],
    ]);
    expect(events[0]?.kind === 'button' && events[0].messagePayloads).toEqual([payload]);

    // 다음 요청은 받은 것 다음부터.
    updates.mockResolvedValueOnce(ok([]));
    await adapter.receive(new AbortController().signal);
    expect(JSON.parse(String((updates.mock.calls[1] as unknown as [string, RequestInit])[1].body)).offset).toBe(15);
  });

  it('허용 목록이 있으면 목록에 든 사람만 결정할 수 있다', async () => {
    process.env.SOURCING_CONFIRM_TELEGRAM_CHAT_ID = '-100200';
    process.env.SOURCING_CONFIRM_TELEGRAM_ALLOWED_USER_IDS = '111, 222';
    globalThis.fetch = vi.fn(async () =>
      ok([
        { update_id: 1, message: { chat: { id: -100200 }, from: { id: 222 }, text: '/id' } },
        { update_id: 2, message: { chat: { id: -100200 }, from: { id: 333 }, text: '/id' } },
      ]),
    ) as typeof fetch;
    const result = await new TelegramConfirmMessengerAdapter().receive(new AbortController().signal);
    expect(result.kind === 'ok' && result.events.map((event) => event.authorized)).toEqual([true, false]);
  });

  it('같은 봇을 다른 곳이 읽으면 conflict, 토큰이 틀리면 unauthorized', async () => {
    globalThis.fetch = vi.fn(async () => fail(409, 'Conflict: terminated by other getUpdates request')) as typeof fetch;
    await expect(new TelegramConfirmMessengerAdapter().receive(new AbortController().signal)).resolves.toEqual({ kind: 'conflict' });

    globalThis.fetch = vi.fn(async () => fail(401, 'Unauthorized')) as typeof fetch;
    await expect(new TelegramConfirmMessengerAdapter().receive(new AbortController().signal)).resolves.toEqual({ kind: 'unauthorized' });
  });
});
