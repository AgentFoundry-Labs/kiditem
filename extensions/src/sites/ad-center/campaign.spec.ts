import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { fastClock } from '../login.fake';
import { siteFactoryFor, type SiteDeps } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { createTabPages, type TabPageChrome } from '../tab-page';
import { ADVERTISING_AD_CENTER_FORM_CHANGED, AD_CENTER_CAMPAIGN_FILE, AD_CENTER_CAMPAIGN_TYPE_URL, submitCampaign } from './campaign';
import { AD_CENTER_HOME_URL, AD_CENTER_VENDOR_FILE, type AdCenterSite } from './index';

// 광고센터 캠페인 등록 쓰기(KID-386). 페이지 처리기는 `ad-center-campaign-page-script.spec.ts`가 fixture로 보고, 여기는 사이트가
// 탭을 열고 처리기를 부르는 순서와 "누르기 전 실패는 던지고, 누른 뒤는 증거로 돌려준다"는 규칙을 본다.

const INPUT = { name: '봄 신상 캠페인', productIds: ['70011'], dailyBudget: 50000, targetRoas: 350 };
const PRESSED_RESULT = { url: 'https://advertising.coupang.com/marketing/campaign/88123/detail', campaignId: '88123', message: '등록되었습니다', stayed: false, validation: null };

function writer(answers: Record<string, unknown | (() => unknown)>, options: { landAt?: (url: string) => string } = {}) {
  const calls: string[] = [];
  const tabs = fakeTabPages({
    ...(options.landAt ? { landAt: options.landAt } : {}),
    answer: (message, injected) => {
      if (!injected) return { ok: false, error: 'content_script_missing' };
      const call = String(message.call);
      calls.push(call);
      const answer = answers[call];
      if (answer === undefined) return { ok: false, error: 'unexpected' };
      return typeof answer === 'function' ? (answer as () => unknown)() : { ok: true, value: answer };
    },
    frames: (files) => (files.includes(AD_CENTER_VENDOR_FILE) ? [{ frameId: 0, result: { vendorId: 'A00012345' } }] : []),
  });
  const deps: SiteDeps = { tabs: tabs.tabs, randomId: () => 'id', ...fastClock(), cookies: { get: async () => null }, fetch: async () => Response.json({}) };
  // 광고 액션 실행은 광고센터 계정 잠금을 쥐지 않는다 — 브라우저 자원이 준 탭이 없다.
  const site = siteFactoryFor('ad-center')!.create(deps, { tabId: null }) as AdCenterSite;
  return { site, calls, log: tabs.log };
}

async function rejection(promise: Promise<unknown>): Promise<RuntimeError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(RuntimeError);
  return error as RuntimeError;
}

