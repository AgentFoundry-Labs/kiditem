import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import onchSource from '../kiditem-os/content/orders/onch-tracking-upload.js?raw';
import kidkidsSource from '../kiditem-os/content/orders/kidkids-tracking-upload.js?raw';

// 몰 송장 업로드 페이지 스크립트(ISOLATED world 파일, 옛 worker.js `scrapeOnchUpload`·`scrapeKidkidsTrackingUpload` 이식)를
// 실제 파일 그대로 돌린다. DOM은 jsdom, 가짜는 페이지 경계(location·fetch·시계)뿐이다. 실제 몰에는 보내지 않는다.

type Handler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
interface Request { url: string; body: URLSearchParams }

function load(source: string, call: string, options: { href: string; html?: string; reply?: (request: Request) => { status?: number; text: string } }) {
  const requests: Request[] = [];
  const document = new JSDOM(options.html ?? '<html><body></body></html>').window.document;
  const isolated: Record<string, unknown> = {};
  const fetch = async (url: string, init: RequestInit) => {
    const request = { url, body: new URLSearchParams(String(init.body)) };
    requests.push(request);
    const reply = options.reply?.(request) ?? { text: '{"code":200}' };
    const status = reply.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => reply.text };
  };
  new Function('globalThis', 'document', 'location', 'fetch', 'setTimeout', source)(isolated, document, { href: options.href }, fetch, (resolve: () => void) => resolve());
  const handler = (isolated.__kiditemIsolatedPageCalls as Record<string, Handler>)[call];
  if (!handler) throw new Error('handler not registered');
  return { handler, requests, document };
}

const fields = (body: URLSearchParams) => {
  const out: Record<string, string> = {};
  body.forEach((value, key) => { out[key] = value; });
  return out;
};

const ONCH = 'https://www.onch3.co.kr/supplier/orders.php?state=all';
/** 온채널 목록: 주문마다 상세 모달 버튼과 송장입력 버튼이 같은 행에 있다(옛 페어링 규칙). */
function onchList(orders: Array<{ code: string; member: string; isFirst: string }>): string {
  const deliveryObjs = JSON.stringify([{ delivery_name: '로젠택배' }, { delivery_name: 'CJ 대한통운(주)' }]);
  return `<input id="deliveryObjs" value='${deliveryObjs}'>
    <table>${orders.map((order) => `<tr>
      <td><a onclick="supplierOrderDetailModal('${order.code}')">${order.code}</a></td>
      <td><button onclick="supplierDeliveryNumberModal('${order.member}','x','${order.isFirst}')">송장입력</button></td>
    </tr>`).join('')}</table>`;
}

describe('온채널 송장 업로드 페이지 스크립트', () => {
  it('목록의 주문코드로 주문을 찾아 행마다 trans_ok를 POST하고, 이미 등록된 주문·목록 밖 주문은 보내지 않는다', async () => {
    const html = onchList([
      { code: 'OC-1', member: 'M-1', isFirst: 'true' },
      { code: 'OC-2', member: 'M-2', isFirst: 'false' },
      { code: 'OC-4', member: 'M-4', isFirst: 'true' },
    ]);
    const { handler, requests } = load(onchSource, 'onch.uploadTracking', {
      href: ONCH,
      html,
      reply: (request) => (request.body.get('hidden_trans_num') === 'M-4' ? { text: '{"code":500}' } : { text: '{"code":200}' }),
    });
    const answer = await handler({
      rows: [
        { orderNo: 'OC-1', trackingNumber: 'INV-1', courierName: 'CJ대한통운' },
        { orderNo: 'OC-2', trackingNumber: 'INV-2', courierName: 'CJ대한통운' },
        { orderNo: 'OC-3', trackingNumber: 'INV-3', courierName: 'CJ대한통운' },
        { orderNo: 'OC-4', trackingNumber: 'INV-4', courierName: 'CJ대한통운' },
      ],
    });
    expect(answer).toEqual({
      status: 'ok',
      listSize: 3,
      rows: [
        { orderNo: 'OC-1', status: 'uploaded', mallMessage: null },
        { orderNo: 'OC-2', status: 'already_uploaded', mallMessage: '이미 송장 등록됨' },
        { orderNo: 'OC-3', status: 'not_in_list', mallMessage: '온채널 목록에 없음(이미 발송 또는 기간 밖)' },
        { orderNo: 'OC-4', status: 'failed', mallMessage: '응답 500' },
      ],
    });
    expect(requests.map((request) => [request.url, fields(request.body)])).toEqual([
      ['/access/order_access.php?ubr=trans_ok', { trans_nm: 'CJ 대한통운(주)', trans_num: 'INV-1', hidden_trans_num: 'M-1' }],
      ['/access/order_access.php?ubr=trans_ok', { trans_nm: 'CJ 대한통운(주)', trans_num: 'INV-4', hidden_trans_num: 'M-4' }],
    ]);
  });

  it('로그인 화면이면 아무것도 보내지 않고 login_required', async () => {
    const { handler, requests } = load(onchSource, 'onch.uploadTracking', { href: 'https://www.onch3.co.kr/login/login_web.php', html: '<input type="password">' });
    await expect(handler({ rows: [{ orderNo: 'OC-1', trackingNumber: 'INV-1', courierName: 'CJ대한통운' }] })).resolves.toEqual({ status: 'login_required' });
    expect(requests).toEqual([]);
  });
});

