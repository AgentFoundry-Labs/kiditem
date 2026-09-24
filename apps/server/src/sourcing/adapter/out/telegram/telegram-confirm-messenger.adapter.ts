import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  ConfirmMessengerEvent,
  ConfirmMessengerReceiveResult,
  ConfirmMessengerSetup,
  SourcingConfirmMessengerPort,
} from '../../../application/port/out/provider/sourcing-confirm-messenger.port';
import type { ConfirmMessage, ConfirmSegment } from '../../../domain/sourcing-confirm-report';

const API_ORIGIN = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 15_000;
/** 봇 이름은 상태 화면이 읽는다. 늦으면 이름 없이 그린다. */
const IDENTITY_TIMEOUT_MS = 4_000;
const IDENTITY_RETRY_MS = 60_000;
/** 답장을 기다리는 긴 요청 한 번의 길이(초). */
const POLL_TIMEOUT_S = 25;
const MAX_UPDATES = 50;
const MAX_RETRY_WAIT_MS = 10_000;
/** 텔레그램 버튼 값의 상한(바이트). */
const MAX_CALLBACK_BYTES = 64;
const SIGNATURE_LENGTH = 10;
const SIGNING_CONTEXT = 'kiditem.sourcing-confirm.callback.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

interface TelegramConfig {
  token: string | null;
  chatId: string | null;
  allowedUserIds: ReadonlySet<string>;
  pollingDisabled: boolean;
  organizationId: string | null;
}

/** 편집한 내용이 이미 같을 때. 실패가 아니다. */
class TelegramNotModified extends Error {}

/**
 * 사장님 컨펌 보고를 텔레그램 봇으로 주고받는다.
 *
 * - 토큰은 요청 주소에만 들어가고, 오류 · 로그 · 응답 어디에도 싣지 않는다. 그래서 fetch
 *   오류의 원문을 그대로 던지지 않고 우리 말로 바꾼다.
 * - 버튼 값에는 토큰에서 얻은 열쇠로 서명을 붙인다. 텔레그램 앱은 버튼 값을 임의로 만들어
 *   보낼 수 있으므로, 서명이 맞지 않는 값은 읽지 않는다.
 * - 답장은 긴 요청(getUpdates)으로 받는다. 사무실 서버는 HTTPS 공개 주소가 없어 웹훅을 받을
 *   수 없다. 같은 토큰으로 두 곳이 읽으면 텔레그램이 한쪽을 409로 끊으므로, 환경마다 봇을
 *   따로 만들고 기존 Claude 텔레그램 브리지 봇 토큰은 쓰지 않는다.
 */
@Injectable()
export class TelegramConfirmMessengerAdapter implements SourcingConfirmMessengerPort {
  private offset = 0;
  private username: string | null | undefined;
  private identityRetryAt = 0;

  setup(): ConfirmMessengerSetup {
    const config = readConfig();
    return {
      configured: config.token !== null,
      chatConfigured: config.chatId !== null,
      listening: config.token !== null && config.organizationId !== null && !config.pollingDisabled,
      organizationId: config.organizationId,
    };
  }

  async identity(): Promise<{ username: string | null }> {
    if (this.username !== undefined) return { username: this.username };
    if (Date.now() < this.identityRetryAt) return { username: null };
    try {
      const me = await this.call<JsonRecord>('getMe', {}, IDENTITY_TIMEOUT_MS);
      this.username = typeof me.username === 'string' ? me.username : null;
      return { username: this.username };
    } catch (error) {
      // 상태 화면은 몇 초마다 다시 묻는다. 실패한 뒤에는 잠시 묻지 않는다.
      this.identityRetryAt = Date.now() + IDENTITY_RETRY_MS;
      throw error;
    }
  }

  async sendReport(message: ConfirmMessage): Promise<{ messageId: number }> {
    const chatId = requireChatId();
    const sent = await this.call<JsonRecord>('sendMessage', { chat_id: chatId, ...this.messageBody(message) });
    if (typeof sent.message_id !== 'number') {
      throw new BadGatewayException('텔레그램이 보낸 메시지 번호를 돌려주지 않았습니다.');
    }
    return { messageId: sent.message_id };
  }

