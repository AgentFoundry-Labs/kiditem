import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/domeggook-orders.js?raw';

// 도매꾹 엑셀 생성 요청 페이지 스크립트(MAIN world 파일, 옛 worker.js `triggerDomeggookExcelGen` 이식)를 실제 파일 그대로
// 돌린다. 가짜는 페이지 경계(주문목록 DOM·모달 iframe·alert)뿐이다 — 옛 수집기 테스트의 화면 그대로.
type Handler = () => Promise<Record<string, unknown>>;

function load(document: unknown, window: Record<string, unknown> = {}) {
  const pageWindow = Object.assign(window, { __kiditemPageCalls: {} });
  const immediate = (callback: () => void) => callback();
  new Function('window', 'document', 'setTimeout', source)(pageWindow, document, immediate);
  return { handler: (pageWindow.__kiditemPageCalls as Record<string, Handler>)['domeggook.requestExcel']!, pageWindow };
}

describe('domeggook request-excel page script', () => {
  it('엑셀다운로드를 누르고 iframe#gLayerFrame 모달의 생성요청 버튼을 제출한다', async () => {
    const calls = { download: 0, submit: 0 };
    const submit = { click: () => { calls.submit += 1; } };
    const frame = { contentDocument: { querySelector: (selector: string) => (selector === '#lXlsReqNoticeBtnSubmit' ? submit : null) }, contentWindow: {} };
    const download = { textContent: '엑셀 다운로드', value: '', click: () => { calls.download += 1; } };
    const document = {
      querySelectorAll: () => [download],
      querySelector: (selector: string) => (selector === 'iframe#gLayerFrame, #gLayerFrame iframe' ? frame : null),
    };
    const { handler } = load(document);
    await expect(handler()).resolves.toEqual({ status: 'requested' });
    expect(calls).toEqual({ download: 1, submit: 1 });
  });

  it('주문이 없다는 alert는 가로채 empty로 답하고 페이지의 alert를 되돌린다, 버튼이 없으면 failed', async () => {
    const originalAlert = () => undefined;
    const pageWindow: Record<string, unknown> = { alert: originalAlert };
    const download = {
      textContent: '엑셀다운로드',
      value: '',
      click: () => (pageWindow.alert as (message: string) => void)('다운로드할 주문내역이 없습니다.'),
    };
    const loaded = load({ querySelectorAll: () => [download], querySelector: () => null }, pageWindow);
    await expect(loaded.handler()).resolves.toEqual({ status: 'empty', message: '다운로드할 주문내역이 없습니다.' });
    expect(loaded.pageWindow.alert).toBe(originalAlert);

    await expect(load({ querySelectorAll: () => [], querySelector: () => null }).handler()).resolves.toMatchObject({ status: 'failed' });
  });
});