const KIDKIDS = 'https://partner.kidkids.net/new/pages/logis/management.htm';
/** 키드키즈 출고관리 목록: 출고선택 CheckBox(od), 주문번호 칸, 택배사 select, 송장 입력칸. */
function kidkidsList(orders: Array<{ od: string; orderNo: string }>): string {
  return `<table>
    <tr><td>출고선택</td><td>주문번호</td><td>택배사</td><td>송장</td></tr>
    ${orders.map((order) => `<tr>
      <td><input type="checkbox" name="CheckBox" value="${order.od}"></td>
      <td>${order.orderNo}</td>
      <td><select name="logis_company_id"><option value="1">로젠택배</option><option value="7">CJ대한통운</option></select></td>
      <td><input name="deliveryTxt_${order.od}"></td>
    </tr>`).join('')}
  </table>`;
}

describe('키드키즈 송장 업로드 페이지 스크립트', () => {
  it('주문번호로 행을 찾아 송장·택배사를 넣고 출고선택한 뒤 출고완료(mode=aan)를 한 번 POST한다 — 성공 코드가 없어 submitted만 알린다', async () => {
    const html = kidkidsList([{ od: 'od-1', orderNo: 'K-1' }, { od: 'od-2', orderNo: 'K-2' }]);
    const { handler, requests, document } = load(kidkidsSource, 'kidkids.uploadTracking', { href: KIDKIDS, html, reply: () => ({ text: '<html>목록</html>' }) });
    const answer = await handler({
      rows: [
        { orderNo: 'K-1', trackingNumber: 'INV-1', courierName: 'CJ대한통운' },
        { orderNo: 'K-9', trackingNumber: 'INV-9', courierName: 'CJ대한통운' },
        { orderNo: 'K-2', trackingNumber: 'INV-2', courierName: 'CJ대한통운' },
      ],
    });
    expect(answer).toEqual({
      status: 'ok',
      submitted: true,
      httpStatus: 200,
      listSize: 2,
      rows: [
        { orderNo: 'K-1', status: 'uploaded', mallMessage: null },
        { orderNo: 'K-9', status: 'not_in_list', mallMessage: '목록에 없음(이미 발송/기간 밖)' },
        { orderNo: 'K-2', status: 'uploaded', mallMessage: null },
      ],
    });
    expect(requests.map((request) => [request.url, fields(request.body)])).toEqual([[
      '/sales/sales_process.htm',
      { from_logis_index: 'Y', mode: 'aan', mul_id: '|od-1|od-2', delivery_no: '|INV-1|INV-2', logis_company_id: '7' },
    ]]);
    expect(document.querySelector('input[name="deliveryTxt_od-1"]').value).toBe('INV-1');
    expect(document.querySelector('input[value="od-2"]').checked).toBe(true);
  });

  it('넣을 주문이 하나도 없으면 POST하지 않는다(submitted:false)', async () => {
    const { handler, requests } = load(kidkidsSource, 'kidkids.uploadTracking', { href: KIDKIDS, html: kidkidsList([{ od: 'od-1', orderNo: 'K-1' }]) });
    await expect(handler({ rows: [{ orderNo: 'K-9', trackingNumber: 'INV-9', courierName: 'CJ대한통운' }] })).resolves.toMatchObject({
      status: 'ok',
      submitted: false,
      rows: [{ orderNo: 'K-9', status: 'not_in_list', mallMessage: '목록에 없음(이미 발송/기간 밖)' }],
    });
    expect(requests).toEqual([]);
  });

  it('출고완료 POST가 HTTP 오류면 넣은 행을 failed로 돌려준다', async () => {
    const { handler } = load(kidkidsSource, 'kidkids.uploadTracking', { href: KIDKIDS, html: kidkidsList([{ od: 'od-1', orderNo: 'K-1' }]), reply: () => ({ status: 500, text: 'error' }) });
    await expect(handler({ rows: [{ orderNo: 'K-1', trackingNumber: 'INV-1', courierName: 'CJ대한통운' }] })).resolves.toMatchObject({
      status: 'ok',
      submitted: false,
      httpStatus: 500,
      rows: [{ orderNo: 'K-1', status: 'failed', mallMessage: '출고완료 등록 실패(HTTP 500)' }],
    });
  });

  it('출고완료 POST가 응답 없이 끊기면(fetch 거절) 반영됐을 수 있어 submitted:true로 두고 넣은 행에 확인 필요 문장을 싣는다', async () => {
    const { handler, requests } = load(kidkidsSource, 'kidkids.uploadTracking', {
      href: KIDKIDS,
      html: kidkidsList([{ od: 'od-1', orderNo: 'K-1' }]),
      reply: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(handler({ rows: [{ orderNo: 'K-1', trackingNumber: 'INV-1', courierName: 'CJ대한통운' }] })).resolves.toMatchObject({
      status: 'ok',
      submitted: true,
      httpStatus: null,
      rows: [{ orderNo: 'K-1', status: 'failed', mallMessage: '출고완료 요청의 응답을 받지 못했습니다. 키드키즈 목록에서 반영 여부를 확인해 주세요.' }],
    });
    expect(requests).toHaveLength(1);
  });

  it('로그인 화면이거나 출고관리 목록이 없으면 보내지 않는다', async () => {
    const login = load(kidkidsSource, 'kidkids.uploadTracking', { href: 'https://www.kidkids.net/join/partner_login.htm' });
    await expect(login.handler({ rows: [] })).resolves.toEqual({ status: 'login_required' });
    const empty = load(kidkidsSource, 'kidkids.uploadTracking', { href: KIDKIDS });
    await expect(empty.handler({ rows: [] })).resolves.toEqual({ status: 'unreadable', error: '출고관리 목록을 찾지 못했습니다. (로그인/화면 확인)' });
  });
});