  async editReport(messageId: number, message: ConfirmMessage): Promise<void> {
    const chatId = requireChatId();
    try {
      await this.call('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        ...this.messageBody(message),
        reply_markup: { inline_keyboard: this.keyboard(message) },
      });
    } catch (error) {
      if (error instanceof TelegramNotModified) return;
      throw error;
    }
  }

  async reply(chatId: string, message: ConfirmMessage): Promise<void> {
    if (!/^-?\d+$/.test(chatId)) throw new BadRequestException('텔레그램 채팅 ID가 올바르지 않습니다.');
    await this.call('sendMessage', { chat_id: chatId, ...this.messageBody(message) });
  }

  async answer(replyToken: string, text: string): Promise<void> {
    await this.call('answerCallbackQuery', { callback_query_id: replyToken, text: text.slice(0, 190) });
  }

  async receive(signal: AbortSignal): Promise<ConfirmMessengerReceiveResult> {
    const config = readConfig();
    if (!config.token) return { kind: 'unavailable', retryAfterMs: 60_000 };

    let response: Response;
    try {
      response = await fetch(endpoint(config.token, 'getUpdates'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: this.offset > 0 ? this.offset : undefined,
          timeout: POLL_TIMEOUT_S,
          limit: MAX_UPDATES,
          allowed_updates: ['message', 'callback_query'],
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout((POLL_TIMEOUT_S + 10) * 1000)]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      return { kind: 'unavailable', retryAfterMs: 5_000 };
    }

    if (response.status === 409) return { kind: 'conflict' };
    if (response.status === 401 || response.status === 404) return { kind: 'unauthorized' };
    const body = await readBody(response);
    if (response.status === 429) return { kind: 'unavailable', retryAfterMs: retryAfterMs(body) };
    if (!response.ok || body?.ok !== true || !Array.isArray(body.result)) {
      return { kind: 'unavailable', retryAfterMs: 5_000 };
    }

    const key = signingKey(config.token);
    const events: ConfirmMessengerEvent[] = [];
    for (const update of body.result) {
      const record = recordValue(update);
      if (!record || typeof record.update_id !== 'number') continue;
      this.offset = Math.max(this.offset, record.update_id + 1);
      const event = toEvent(record, key, config);
      if (event) events.push(event);
    }
    return { kind: 'ok', events };
  }

  private messageBody(message: ConfirmMessage): JsonRecord {
    const keyboard = this.keyboard(message);
    return {
      text: toTelegramHtml(message),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    };
  }

  private keyboard(message: ConfirmMessage): Array<Array<{ text: string; callback_data: string }>> {
    if (message.buttons.length === 0) return [];
    const key = signingKey(requireToken());
    return message.buttons.map((row) =>
      row.map((button) => {
        const data = sign(key, button.payload);
        if (Buffer.byteLength(data, 'utf8') > MAX_CALLBACK_BYTES) {
          throw new Error('confirm button payload exceeds the Telegram callback limit');
        }
        return { text: button.label, callback_data: data };
      }),
    );
  }

  private async call<T = unknown>(method: string, body: JsonRecord, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    const token = requireToken();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(endpoint(token, method), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) throw new GatewayTimeoutException('텔레그램 응답이 늦어 요청을 끝내지 못했습니다.');
        throw new BadGatewayException('텔레그램에 연결하지 못했습니다.');
      }
      const parsed = await readBody(response);
      if (response.ok && parsed?.ok === true) return parsed.result as T;
      if (response.status === 429 && attempt === 0) {
        await delay(Math.min(retryAfterMs(parsed), MAX_RETRY_WAIT_MS));
        continue;
      }
      throw telegramError(response.status, typeof parsed?.description === 'string' ? parsed.description : '');
    }
    throw new BadGatewayException('텔레그램이 잠시 요청을 받지 않습니다. 조금 뒤 다시 시도해 주세요.');
  }
}

function readConfig(): TelegramConfig {
  const token = process.env.SOURCING_CONFIRM_TELEGRAM_BOT_TOKEN?.trim() || null;
  const chatId = process.env.SOURCING_CONFIRM_TELEGRAM_CHAT_ID?.trim() || null;
  const allowed = (process.env.SOURCING_CONFIRM_TELEGRAM_ALLOWED_USER_IDS ?? '')
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value));
  const organizationId = process.env.SOURCING_CONFIRM_TELEGRAM_ORGANIZATION_ID?.trim().toLowerCase() || null;
  return {
    token,
    chatId: chatId && /^-?\d+$/.test(chatId) ? chatId : null,
    allowedUserIds: new Set(allowed),
    pollingDisabled: process.env.SOURCING_CONFIRM_TELEGRAM_POLLING?.trim() === '0',
    organizationId: organizationId && UUID.test(organizationId) ? organizationId : null,
  };
}

function requireToken(): string {
  const { token } = readConfig();
  if (!token) {
    throw new ServiceUnavailableException(
      '텔레그램 보고를 쓰려면 서버에 SOURCING_CONFIRM_TELEGRAM_BOT_TOKEN 설정이 필요합니다.',
    );
  }
  return token;
}

function requireChatId(): string {
  const { chatId } = readConfig();
  if (!chatId) {
    throw new ServiceUnavailableException(
      '보고받을 채팅이 정해지지 않았습니다. 봇에게 /start 를 보내 채팅 ID를 받은 뒤 SOURCING_CONFIRM_TELEGRAM_CHAT_ID 에 넣어 주세요.',
    );
  }
  return chatId;
}

