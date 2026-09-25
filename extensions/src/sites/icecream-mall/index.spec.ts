import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { siteFactoryFor } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { createIcecreamMallSite, icecreamHasNoPendingOrders, ICECREAM_DELIVERY_HEADERS, ICECREAM_MALL_URL } from './index';

const INPUT = { collectionDate: '2026-09-26', selectionMode: 'manual' as const, seenRowKeys: [] };
const sleep = async () => undefined;
const ROWS = [['1', '20260926M0001']];

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

function answers(grid: unknown, menu: unknown = { status: 'opened' }) {
  return (message: Record<string, unknown>) => {
    if (message.call === 'icecream.openDeliveryInquiry') return { ok: true, value: menu };
    return { ok: true, value: grid };
  };
}

describe('sites/icecream-mall — 아이스크림몰 배송목록 읽기', () => {
  it('몰 키 이름으로 등록된다', () => {
    expect(siteFactoryFor('icecream-mall')).not.toBeNull();
  });

  it('로그인 폼이 없으면 배송조회를 열고, 점수가 가장 큰 배송조회 프레임에서 출고 전 행과 머리글을 읽는다', async () => {
    const grid = { status: 'ok', headers: [...ICECREAM_DELIVERY_HEADERS], rows: ROWS, masked: false };
    const fake = fakeTabPages({
      answer: answers(grid),
      frames: (_files, call) => call <= 16
        ? [{ frameId: 0, result: { loginPage: false, deliveryScore: 0 } }]
        : [{ frameId: 0, result: { deliveryScore: 5 } }, { frameId: 4, result: { deliveryScore: 22 } }, { frameId: 9, result: { deliveryScore: 0 } }],
    });
    await expect(createIcecreamMallSite(fake.tabs, sleep).readOrders(INPUT)).resolves.toEqual({
      rows: ROWS,
      continuation: { headers: [...ICECREAM_DELIVERY_HEADERS] },
    });
    expect(fake.log.filter((entry) => !entry.startsWith('frames'))).toEqual([
      'open about:blank',
      `navigate ${ICECREAM_MALL_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'ask KIDITEM_PAGE_CALL frame 4',
      'close 7',
    ]);
    expect(fake.log.filter((entry) => entry.startsWith('frames'))).toHaveLength(17);
  });

  it('로그인 폼·로그인 화면 이동은 SITE_LOGIN_REQUIRED로 탭을 남긴다', async () => {
    const withForm = fakeTabPages({ answer: answers({}), frames: () => [{ frameId: 3, result: { loginPage: true } }] });
    expect((await failure(createIcecreamMallSite(withForm.tabs, sleep).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(withForm.log).not.toContain('close 7');

    const menuLogin = fakeTabPages({ answer: answers({}, { status: 'login_required' }), frames: () => [] });
    expect((await failure(createIcecreamMallSite(menuLogin.tabs, sleep).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');
  });

  it('출고 전 주문이 없는 날은 빈 수집, 표를 못 읽으면 SITE_REQUEST_FAILED(진단 담아)', async () => {
    const noOrders = fakeTabPages({ answer: answers({ status: 'none', reason: 'data rows not found', candidateRows: 12, orderRows: 0 }), frames: () => [] });
    await expect(createIcecreamMallSite(noOrders.tabs, sleep).readOrders(INPUT)).resolves.toEqual({ rows: [] });

    const noHeader = fakeTabPages({ answer: answers({ status: 'none', reason: 'header not found', headerCount: 3 }), frames: () => [] });
    expect(await failure(createIcecreamMallSite(noHeader.tabs, sleep).readOrders(INPUT))).toMatchObject({
      code: 'SITE_REQUEST_FAILED',
      details: { reason: 'page_error', diagnosis: { reason: 'header not found' } },
    });
  });

  it('신규 주문 없음 판정은 옛 규칙 그대로(주문 행 0 또는 전부 이미 출고)', () => {
    const noPending = (diag: Record<string, number>) => icecreamHasNoPendingOrders({ reason: 'data rows not found', ...diag });
    expect(noPending({ candidateRows: 12, orderRows: 0, doneExcluded: 0 })).toBe(true);
    expect(noPending({ candidateRows: 20, orderRows: 3, doneExcluded: 3 })).toBe(true);
    expect(noPending({ candidateRows: 20, orderRows: 3, doneExcluded: 1 })).toBe(false);
    expect(icecreamHasNoPendingOrders({ reason: 'header not found' })).toBe(false);
  });
});
