import { describe, expect, it } from 'vitest';
import { ONCH_LOGIN } from '../onch';
import { fakeLoginScreen, fastClock } from '../login.fake';
import { fakeTabPages } from '../tab-page.fake';
import { loginSpecFor, testMallLogin } from './test-login';

const SECRET = 'fake-secret-password-123';
const CREDENTIALS = { loginId: 'fake-id', password: SECRET };

function harness(options: Parameters<typeof fakeLoginScreen>[0]) {
  const login = fakeLoginScreen(options);
  const fake = fakeTabPages({ landAt: login.landAt, frames: login.frames, answer: (message) => login.answer(message) ?? {}, logBookkeeping: true });
  return { login, fake, deps: { tabs: fake.tabs, ...fastClock() } };
}

describe('몰 로그인 테스트(KID-366 testMallLogin) — 자격은 메모리에만, 응답·오류에 싣지 않는다', () => {
  it('로그인 폼에 저장 자격을 채워 누르고, 폼이 사라지면 verified — 확인용 탭은 닫는다', async () => {
    const { login, fake, deps } = harness({ loginAt: 'https://www.onch3.co.kr/login/login_web.php' });
    const result = await testMallLogin(deps, 'onch', CREDENTIALS);
    expect(result).toEqual({ submitted: true, verified: true, mallMessage: null, errorCode: null });
    expect(login.state.filled).toEqual([{ loginId: 'fake-id', password: SECRET }]);
    expect(fake.log[0]).toBe(`guard dialogs ${ONCH_LOGIN.hosts.join(',')}`);
    expect(fake.log).toContain('close 7');
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('몰이 거절하면 몰의 말과 MALL_LOGIN_REJECTED를 돌려주고 탭을 닫는다(비밀번호는 싣지 않는다)', async () => {
    const { fake, deps } = harness({ loginAt: 'https://www.onch3.co.kr/login/login_web.php', accept: false, dialog: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    const result = await testMallLogin(deps, 'onch', CREDENTIALS);
    expect(result).toEqual({ submitted: true, verified: false, mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.', errorCode: 'MALL_LOGIN_REJECTED' });
    expect(fake.log).toContain('close 7');
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(fake.log.join('\n')).not.toContain(SECRET);
  });

  it('이미 로그인돼 폼이 없으면 누르지 않았다고 답한다(비밀번호를 확인하지 못함)', async () => {
    const { deps } = harness({ loginAt: 'https://www.onch3.co.kr/login/login_web.php', signedIn: true });
    await expect(testMallLogin(deps, 'onch', CREDENTIALS)).resolves.toEqual({ submitted: false, verified: true, mallMessage: null, errorCode: null });
  });

  it('로그인했는지 확인하지 못하면 MALL_LOGIN_UNCONFIRMED로 알리고 탭을 운영자에게 앞으로 가져온다', async () => {
    const fake = fakeTabPages({ answer: () => ({}), frames: () => { throw new Error('Cannot access contents'); }, logBookkeeping: true });
    const result = await testMallLogin({ tabs: fake.tabs, ...fastClock() }, 'onch', CREDENTIALS);
    expect(result).toEqual({ submitted: false, verified: false, mallMessage: null, errorCode: 'MALL_LOGIN_UNCONFIRMED' });
    expect(fake.log).toContain('focus 7');
    expect(fake.log).not.toContain('close 7');
  });

  it('본인확인 화면이면 SITE_VERIFICATION_REQUIRED로 알리고 탭을 앞으로 가져온다', async () => {
    const fake = fakeTabPages({ landAt: () => 'https://partner.kidkids.net/security/verify_user.htm', answer: () => ({}), frames: () => [], logBookkeeping: true });
    await expect(testMallLogin({ tabs: fake.tabs, ...fastClock() }, 'kidkids', CREDENTIALS)).resolves.toEqual({
      submitted: false, verified: false, mallMessage: null, errorCode: 'SITE_VERIFICATION_REQUIRED',
    });
    expect(fake.log).toContain('focus 7');
  });

  it('탭을 열지 못하면 MALL_LOGIN_PAGE_UNREACHABLE', async () => {
    const fake = fakeTabPages({ answer: () => ({}) });
    fake.tabs.open = async () => { throw new Error('no window'); };
    await expect(testMallLogin({ tabs: fake.tabs, ...fastClock() }, 'onch', CREDENTIALS)).resolves.toMatchObject({ errorCode: 'MALL_LOGIN_PAGE_UNREACHABLE' });
  });

  it('고정 입구가 없는 몰은 저장된 사이트 주소로 들어가고, 폼 없는 몰·주소 없는 몰은 MALL_LOGIN_UNSUPPORTED(탭을 열지 않는다)', async () => {
    expect(loginSpecFor('onch')).toBe(ONCH_LOGIN);
    const generic = loginSpecFor('thirtymall', 'https://partner.shopby.co.kr/');
    expect(generic).toMatchObject({ loginUrl: 'https://partner.shopby.co.kr/', hosts: ['partner.shopby.co.kr'], fields: ['loginId', 'password'] });
    expect(generic?.isLoginUrl(new URL('https://partner.shopby.co.kr/login'))).toBe(true);
    const { deps, fake } = harness({ loginAt: 'https://x.test/login' });
    for (const mallKey of ['kakao', 'always', 'thirtymall']) {
      await expect(testMallLogin(deps, mallKey, CREDENTIALS)).resolves.toEqual({ submitted: false, verified: false, mallMessage: null, errorCode: 'MALL_LOGIN_UNSUPPORTED' });
    }
    expect(fake.log).toEqual([]);
  });
});
