import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createExternalDispatch, createInternalDispatch, type LegacyExternalActions } from './dispatch';
import { RuntimeError } from './errors';
import { createKeepAlive } from './keep-alive';

const LOCAL = { url: 'http://localhost:3000/orders' };
const OFFICE = { url: 'http://kiditem-office/mall-settings' };

function keepAlive() {
  return createKeepAlive({ ping: () => undefined, setInterval: () => 1, clearInterval: () => undefined });
}

function call(dispatch: { handleMessage(message: unknown, sender: unknown, respond: (value: unknown) => void): boolean }, message: unknown, sender: unknown) {
  return new Promise<{ async: boolean; response: unknown }>((resolve) => {
    let asyncReply = false;
    let answered = false;
    asyncReply = dispatch.handleMessage(message, sender, (response) => {
      answered = true;
      resolve({ async: asyncReply, response });
    });
    if (!asyncReply && !answered) resolve({ async: false, response: undefined });
  });
}

const echo = {
  schema: z.object({ action: z.literal('echo'), value: z.string().min(1) }).strict(),
  async handle(input: { value: string }, context: { environmentId: string }) {
    return { success: true, value: input.value, environmentId: context.environmentId };
  },
};

describe('외부 메시지 dispatch(웹앱 → 확장, 유일한 onMessageExternal 리스너)', () => {
  it('보내는 창 origin으로 환경을 정해 shared 스키마로 검증한 액션을 부르고 성공 봉투를 돌려준다', async () => {
    const dispatch = createExternalDispatch({ actions: { echo }, capabilities: {}, version: () => '1.0.0', keepAlive: keepAlive() });
    // 메시지가 말하는 환경은 믿지 않는다 — 스키마가 모르는 칸으로 거절한다.
    expect((await call(dispatch, { action: 'echo', value: 'hi', environmentId: 'office' }, LOCAL)).response).toEqual({
      success: false, errorCode: 'VALIDATION_FAILED', error: expect.any(String), details: { fields: [''] },
    });
    expect((await call(dispatch, { action: 'echo', value: 'hi' }, OFFICE)).response).toEqual({ success: true, value: 'hi', environmentId: 'office' });
  });

  it('표에 없는 origin은 액션을 부르지 않고 거절한다', async () => {
    let called = false;
    const dispatch = createExternalDispatch({
      actions: { echo: { ...echo, handle: async () => { called = true; return { success: true }; } } },
      capabilities: {},
      version: () => '1',
      keepAlive: keepAlive(),
    });
    const { response } = await call(dispatch, { action: 'echo', value: 'x' }, { url: 'https://evil.test/' });
    expect(response).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    expect(called).toBe(false);
  });

  it('검증 실패는 VALIDATION_FAILED이고 details에는 칸 이름만 싣는다(값은 싣지 않는다)', async () => {
    const dispatch = createExternalDispatch({ actions: { echo }, capabilities: {}, version: () => '1', keepAlive: keepAlive() });
    const { response } = await call(dispatch, { action: 'echo', value: '' }, LOCAL);
    expect(response).toEqual({ success: false, errorCode: 'VALIDATION_FAILED', error: expect.any(String), details: { fields: ['value'] } });
  });

  it('액션이 던진 RuntimeError는 그 코드로, 모르는 오류는 EXTENSION_UNKNOWN_FAILURE로 바꾼다', async () => {
    const dispatch = createExternalDispatch({
      actions: {
        known: { schema: z.object({ action: z.literal('known') }), handle: async () => { throw new RuntimeError('SITE_LOGIN_REQUIRED', '로그인이 필요합니다.', { reason: 'login_page' }); } },
        boom: { schema: z.object({ action: z.literal('boom') }), handle: async () => { throw new Error('터졌다'); } },
      },
      capabilities: {},
      version: () => '1',
      keepAlive: keepAlive(),
    });
    expect((await call(dispatch, { action: 'known' }, LOCAL)).response).toEqual({
      success: false, errorCode: 'SITE_LOGIN_REQUIRED', error: '로그인이 필요합니다.', details: { reason: 'login_page' },
    });
    expect((await call(dispatch, { action: 'boom' }, LOCAL)).response).toEqual({ success: false, errorCode: 'EXTENSION_UNKNOWN_FAILURE', error: '터졌다' });
  });

  it('응답할 때까지 서비스워커를 붙든다', async () => {
    const alive = keepAlive();
    let finish!: () => void;
    const dispatch = createExternalDispatch({
      actions: { slow: { schema: z.object({ action: z.literal('slow') }), handle: () => new Promise((resolve) => { finish = () => resolve({ success: true }); }) } },
      capabilities: {},
      version: () => '1',
      keepAlive: alive,
    });
    const pending = call(dispatch, { action: 'slow' }, LOCAL);
    await Promise.resolve();
    expect(alive.holders).toBe(1);
    finish();
    await pending;
    expect(alive.holders).toBe(0);
  });

  it('ping은 새 런타임 capability에 과도기 옛 표의 capability를 합쳐 한 번 답한다(새 런타임이 이긴다)', async () => {
    const dispatch = createExternalDispatch({ actions: {}, capabilities: { operationRuntime: true, shared: true }, version: () => '1.2.3', keepAlive: keepAlive() });
    expect((await call(dispatch, { action: 'ping' }, LOCAL)).response).toEqual({ success: true, version: '1.2.3', capabilities: { operationRuntime: true, shared: true } });
    dispatch.attachLegacy({ forExternalAction: () => null, capabilities: () => ({ browserCollectionSessions: true, shared: false }) });
    expect((await call(dispatch, { action: 'ping' }, OFFICE)).response).toEqual({
      success: true,
      version: '1.2.3',
      capabilities: { browserCollectionSessions: true, operationRuntime: true, shared: true },
    });
  });

  it('새 표가 모르는 액션은 과도기에 옛 표로 넘기고(환경 id 함께), 옛 표도 모르면 답하지 않는다', async () => {
    const seen: Array<{ input: unknown; environmentId: string }> = [];
    const legacy: LegacyExternalActions = {
      capabilities: () => ({}),
      forExternalAction: (action) => action === 'listCollectionSessions'
        ? { validate: (message) => ({ ...(message as object) }), handle: async (input, environmentId) => { seen.push({ input, environmentId }); return [{ attemptId: 'a' }]; } }
        : action === 'broken'
          ? { validate: () => { throw new Error('bad'); }, handle: async () => ({}) }
          : null,
    };
    const dispatch = createExternalDispatch({ actions: { echo }, capabilities: {}, version: () => '1', keepAlive: keepAlive() });
    expect(await call(dispatch, { action: 'listCollectionSessions' }, LOCAL)).toEqual({ async: false, response: undefined });
    dispatch.attachLegacy(legacy);
    expect((await call(dispatch, { action: 'listCollectionSessions' }, OFFICE)).response).toEqual([{ attemptId: 'a' }]);
    expect(seen).toEqual([{ input: { action: 'listCollectionSessions' }, environmentId: 'office' }]);
    expect((await call(dispatch, { action: 'broken' }, LOCAL)).response).toMatchObject({ success: false, errorCode: 'VALIDATION_FAILED', error: 'bad' });
    expect(await call(dispatch, { action: 'nobody' }, LOCAL)).toEqual({ async: false, response: undefined });
    expect(await call(dispatch, 'not an object', LOCAL)).toEqual({ async: false, response: undefined });
  });

  it('옛 표 핸들러가 code를 실어 던지면 그 코드를 봉투에 싣는다', async () => {
    const dispatch = createExternalDispatch({ actions: {}, capabilities: {}, version: () => '1', keepAlive: keepAlive() });
    dispatch.attachLegacy({
      capabilities: () => ({}),
      forExternalAction: () => ({ validate: (m) => m, handle: async () => { throw Object.assign(new Error('없음'), { code: 'ORDER_COLLECTION_ATTEMPT_MISSING' }); } }),
    });
    expect((await call(dispatch, { action: 'cancelCollectionSession' }, LOCAL)).response).toEqual({
      success: false, errorCode: 'ORDER_COLLECTION_ATTEMPT_MISSING', error: '없음',
    });
  });
});

