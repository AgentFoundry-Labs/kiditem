import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeTabPages } from '../tab-page.fake';
import { createSellpiaSite } from './index';
import { SELLPIA_MANUAL_MATCH_URL } from './manual-match';

const CANDIDATE = { productCode: '634-1', aliasTitle: '샤이니 링', matchMd5: 'a'.repeat(32), itemCount: 12 };

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/sellpia manual match', () => {
  it('새 백그라운드 탭 하나로 수동상품매칭 화면을 열고 검색·상태를 페이지 호출로 읽은 뒤 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        if (!injected) return { ok: false, error: 'content_script_missing' };
        return message.call === 'sellpia.manualMatchSearch'
          ? { ok: true, value: { status: 'ok', candidates: [CANDIDATE] } }
          : { ok: true, value: { status: 'ok', types: { [CANDIDATE.matchMd5]: 'M' } } };
      },
    });
    const site = createSellpiaSite(fake.tabs);
    await expect(site.manualMatchSearch(['634-1'])).resolves.toEqual([CANDIDATE]);
    await expect(site.manualMatchStatus([CANDIDATE.matchMd5])).resolves.toEqual({ [CANDIDATE.matchMd5]: 'M' });
    await site.closeManualMatch();
    expect(asked.at(-1)).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'sellpia.manualMatchStatus', args: { matchMd5s: [CANDIDATE.matchMd5] } });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${SELLPIA_MANUAL_MATCH_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/orders/sellpia-manual-match.js',
      'ask KIDITEM_PAGE_CALL',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('로그인이 필요하면 SITE_LOGIN_REQUIRED이고 탭을 운영자에게 남긴다', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    const site = createSellpiaSite(fake.tabs);
    expect((await failure(site.manualMatchSearch(['634-1']))).code).toBe('SITE_LOGIN_REQUIRED');
    await site.closeManualMatch();
    expect(fake.log).not.toContain('close 7');
  });

  it('화면이 바뀌면 MALL_CONTRACT_CHANGED(단계), 시간 초과는 SITE_REQUEST_FAILED이고 탭을 닫는다', async () => {
    const drift = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'contract_drift', stage: 'shop-uid' } }) });
    const site = createSellpiaSite(drift.tabs);
    expect(await failure(site.manualMatchStatus(['a'.repeat(32)]))).toMatchObject({ code: 'MALL_CONTRACT_CHANGED', details: { stage: 'shop-uid' } });
    await site.closeManualMatch();
    expect(drift.log.at(-1)).toBe('close 7');

    const slow = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'timeout' } }) });
    expect(await failure(createSellpiaSite(slow.tabs).manualMatchSearch(['634-1'])))
      .toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'timeout' } });
  });
});
