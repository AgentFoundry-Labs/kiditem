// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import gridSource from '../kiditem-os/content/orders/icecream-delivery-grid.js?raw';
import menuSource from '../kiditem-os/content/orders/icecream-menu.js?raw';
import { ICECREAM_DELIVERY_HEADERS, ICECREAM_EXCLUDED_DELIVERY_STATUSES } from './sites/icecream-mall';

// 아이스크림몰 페이지 스크립트(옛 worker.js `ensureIcecreamMallDeliveryInquiry`·`scrapeIcecreamMallDeliveryGrid` 이식)를
// 실제 파일 그대로 돌린다. 가짜는 페이지 경계(메뉴·프레임·시계)뿐이고, 배송목록 표는 jsdom이 그린다.
const DELIVERY_URL = 'https://po.i-screammall.co.kr/delivery/deliveryInquiry.deliveryInquiryListView.do';
type Handler = (args?: unknown) => Promise<Record<string, unknown>>;

function loadMenu(document: unknown, href: string) {
  const isolated: Record<string, unknown> = {};
  const immediate = (callback: () => void) => setTimeout(callback, 0);
  new Function('globalThis', 'document', 'location', 'setTimeout', menuSource)(isolated, document, { href }, immediate);
  return (isolated.__kiditemIsolatedPageCalls as Record<string, Handler>)['icecream.openDeliveryInquiry']!;
}

/** 400ms 기다림을 곧바로 넘기고 시계를 앞당긴다(22초 폴링을 기다리지 않는다). */
function fastClock() {
  let now = Date.parse('2026-09-26T01:00:00Z');
  class FakeDate extends Date {
    constructor(...args: [] | [string]) {
      if (args.length === 0) super(now);
      else super(args[0]);
    }
    static override now() {
      now += 500;
      return now;
    }
  }
  return { Date: FakeDate, setTimeout: (callback: () => void) => callback() };
}

/** jsdom 문서(확장 tsconfig에는 DOM 타입이 없어 필요한 모양만 적는다). */
type JsdomDocument = { body: { innerHTML: string; textContent: string | null } };
const jsdom = globalThis as unknown as { document: JsdomDocument; Event: unknown };

function loadGrid(html: string) {
  const document = jsdom.document;
  document.body.innerHTML = html;
  // jsdom에는 innerText가 없다 — 화면 글자는 textContent로 대신한다.
  Object.defineProperty(document.body, 'innerText', { configurable: true, get: () => document.body.textContent ?? '' });
  const window = { __kiditemPageCalls: {} } as Record<string, unknown>;
  const clock = fastClock();
  new Function('window', 'document', 'Date', 'setTimeout', 'Event', gridSource)(window, document, clock.Date, clock.setTimeout, jsdom.Event);
  return (window.__kiditemPageCalls as Record<string, Handler>)['icecream.deliveryGrid']!;
}

function row(cells: readonly string[], tag = 'td') {
  return `<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join('')}</tr>`;
}

function line(orderNo: string, status: string): string[] {
  return ICECREAM_DELIVERY_HEADERS.map((header, index) => {
    if (header === 'No') return String(index);
    if (header === '주문번호') return orderNo;
    if (header === '주문내역상태') return status;
    if (header === '상품명') return '색종이';
    return `${header}값`;
  });
}

const ARGS = { date: '2026-09-26', headers: [...ICECREAM_DELIVERY_HEADERS], excludedStatuses: [...ICECREAM_EXCLUDED_DELIVERY_STATUSES] };

describe('icecream page scripts', () => {
  it('배송 조회 메뉴를 누른 뒤 옆 메뉴 글자가 아니라 배송목록 프레임이 그려질 때까지 기다린다', async () => {
    const state = { menuExpanded: false, frameLoaded: false, frameReads: 0 };
    const frame = {
      get contentWindow() {
        return { location: { href: state.frameLoaded ? DELIVERY_URL : 'about:blank' } };
      },
      get contentDocument() {
        if (state.menuExpanded && !state.frameLoaded) {
          state.frameReads += 1;
          if (state.frameReads >= 3) state.frameLoaded = true;
        }
        return { body: { innerText: state.frameLoaded ? '배송 조회 조회기간 배송목록 주문번호 배송번호' : '' } };
      },
    };
    const menu = { textContent: '배송 조회', value: '', getAttribute: () => null, click: () => { state.menuExpanded = true; } };
    const page = {
      body: { get innerText() { return state.menuExpanded ? '상품 주문/결제 배송 배송 조회 정산' : '상품 주문/결제 배송 정산'; } },
      querySelectorAll: (selector: string) => (selector === 'iframe,frame' ? [frame] : [menu]),
    };
    await expect(loadMenu(page, 'https://po.i-screammall.co.kr/main.do')()).resolves.toEqual({ status: 'opened', opened: true });
    expect(state.frameLoaded).toBe(true);

    const open = { body: { innerText: '배송 조회 조회기간 배송목록 주문번호 배송번호' }, querySelectorAll: () => [] };
    await expect(loadMenu(open, DELIVERY_URL)()).resolves.toEqual({ status: 'opened', opened: false });

    const signedOut = { body: { innerText: '아이디 비밀번호 로그인' }, querySelectorAll: () => [] };
    await expect(loadMenu(signedOut, 'https://po.i-screammall.co.kr/loginForm.do')()).resolves.toEqual({ status: 'login_required' });
  });

  it('배송목록 표에서 출고 전 주문 행만 머리글 길이에 맞춰 돌려준다(이미 출고·배송 중은 뺀다)', async () => {
    const html = `<div>배송 조회 배송목록</div><table>${row(ICECREAM_DELIVERY_HEADERS, 'th')}${row(line('20260926M0001', '결제완료'))}${row(line('20260926M0002', '배송중'))}${row(line('20260926M0003', '출고지시'))}</table>`;
    const answer = await loadGrid(html)(ARGS);
    expect(answer.status).toBe('ok');
    expect(answer.headers).toEqual(ICECREAM_DELIVERY_HEADERS);
    expect((answer.rows as string[][]).map((cells) => cells[1])).toEqual(['20260926M0001', '20260926M0003']);
    expect(answer.masked).toBe(false);
  });

  it('주문이 모두 이미 출고됐거나 주문 행이 없으면 진단과 함께 none, 배송조회 화면이 아니면 none', async () => {
    const shipped = `<div>배송 조회 배송목록</div><table>${row(ICECREAM_DELIVERY_HEADERS, 'th')}${row(line('20260926M0001', '배송완료'))}</table>`;
    await expect(loadGrid(shipped)(ARGS)).resolves.toMatchObject({ status: 'none', reason: 'data rows not found', orderRows: 1, doneExcluded: 1 });
    await expect(loadGrid('<div>대시보드</div>')(ARGS)).resolves.toEqual({ status: 'none', reason: 'not delivery inquiry frame' });
  });
});
