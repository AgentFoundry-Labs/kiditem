import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/wing-thumbnail.js?raw';

/**
 * 쿠팡 WING 대표이미지 처리기(`content/page-call/wing-thumbnail.js`, KID-256 — 옛 `content/coupang/wing-thumbnail-register.js` 이식)를
 * 윙 모양 가짜 화면(jsdom)에서 돌린다. 드롭존은 파일 입력이 바뀌면 미리보기를 그리는 가짜다. [저장]은 누르지 않는다.
 */
type Calls = Record<string, (args: unknown) => Promise<Record<string, any>>>;

function load(html: string, url: string, options: { dropzoneAccepts?: boolean } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url, runScripts: 'outside-only' });
  const { window } = dom;
  const clicks: string[] = [];
  window.document.addEventListener('click', (event: any) => {
    const text = String(event.target?.textContent || '').trim();
    if (text) clicks.push(text);
  }, true);
  // 가짜 드롭존: 파일이 들어오면 미리보기를 그린다(거절이면 오류 미리보기).
  for (const input of window.document.querySelectorAll('input.dz-hidden-input')) {
    input.addEventListener('change', () => {
      const zone = window.document.querySelectorAll('.customdropzone')[[...window.document.querySelectorAll('input.dz-hidden-input')].indexOf(input)];
      const preview = window.document.createElement('div');
      preview.className = options.dropzoneAccepts === false ? 'dz-preview dz-error' : 'dz-preview dz-success';
      zone.appendChild(preview);
    });
  }
  if (typeof window.DataTransfer !== 'function') {
    window.DataTransfer = class {
      private list: unknown[] = [];
      items = { add: (file: unknown) => this.list.push(file) };
      get files() {
        return this.list;
      }
    };
  }
  Object.defineProperty(window.HTMLInputElement.prototype, 'files', { configurable: true, set(this: any, value) { this._files = value; }, get(this: any) { return this._files; } });
  window.eval(source);
  return { calls: window.__kiditemIsolatedPageCalls as Calls, window, clicks };
}

const IMAGE = { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', filename: 'thumb.png', mimeType: 'image/png' };
const FORM = (name: string, withPreview: boolean) => `
  <input placeholder="등록상품명을 입력하세요" value="${name}">
  <div class="item-rep-cell"><div><div class="customdropzone">${withPreview ? '<div class="dz-preview"><a class="dz-action dz-action-remove">삭제</a></div>' : ''}</div></div></div>
  <input type="file" class="dz-hidden-input">
  <div id="confirm"></div>`;

describe('쿠팡 WING 대표이미지 처리기', () => {
  it('목록에서 그 상품 줄의 [수정] 주소만 읽는다 — 누르지 않는다', async () => {
    const { calls, clicks } = load(`<table><tbody>
      <tr><td>1</td><td class="name">다른 상품</td><td><a href="/tenants/seller-web/vendor-inventory/formV2?vendorInventoryId=1">수정</a></td></tr>
      <tr><td>2</td><td class="name">말랑 키링</td><td><a href="/tenants/seller-web/vendor-inventory/formV2?vendorInventoryId=15966710321">수정</a></td></tr>
    </tbody></table>`, 'https://wing.coupang.com/vendor-inventory/list?searchKeywords=x');
    expect(await calls['wingThumb.findEdit']!({ productName: '말랑 키링' })).toEqual({
      ok: true, editUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2?vendorInventoryId=15966710321',
    });
    expect(clicks).toEqual([]);
    expect(await calls['wingThumb.findEdit']!({ productName: '없는 상품' })).toMatchObject({ ok: false });
  });

  it('원래 대표이미지를 지우고 새 사진을 대표이미지 칸에 올린다 — [저장]은 누르지 않는다', async () => {
    const { calls, window, clicks } = load(FORM('말랑 키링', true), 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2?vendorInventoryId=1');
    // 삭제를 누르면 화면 안 확인 창이 뜨고, 확인하면 미리보기가 사라진다.
    window.document.querySelector('.dz-action-remove').addEventListener('click', () => {
      const button = window.document.createElement('button');
      button.textContent = '네, 삭제합니다';
      button.addEventListener('click', () => window.document.querySelector('.customdropzone .dz-preview')?.remove());
      window.document.getElementById('confirm').appendChild(button);
    });
    const answer = await calls['wingThumb.upload']!({ productName: '말랑 키링', image: IMAGE });
    expect(answer).toEqual({ ok: true, steps: ['원래 대표이미지 지우기', '새 대표이미지 올리기'] });
    const file = (window.document.querySelector('input.dz-hidden-input') as any).files[0];
    expect([file.name, file.type]).toEqual(['thumb.png', 'image/png']);
    expect(clicks).toEqual(['삭제', '네, 삭제합니다']);
    expect(clicks.some((text) => /저장|등록/.test(text))).toBe(false);
  }, 20_000);

  it('등록상품명이 다르면 다른 상품 화면이라 올리지 않는다 · 윙이 받지 않으면 실패다', async () => {
    const other = load(FORM('다른 상품', false), 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2');
    expect(await other.calls['wingThumb.upload']!({ productName: '말랑 키링', image: IMAGE })).toMatchObject({ ok: false, error: '상품명 불일치: 다른 상품' });
    const refused = load(FORM('말랑 키링', false), 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2', { dropzoneAccepts: false });
    expect(await refused.calls['wingThumb.upload']!({ productName: '말랑 키링', image: IMAGE })).toMatchObject({ ok: false, error: '윙이 대표이미지를 받지 않았습니다' });
  });
});