function endpoint(token: string, method: string): string {
  return `${API_ORIGIN}/bot${token}/${method}`;
}

/**
 * 누가 결정할 수 있는가. 설정된 채팅에서, 허용 목록에 든 사람만. 목록이 비었으면 1:1 채팅의
 * 주인(채팅 ID = 사람 ID)만 허용한다 — 단체방에서는 목록이 있어야 누구든 누를 수 있다.
 */
function isAuthorized(config: TelegramConfig, chatId: string | null, fromId: string | null): boolean {
  if (config.chatId === null || chatId !== config.chatId || fromId === null) return false;
  return config.allowedUserIds.size > 0 ? config.allowedUserIds.has(fromId) : fromId === config.chatId;
}

function toEvent(update: JsonRecord, key: Buffer, config: TelegramConfig): ConfirmMessengerEvent | null {
  const callback = recordValue(update.callback_query);
  if (callback) {
    const message = recordValue(callback.message);
    const chatId = idString(recordValue(message?.chat)?.id);
    const fromId = idString(recordValue(callback.from)?.id);
    if (typeof callback.id !== 'string' || !message || chatId === null || typeof message.message_id !== 'number') {
      return null;
    }
    const markup = recordValue(message.reply_markup);
    const rows = Array.isArray(markup?.inline_keyboard) ? markup.inline_keyboard : [];
    const messagePayloads = rows
      .flatMap((row) => (Array.isArray(row) ? row : []))
      .map((button) => recordValue(button)?.callback_data)
      .map((data) => (typeof data === 'string' ? verify(key, data) : null))
      .filter((payload): payload is string => payload !== null);
    return {
      kind: 'button',
      replyToken: callback.id,
      chatId,
      messageId: message.message_id,
      authorized: isAuthorized(config, chatId, fromId),
      payload: typeof callback.data === 'string' ? verify(key, callback.data) : null,
      messagePayloads,
    };
  }

  const message = recordValue(update.message);
  if (message && typeof message.text === 'string') {
    const chatId = idString(recordValue(message.chat)?.id);
    if (chatId === null) return null;
    return {
      kind: 'text',
      chatId,
      authorized: isAuthorized(config, chatId, idString(recordValue(message.from)?.id)),
      text: message.text.slice(0, 200),
    };
  }
  return null;
}

function signingKey(token: string): Buffer {
  return createHmac('sha256', token).update(SIGNING_CONTEXT).digest();
}

function sign(key: Buffer, payload: string): string {
  return `${payload}.${mac(key, payload)}`;
}

function verify(key: Buffer, data: string): string | null {
  const at = data.lastIndexOf('.');
  if (at <= 0) return null;
  const payload = data.slice(0, at);
  const given = Buffer.from(data.slice(at + 1));
  const expected = Buffer.from(mac(key, payload));
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? payload : null;
}

function mac(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url').slice(0, SIGNATURE_LENGTH);
}

function toTelegramHtml(message: ConfirmMessage): string {
  const text = message.lines.map((line) => line.map(segmentHtml).join('')).join('\n').trim();
  return text.length > 0 ? text : '·';
}

function segmentHtml(segment: ConfirmSegment): string {
  let html = escapeHtml(segment.text);
  if (segment.bold) html = `<b>${html}</b>`;
  if (segment.href && isHttpUrl(segment.href)) html = `<a href="${escapeHtml(segment.href)}">${html}</a>`;
  return html;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function telegramError(status: number, description: string): Error {
  if (/message is not modified/i.test(description)) return new TelegramNotModified();
  if (status === 401 || status === 404) {
    return new ServiceUnavailableException(
      '텔레그램 봇 토큰이 맞지 않습니다. SOURCING_CONFIRM_TELEGRAM_BOT_TOKEN 을 확인해 주세요.',
    );
  }
  if (/chat not found/i.test(description)) {
    return new BadRequestException(
      '보고받을 텔레그램 채팅을 찾지 못했습니다. 봇에게 먼저 /start 를 보내고 채팅 ID를 다시 확인해 주세요.',
    );
  }
  if (status === 403) {
    return new BadRequestException('봇이 그 채팅에 메시지를 보낼 수 없습니다. 봇을 차단했거나 대화방에서 빠졌는지 확인해 주세요.');
  }
  return new BadGatewayException(`텔레그램 요청에 실패했습니다 (HTTP ${status}).`);
}

async function readBody(response: Response): Promise<JsonRecord | null> {
  try {
    return recordValue(await response.json());
  } catch {
    return null;
  }
}

function retryAfterMs(body: JsonRecord | null): number {
  const seconds = recordValue(body?.parameters)?.retry_after;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5_000;
}

function recordValue(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function idString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return value;
  return null;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
