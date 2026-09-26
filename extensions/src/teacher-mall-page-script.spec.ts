import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/teacher-mall-orders.js?raw';

// 티쳐몰 주문 엑셀 페이지 스크립트(MAIN world 처리기, 옛 worker.js `scrapeTeachervilleOrders` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(주문상품 목록 DOM·fetch)뿐이다. 옛 order-collector-empty-vs-login 테스트의 티쳐몰 화면을 옮겼다.
type Handler = (args: unknown) => Promise<Record<string, unknown>>;
const ARGS = { templateSeq: '117', fallbackProviderSeq: '708', downloadReason: '배송준비확인' };

function checkbox(value: string, step: string) {
  return { value, closest: () => ({ className: `list-row step${step}` }) };
}

function catalog(options: { bodyText?: string; rows?: unknown[]; form?: boolean; providerSeq?: string } = {}) {
  const form = {
    querySelector: (selector: string) => {
      if (selector === 'input[name="excel_provider_seq"]') return options.providerSeq ? { value: options.providerSeq } : null;
      if (selector === '[name="excel_ship_set_code"]') return { value: 'SHIP-1' };
      return null;
    },
  };
  return {
    body: { innerText: options.bodyText ?? '주문 관리' },
    querySelector: (selector: string) => (selector === 'form#excel_down_form' && options.form !== false ? form : null),
    querySelectorAll: (selector: string) => (selector === 'input[type="checkbox"][name="order_seq[]"]' ? options.rows ?? [] : []),
  };
}

function load(document: unknown, fetch: (url: string, init: { body: URLSearchParams }) => Promise<Response> = async () => {
  throw new Error('fetch should not run');
}) {
  const window: Record<string, unknown> = { $: {}, __kiditemPageCalls: {} };
  const immediate = (callback: () => void) => callback();
  const location = { href: 'https://shop.teacherville.co.kr/selleradmin/order/catalog' };
  new Function('window', 'document', 'fetch', 'location', 'setTimeout', 'btoa', source)(window, document, fetch, location, immediate, btoa);
  return (window.__kiditemPageCalls as Record<string, Handler>)['teacher-mall.orders']!;
}

describe('teacher-mall orders page script', () => {
  it('출고 전 행(25·35·40·45)만 골라 양식 117·입점사·다운로드 사유로 excel_down을 보내 SpreadsheetML을 base64로 돌려준다', async () => {
    const posted: Array<[string, Record<string, string>]> = [];
    const xml = '<?xml version="1.0"?>' + '<Workbook>'.padEnd(120, 'x');
    const handler = load(catalog({ rows: [checkbox('11', '25'), checkbox('12', '55'), checkbox('13', '45')] }), async (url, init) => {
      const fields: Record<string, string> = {};
      init.body.forEach((value, key) => {
        fields[key] = value;
      });
      posted.push([url, fields]);
      return new Response(xml, { status: 200 });
    });
    await expect(handler(ARGS)).resolves.toEqual({
      success: true,
      xlsxBase64: btoa(xml),
      fileName: '티쳐몰.xls',
      size: xml.length,
      orderCount: 2,
    });
    expect(posted).toEqual([['/selleradmin/order_process/excel_down', {
      order_seq: '11|13|',
      seq: '117',
      excel_provider_seq: '708',
      excel_ship_set_code: 'SHIP-1',
      download_reason_select: 'direct',
      download_reason_text: '배송준비확인',
      download_reason: '배송준비확인',
    }]]);
  });

  it('출고 전 행이 없으면 "없음" 문구가 보일 때만 빈 수집, 판정할 수 없으면 provider_contract_changed(옛 테스트)', async () => {
    await expect(load(catalog({ bodyText: '조회된 주문이 없습니다.' }))(ARGS)).resolves.toEqual({ success: true, empty: true, rowCount: 0 });
    await expect(load(catalog({ rows: [checkbox('12', '55')] }))(ARGS)).resolves.toEqual({ success: true, empty: true, rowCount: 0 });
    await expect(load(catalog({ bodyText: '주문 관리' }))(ARGS)).resolves.toMatchObject({ success: false, errorCode: 'provider_contract_changed' });
  });

  it('폼이 없고 로그인 화면이면 login_required, 401 응답도 login_required', async () => {
    await expect(load(catalog({ form: false, bodyText: '로그인' }))(ARGS)).resolves.toMatchObject({ success: false, pendingLogin: true, errorCode: 'login_required' });
    const unauthorized = load(catalog({ rows: [checkbox('11', '25')] }), async () => new Response('', { status: 401 }));
    await expect(unauthorized(ARGS)).resolves.toMatchObject({ errorCode: 'login_required' });
  });
});
