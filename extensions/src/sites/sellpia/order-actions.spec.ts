import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeTabPages } from '../tab-page.fake';
import { createSellpiaSite } from './index';
import { SELLPIA_INVOICE_URL, SELLPIA_ORDER_ACTIONS_FILE, SELLPIA_ORDER_UPLOAD_URL, SELLPIA_STOCKMATCH_URL } from './order-page';

// 셀피아 쓰기 페이지(KID-366 wave8b)를 가짜 탭으로 돌린다. 처리기 답은 페이지 스크립트 스펙이 잠근 모양 그대로다.
type Reply = (args: Record<string, unknown>) => unknown;

function sellpia(replies: { inject?: Reply; steps?: Record<string, Reply | Reply[]> }, options: { existingTab?: (pattern: string) => number | null; currentUrl?: string; landAt?: (url: string) => string } = {}) {
  const asked: Array<{ call: string; args: Record<string, unknown> }> = [];
  const counts: Record<string, number> = {};
  const fake = fakeTabPages({
    ...options,
    answer: (message, injected) => {
      if (!injected) return { ok: false, error: 'content_script_missing' };
      const call = String(message.call);
      const args = message.args as Record<string, unknown>;
      asked.push({ call, args });
      const key = call === 'sellpia.orderStep' ? String(args.step) : call;
      const reply = call === 'sellpia.injectOrderFile' ? replies.inject : replies.steps?.[key];
      const index = counts[key] ?? 0;
      counts[key] = index + 1;
      const pick = Array.isArray(reply) ? reply[Math.min(index, reply.length - 1)] : reply;
      const value = pick?.(args);
      return value && typeof value === 'object' && 'ok' in value ? value : { ok: true, value };
    },
  });
  return { site: createSellpiaSite(fake.tabs), log: fake.log, asked };
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

const FILE = { shopName: '키드키즈', fileName: 'orders.xlsx', fileBase64: 'b3JkZXJz', targetOrderNumbers: ['A-1', 'A-2'] };
const INJECT_FILES = `inject content/page-call/bridge.js,content/page-call/runner.js,${SELLPIA_ORDER_ACTIONS_FILE}`;

describe('sites/sellpia 주문 파일 전송(운영자 탭)', () => {
  it('주문서수집 화면의 운영자 탭을 재사용해 앞으로 가져오고 파일을 넣어 submitted면 받아들여진 번호를 돌려준 뒤 탭을 운영자에게 둔다', async () => {
    const { site, log, asked } = sellpia(
      { inject: () => ({ success: true, outcome: 'submitted', pendingRowsBefore: 3, pendingRows: 5, acceptedRows: 2, acceptedTargetOrderNumbers: ['A-1', 'A-2'] }) },
      { existingTab: (pattern) => (pattern.includes('order_collect') ? 41 : null), currentUrl: SELLPIA_ORDER_UPLOAD_URL },
    );
    await expect(site.transferOrderFile(FILE)).resolves.toEqual({
      outcome: 'submitted',
      acceptedOrderNumbers: ['A-1', 'A-2'],
      baselineRows: 3,
      afterRows: 5,
      mallMessage: null,
      verification: null,
    });
    expect(asked).toEqual([{ call: 'sellpia.injectOrderFile', args: FILE }]);
    expect(log).toEqual(['find https://*.sellpia.com/order_collect.html*', 'focus 41', 'ask KIDITEM_PAGE_CALL', INJECT_FILES, 'ask KIDITEM_PAGE_CALL', 'leave 41']);
  });

  it('셀피아 탭이 없으면 새로 열어 주문서수집 화면으로 옮기고 앞으로 가져온다', async () => {
    const { site, log } = sellpia({ inject: () => ({ success: true, outcome: 'submitted', pendingRowsBefore: 0, pendingRows: 1, acceptedTargetOrderNumbers: [] }) });
    await site.transferOrderFile(FILE);
    expect(log.slice(0, 5)).toEqual([
      'find https://*.sellpia.com/order_collect.html*',
      'find https://*.sellpia.com/*',
      'open about:blank',
      `navigate ${SELLPIA_ORDER_UPLOAD_URL}`,
      'focus 7',
    ]);
    expect(log.at(-1)).toBe('leave 7');
  });

  it('접수 결과를 모르면(unknown) 같은 탭에서 대기목록 → 재고매칭 화면 순으로 대상 번호를 다시 확인하고, 찾은 화면에서 멈춘다', async () => {
    const { site, log, asked } = sellpia({
      inject: () => ({ success: false, outcome: 'unknown', pendingRowsBefore: 4, error: '주문접수 버튼은 실행됐지만 셀피아 접수 결과를 확인하지 못했습니다.' }),
      steps: {
        verify: [
          () => ({ success: true, foundCount: 0, found: [], missing: ['A-1', 'A-2'] }),
          () => ({ success: true, foundCount: 1, found: [{ orderNo: 'A-1' }], missing: ['A-2'] }),
        ],
      },
    });
    await expect(site.transferOrderFile(FILE)).resolves.toEqual({
      outcome: 'unknown',
      acceptedOrderNumbers: [],
      baselineRows: 4,
      afterRows: null,
      mallMessage: '주문접수 버튼은 실행됐지만 셀피아 접수 결과를 확인하지 못했습니다.',
      verification: { found: ['A-1'], missing: ['A-2'], screensRead: 2 },
    });
    expect(asked.filter((entry) => entry.call === 'sellpia.orderStep').map((entry) => entry.args)).toEqual([
      { step: 'verify', targetOrderNumbers: ['A-1', 'A-2'] },
      { step: 'verify', targetOrderNumbers: ['A-1', 'A-2'] },
    ]);
    expect(log).toContain(`navigate ${SELLPIA_STOCKMATCH_URL}`);
  });

  it('주입 호출의 답이 끊기면(시간 초과) 누른 뒤일 수 있어 unknown으로 두고 확인한다 — 확인도 못 읽으면 읽은 화면 0', async () => {
    const { site } = sellpia({ inject: () => ({ ok: false, error: 'timeout' }), steps: { verify: () => ({ ok: false, error: 'timeout' }) } });
    await expect(site.transferOrderFile(FILE)).resolves.toMatchObject({
      outcome: 'unknown',
      verification: { found: [], missing: ['A-1', 'A-2'], screensRead: 0 },
    });
  });

  it('누르기 전에 화면을 못 읽으면 SELLPIA_SCREEN_UNREADABLE, 판매처 불일치 같은 나머지는 not_submitted로 돌려준다', async () => {
    const unreadable = sellpia({ inject: () => ({ success: false, outcome: 'not_submitted', unreadable: true, error: '화면 요소를 찾지 못했습니다.' }) });
    expect(await failure(unreadable.site.transferOrderFile(FILE))).toMatchObject({ code: 'SELLPIA_SCREEN_UNREADABLE', message: '화면 요소를 찾지 못했습니다.' });
    expect(unreadable.log.at(-1)).toBe('leave 7');

    const refused = sellpia({ inject: () => ({ success: false, outcome: 'not_submitted', error: "판매처 '키드키즈'를 찾지 못했습니다." }) });
    await expect(refused.site.transferOrderFile(FILE)).resolves.toMatchObject({ outcome: 'not_submitted', mallMessage: "판매처 '키드키즈'를 찾지 못했습니다.", verification: null });
  });

  it('로그인 화면이면 SITE_LOGIN_REQUIRED이고 탭을 운영자에게 남긴다', async () => {
    const redirected = sellpia({ inject: () => ({ success: true }) }, { landAt: () => 'https://kiditem.sellpia.com/login.html' });
    expect((await failure(redirected.site.transferOrderFile(FILE))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(redirected.log.at(-1)).toBe('leave 7');

    const expired = sellpia({ inject: () => ({ success: false, loginRequired: true, outcome: 'not_submitted' }) });
    expect((await failure(expired.site.transferOrderFile(FILE))).code).toBe('SITE_LOGIN_REQUIRED');
  });
});

describe('sites/sellpia 후처리(운영자 탭)', () => {
  it('주문서수집 화면에서 [등록] 뒤 재고매칭 화면으로 옮겨 자동합포·자동재고매칭을 하고 미매칭 주문번호를 돌려준다', async () => {
    const { site, log } = sellpia({
      steps: {
        register: () => ({ success: true, registered: 2, message: '2건이 등록되었습니다' }),
        stockmatch: () => ({
          success: true,
          listCount: 3,
          matched: 1,
          unmatched: [{ groupNo: 'G-2' }, { groupNo: 'G-2' }, { groupNo: '' }, { groupNo: 'G-3' }],
          message: '조회 3건 · 재고매칭 1건 · 미매칭 2건',
        }),
      },
    });
    const session = await site.openPostTransfer();
    await expect(session.register()).resolves.toEqual({ registered: 2, message: '2건이 등록되었습니다' });
    await expect(session.stockmatch()).resolves.toEqual({ matched: 1, unmatchedOrderNumbers: ['G-2', 'G-3'], message: '조회 3건 · 재고매칭 1건 · 미매칭 2건' });
    await session.done();
    expect(log.filter((line) => line.startsWith('navigate') || line.startsWith('focus') || line.startsWith('leave'))).toEqual([
      `navigate ${SELLPIA_ORDER_UPLOAD_URL}`,
      'focus 7',
      `navigate ${SELLPIA_STOCKMATCH_URL}`,
      'leave 7',
    ]);
  });

  it('단계 실패는 화면 미판독(SELLPIA_SCREEN_UNREADABLE)과 셀피아가 거절한 것(SITE_REQUEST_FAILED, 셀피아 문장)을 나눈다', async () => {
    const unreadable = sellpia({ steps: { register: () => ({ success: false, unreadable: true, error: '등록 버튼(#save_b)을 찾지 못했습니다.' }) } });
    const first = await unreadable.site.openPostTransfer();
    expect(await failure(first.register())).toMatchObject({ code: 'SELLPIA_SCREEN_UNREADABLE', message: '등록 버튼(#save_b)을 찾지 못했습니다.' });

    const empty = sellpia({ steps: { register: () => ({ success: false, empty: true, error: '등록할 수집 주문이 없습니다.' }) } });
    const second = await empty.site.openPostTransfer();
    expect(await failure(second.register())).toMatchObject({ code: 'SITE_REQUEST_FAILED', message: '등록할 수집 주문이 없습니다.', details: { reason: 'mall_refused' } });
  });
});

describe('sites/sellpia 자동송장(운영자 탭, 비가역)', () => {
  it('송장채번 화면 탭에서 대상만 채번해 발급 행(주문번호·송장번호·택배사)을 돌려준다', async () => {
    const { site, log, asked } = sellpia(
      {
        steps: {
          invoice: () => ({
            success: true,
            pressed: true,
            selectedTargetOrderNumbers: ['A-1'],
            rows: [{ ordNo: 'A-1', invNo: 'INV-1', courier: '1136', receiver: '홍' }],
            message: '채번 완료',
          }),
        },
      },
      { existingTab: (pattern) => (pattern.includes('order_delivery_link') ? 52 : null), currentUrl: SELLPIA_INVOICE_URL },
    );
    await expect(site.issueInvoices(['A-1', 'A-2'])).resolves.toEqual({
      state: 'pressed',
      selectedOrderNumbers: ['A-1'],
      issued: [{ orderNo: 'A-1', trackingNumber: 'INV-1', courier: '1136' }],
      message: '채번 완료',
    });
    expect(asked).toEqual([{ call: 'sellpia.orderStep', args: { step: 'invoice', targetOrderNumbers: ['A-1', 'A-2'] } }]);
    expect(log[0]).toBe('find https://*.sellpia.com/order_delivery_link.html*');
    expect(log).toContain('focus 52');
    expect(log.at(-1)).toBe('leave 52');
  });

  it('누르지 않았으면 not_pressed, 호출 답이 끊기거나 누른 뒤 셀피아가 실패라 하면 unknown(확인 대기)', async () => {
    const notPressed = sellpia({ steps: { invoice: () => ({ success: true, pressed: false, selectedTargetOrderNumbers: [], rows: [], message: '일치하는 행이 없습니다.' }) } });
    await expect(notPressed.site.issueInvoices(['A-1'])).resolves.toEqual({ state: 'not_pressed', selectedOrderNumbers: [], issued: [], message: '일치하는 행이 없습니다.' });

    const lost = sellpia({ steps: { invoice: () => ({ ok: false, error: 'timeout' }) } });
    await expect(lost.site.issueInvoices(['A-1'])).resolves.toMatchObject({ state: 'unknown', issued: [] });

    const failedAfterPress = sellpia({ steps: { invoice: () => ({ success: false, pressed: true, error: '채번에 실패했습니다' }) } });
    await expect(failedAfterPress.site.issueInvoices(['A-1'])).resolves.toMatchObject({ state: 'unknown', message: '채번에 실패했습니다' });
  });

  it('누르기 전 실패는 던진다(화면 미판독·로그인)', async () => {
    const unreadable = sellpia({ steps: { invoice: () => ({ success: false, unreadable: true, error: '송장채번 화면(그리드)을 찾지 못했습니다.' }) } });
    expect((await failure(unreadable.site.issueInvoices(['A-1']))).code).toBe('SELLPIA_SCREEN_UNREADABLE');
    const login = sellpia({ steps: { invoice: () => ({ success: false, loginRequired: true }) } });
    expect((await failure(login.site.issueInvoices(['A-1']))).code).toBe('SITE_LOGIN_REQUIRED');
  });
});

describe('sites/sellpia 주문 스냅샷(백그라운드 새 탭, 읽기)', () => {
  it('새 백그라운드 탭에서 대기목록·재고매칭 두 화면을 읽고 닫는다', async () => {
    const { site, log } = sellpia({
      steps: {
        orderSnapshot: [
          () => ({ success: true, rows: [{ orderNo: 'A-1', receiver: '홍', provider: '몰' }] }),
          () => ({ success: true, rows: [{ orderNo: 'B-1', receiver: '김', provider: '몰2' }] }),
        ],
      },
    });
    await expect(site.orderSnapshot()).resolves.toEqual({
      screens: [
        { source: 'pending', rows: [{ orderNo: 'A-1', receiver: '홍', provider: '몰' }] },
        { source: 'stockmatch', rows: [{ orderNo: 'B-1', receiver: '김', provider: '몰2' }] },
      ],
    });
    expect(log.filter((line) => !line.startsWith('ask') && !line.startsWith('inject'))).toEqual([
      'open about:blank',
      `navigate ${SELLPIA_ORDER_UPLOAD_URL}`,
      `navigate ${SELLPIA_STOCKMATCH_URL}`,
      'close 7',
    ]);
    expect(log.some((line) => line.startsWith('focus'))).toBe(false);
  });

  it('한 화면만 읽으면 못 읽은 화면은 rows null, 둘 다 못 읽으면 SITE_LOGIN_REQUIRED이고 탭을 남긴다', async () => {
    const half = sellpia({ steps: { orderSnapshot: [() => ({ success: false, unreadable: true, error: 'x' }), () => ({ success: true, rows: [] })] } });
    await expect(half.site.orderSnapshot()).resolves.toEqual({ screens: [{ source: 'pending', rows: null }, { source: 'stockmatch', rows: [] }] });
    expect(half.log.at(-1)).toBe('close 7');

    const none = sellpia({ steps: { orderSnapshot: () => ({ success: false, unreadable: true, error: 'x' }) } });
    expect((await failure(none.site.orderSnapshot())).code).toBe('SITE_LOGIN_REQUIRED');
    expect(none.log).not.toContain('close 7');
  });
});
