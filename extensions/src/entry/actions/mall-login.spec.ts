import { CheckMallLoginResponseSchema, TestMallLoginResponseSchema } from '@kiditem/shared/extension-actions';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createExternalDispatch } from '../../core/dispatch';
import { createKeepAlive } from '../../core/keep-alive';
import { fakeLoginScreen, fastClock } from '../../sites/login.fake';
import { fakeTabPages } from '../../sites/tab-page.fake';
import { checkMallLoginAction } from './check-mall-login';
import { testMallLoginAction } from './test-mall-login';

const SECRET = 'fake-secret-password-456';

function send(dispatch: ReturnType<typeof createExternalDispatch>, message: unknown) {
  return new Promise<Record<string, unknown>>((resolve) => {
    dispatch.handleMessage(message, { url: 'http://localhost:3000/mall-settings' }, (value) => resolve(value as Record<string, unknown>));
  });
}

describe('몰 로그인 entry 액션', () => {
  const keepAlive = createKeepAlive({ ping: () => undefined, setInterval: () => 1, clearInterval: () => undefined });

  it('testMallLogin: dispatch를 거쳐도 자격은 응답·오류 어디에도 나오지 않는다', async () => {
    const login = fakeLoginScreen({ loginAt: 'https://www.onch3.co.kr/login/login_web.php', accept: false, dialog: '비밀번호가 틀렸습니다.' });
    const fake = fakeTabPages({ landAt: login.landAt, frames: login.frames, answer: (message) => login.answer(message) ?? {} });
    const dispatch = createExternalDispatch({ actions: { testMallLogin: testMallLoginAction({ tabs: fake.tabs, ...fastClock() }) }, capabilities: {}, version: () => '1', keepAlive });

    const ok = await send(dispatch, { action: 'testMallLogin', mallKey: 'onch', credentials: { loginId: 'fake-id', password: SECRET } });
    expect(TestMallLoginResponseSchema.parse(ok)).toEqual({ success: true, submitted: true, verified: false, mallMessage: '비밀번호가 틀렸습니다.', errorCode: 'MALL_LOGIN_REJECTED' });
    const invalid = await send(dispatch, { action: 'testMallLogin', mallKey: 'onch', credentials: { loginId: 'fake-id', password: SECRET, extra: SECRET } });
    const failed = await send(dispatch, { action: 'testMallLogin', mallKey: 'kakao', credentials: { loginId: 'fake-id', password: SECRET } });
    expect(invalid).toMatchObject({ success: false, errorCode: 'VALIDATION_FAILED' });
    expect(failed).toEqual({ success: true, submitted: false, verified: false, mallMessage: null, errorCode: 'MALL_LOGIN_UNSUPPORTED' });
    for (const response of [ok, invalid, failed]) expect(JSON.stringify(response)).not.toContain(SECRET);
  });

  it('checkMallLogin: 몰 키를 되돌려 주고 shared 응답 모양으로 답한다(자격 칸은 받지 않는다)', async () => {
    const fake = fakeTabPages({ answer: () => ({}) });
    const action = checkMallLoginAction({
      fetch: async () => Object.defineProperty(new Response('{"dat":[]}'), 'url', { value: 'https://domeggook.com/sc/excel/getOrderList' }),
      tabs: fake.tabs,
      hasPermission: async () => true,
      ...fastClock(),
    });
    expect(action.schema.safeParse({ action: 'checkMallLogin', mallKey: 'domeggook', credentials: {} }).success).toBe(false);
    const parsed = action.schema.safeParse({ action: 'checkMallLogin', mallKey: 'domeggook' });
    const response = await action.handle(parsed.success ? parsed.data : (undefined as never), { environmentId: 'local', sender: {} });
    expect(CheckMallLoginResponseSchema.parse(response)).toEqual({ success: true, mallKey: 'domeggook', state: 'signed_in', reason: 'admin_api' });
    expect(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).safeParse((response as { reason: string }).reason).success).toBe(true);
  });
});