describe('sites/ad-center createCampaign — 캠페인 등록 쓰기(KID-386)', () => {
  it('제 탭을 광고 목표 화면으로 열어 채우기 → 완료·확인 → 결과 읽기 순서로 부르고, 캠페인 번호를 증거로 돌려준다', async () => {
    const { site, calls, log } = writer({
      'adCenter.campaignFill': { state: 'filled', selected: ['70011'] },
      'adCenter.campaignSubmit': { state: 'pressed', confirmed: true },
      'adCenter.campaignResult': PRESSED_RESULT,
    });

    const submission = await site.createCampaign(INPUT);

    expect(calls).toEqual(['adCenter.campaignFill', 'adCenter.campaignSubmit', 'adCenter.campaignResult']);
    expect(log[0]).toBe(`open ${AD_CENTER_HOME_URL}`);
    expect(log).toContain(`navigate ${AD_CENTER_CAMPAIGN_TYPE_URL} (continue on timeout)`);
    expect(log).toContain(`inject content/page-call/bridge.js,${AD_CENTER_CAMPAIGN_FILE}`);
    expect(submission).toEqual({ campaignId: '88123', message: '등록되었습니다', url: PRESSED_RESULT.url });
  });

  it('등록 폼이 바뀌어 칸을 못 찾으면 누르지 않고 폼 변경 오류(그 칸 이름)로 던진다', async () => {
    const { site, calls, log } = writer({ 'adCenter.campaignFill': { state: 'form_changed', missing: '광고 그룹 이름 입력칸' } });

    const error = await rejection(site.createCampaign(INPUT));

    expect(error.code).toBe(ADVERTISING_AD_CENTER_FORM_CHANGED);
    expect(error.details).toMatchObject({ missing: '광고 그룹 이름 입력칸' });
    expect(calls).toEqual(['adCenter.campaignFill']);
    expect(log).not.toContain('leave 7');
  });

  it('광고센터에서 상품을 못 찾으면 누르지 않고 그 상품 번호로 던진다', async () => {
    const { site, calls } = writer({ 'adCenter.campaignFill': { state: 'product_not_found', productIds: ['70011'], selected: [] } });

    const error = await rejection(site.createCampaign(INPUT));

    expect(error.code).toBe(SITE_REQUEST_FAILED);
    expect(error.details).toMatchObject({ reason: 'product_not_found', productIds: ['70011'] });
    expect(error.message).toContain('70011');
    expect(calls).toEqual(['adCenter.campaignFill']);
  });

  it('[완료] 버튼이 없다고 답하면(누르지 않음) 폼 변경 오류로 던진다', async () => {
    const { site } = writer({
      'adCenter.campaignFill': { state: 'filled', selected: ['70011'] },
      'adCenter.campaignSubmit': { state: 'form_changed', missing: '완료 버튼' },
    });

    const error = await rejection(site.createCampaign(INPUT));

    expect(error.code).toBe(ADVERTISING_AD_CENTER_FORM_CHANGED);
  });

  it('누르는 호출의 답을 못 받으면(화면 이동으로 끊김) 눌렀을 수 있으므로 던지지 않고 번호 없는 증거를 돌려준다', async () => {
    const { site, calls } = writer({
      'adCenter.campaignFill': { state: 'filled', selected: ['70011'] },
      'adCenter.campaignSubmit': () => ({ ok: false, error: 'timeout' }),
      'adCenter.campaignResult': { ...PRESSED_RESULT, campaignId: null, message: null },
    });

    const submission = await site.createCampaign(INPUT);

    expect(calls).toEqual(['adCenter.campaignFill', 'adCenter.campaignSubmit', 'adCenter.campaignResult']);
    expect(submission.campaignId).toBeNull();
  });

  it('누른 뒤 등록 화면에 검증 문구가 남으면 번호 없이 그 문구를 증거로 돌려준다', async () => {
    const { site } = writer({
      'adCenter.campaignFill': { state: 'filled', selected: ['70011'] },
      'adCenter.campaignSubmit': { state: 'pressed', confirmed: false },
      'adCenter.campaignResult': { url: 'https://advertising.coupang.com/marketing/campaign/registration', campaignId: null, message: null, stayed: true, validation: '등록 화면에 검증 문구가 남아 있습니다.' },
    });

    const submission = await site.createCampaign(INPUT);

    expect(submission).toMatchObject({ campaignId: null, message: '등록 화면에 검증 문구가 남아 있습니다.' });
  });

  it('등록 화면으로 가다 로그인 화면에 닿으면 채우지 않고 로그인 필요로 멈춘다', async () => {
    const { site, calls } = writer({}, { landAt: (url) => (url.includes('/campaign/type') ? 'https://xauth.coupang.com/auth/realms/seller' : url) });

    const error = await rejection(site.createCampaign(INPUT));

    expect(error.code).toBe(SITE_LOGIN_REQUIRED);
    expect(calls).toEqual([]);
  });

  it('계정 잠금 탭이 없으면 업체코드도 같은 제 탭(광고센터 첫 화면)에서 읽는다', async () => {
    const { site, log } = writer({});

    await expect(site.readVendorId()).resolves.toBe('A00012345');

    expect(log[0]).toBe(`open ${AD_CENTER_HOME_URL}`);
  });

  it('[완료] 누르기 호출은 한 번만 보낸다 — 화면 이동으로 메시지 포트가 닫혀도 파일을 다시 넣어 재전송하지 않고 눌렀다고 본다(실제 탭 묶음)', async () => {
    const sent: string[] = [];
    const injected: string[] = [];
    const chromeApi: TabPageChrome = {
      tabs: {
        create: async () => ({ id: 4 }),
        update: async () => undefined,
        get: async () => ({ status: 'complete', url: 'https://advertising.coupang.com/marketing/campaign/registration' }),
        query: async () => [],
        remove: async () => undefined,
        async sendMessage(_tabId, message) {
          const call = String((message as { call?: unknown }).call ?? (message as { action?: unknown }).action);
          sent.push(call);
          if (call === 'adCenter.campaignFill') return { ok: true, value: { state: 'filled', selected: ['70011'] } };
          // 누른 뒤 화면이 옮겨 가 답이 오지 않는다.
          if (call === 'adCenter.campaignSubmit') throw new Error('The message port closed before a response was received.');
          if (call === 'adCenter.campaignResult') return { ok: true, value: PRESSED_RESULT };
          return undefined;
        },
      },
      scripting: { executeScript: async (injection) => { injected.push(injection.files.join(',')); return []; } },
      runtime: { onMessage: { addListener: () => undefined, removeListener: () => undefined } },
    };
    const page = createTabPages({ chrome: chromeApi, fetch: async () => new Response('x'), sleep: async () => undefined, now: () => 0 }).attach(4);

    const submission = await submitCampaign(page, INPUT);

    expect(sent.filter((call) => call === 'adCenter.campaignSubmit')).toHaveLength(1);
    expect(injected).toEqual([]);
    expect(submission.campaignId).toBe('88123');
  });

  describe('release — 제 탭을 모든 종료 경로에서 넘기거나 닫는다', () => {
    it('등록 폼을 채우기 시작했으면(눌렀든 아니든) 운영자에게 남긴다', async () => {
      const { site, log } = writer({ 'adCenter.campaignFill': { state: 'form_changed', missing: '완료 버튼' } });
      const error = await rejection(site.createCampaign(INPUT));

      await site.release({ error });

      expect(log.filter((line) => /^(leave|close|focus) /.test(line))).toEqual(['leave 7']);
    });

    it('쓰지 않고 끝났으면(같은 이름 캠페인·업체 불일치·목록 실패) 닫는다', async () => {
      const { site, log } = writer({});
      await site.readVendorId();

      await site.release({ error: new RuntimeError('ADVERTISING_IDENTITY_MISMATCH', '업체 다름', null) });

      expect(log.filter((line) => /^(leave|close|focus) /.test(line))).toEqual(['close 7']);
    });

    it('로그인이 필요해 멈췄으면 그 탭을 앞으로 가져와 운영자에게 넘긴다', async () => {
      const { site, log } = writer({}, { landAt: (url) => (url.includes('/campaign/type') ? 'https://xauth.coupang.com/auth/realms/seller' : url) });
      const error = await rejection(site.createCampaign(INPUT));

      await site.release({ error });

      expect(log.filter((line) => /^(leave|close|focus) /.test(line))).toEqual(['focus 7']);
    });

    it('탭을 열지 않았으면 할 일이 없다', async () => {
      const { site, log } = writer({});
      await site.release({});

      expect(log).toEqual([]);
    });

    it('두 번 불러도 한 번만 처리한다', async () => {
      const { site, log } = writer({});
      await site.readVendorId();
      await site.release({});
      await site.release({});

      expect(log.filter((line) => /^(leave|close|focus) /.test(line))).toEqual(['close 7']);
    });
  });
});