describe('내부 메시지 dispatch(팝업·콘텐츠 스크립트 → 확장)', () => {
  const storage = { get: async () => ({ kiditem_coupang_environment_tab_bindings_v1: { 7: 'office' } }) };
  const internal = () => createInternalDispatch({
    runtimeId: 'ext-id',
    storage,
    keepAlive: keepAlive(),
    actions: { echo: { ...echo, schema: z.object({ action: z.literal('echo'), value: z.string(), environmentId: z.string().optional() }).strict() } },
  });

  it('이 확장에서 온 메시지만 받고, 환경은 메시지의 환경 id나 팝업이 묶어 둔 탭으로 정한다', async () => {
    const dispatch = internal();
    expect((await call(dispatch, { action: 'echo', value: 'a', environmentId: 'local' }, { id: 'ext-id' })).response).toMatchObject({ environmentId: 'local' });
    expect((await call(dispatch, { action: 'echo', value: 'b' }, { id: 'ext-id', tab: { id: 7 } })).response).toMatchObject({ environmentId: 'office' });
    expect((await call(dispatch, { action: 'echo', value: 'c' }, { id: 'ext-id', tab: { id: 8 } })).response).toMatchObject({ success: false, errorCode: 'VALIDATION_FAILED' });
  });

  it('다른 확장·모르는 액션에는 답하지 않는다(다른 리스너 몫)', async () => {
    const dispatch = internal();
    expect(await call(dispatch, { action: 'echo', value: 'a', environmentId: 'local' }, { id: 'other' })).toEqual({ async: false, response: undefined });
    expect(await call(dispatch, { action: 'getConnectedKidItemEnvironments' }, { id: 'ext-id' })).toEqual({ async: false, response: undefined });
  });
});
