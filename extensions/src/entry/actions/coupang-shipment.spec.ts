import { FetchCoupangShipmentPdfBatchResponseSchema, OpenCoupangShipmentPageResponseSchema } from '@kiditem/shared/extension-actions';
import { describe, expect, it } from 'vitest';
import type { ActionContext } from '../../core/dispatch';
import { COUPANG_SHIPMENT_URL } from '../../sites/coupang-supplier/shipments';
import { fastClock } from '../../sites/login.fake';
import { fakeTabPages } from '../../sites/tab-page.fake';
import { fetchCoupangShipmentPdfBatchAction } from './fetch-coupang-shipment-pdf-batch';
import { openCoupangShipmentPageAction } from './open-coupang-shipment-page';

const context: ActionContext = { environmentId: 'local', sender: { url: 'http://localhost:3000/' } };

function parse<T>(action: { schema: { safeParse(value: unknown): { success: boolean; data?: T } } }, message: unknown): T {
  const parsed = action.schema.safeParse(message);
  if (!parsed.success) throw new Error('invalid');
  return parsed.data as T;
}

describe('쿠팡 쉽먼트 entry 액션', () => {
  it('openCoupangShipmentPage는 탭을 앞으로 가져와 shared 응답 모양으로 답한다', async () => {
    const fake = fakeTabPages({ answer: () => ({}), currentUrl: COUPANG_SHIPMENT_URL });
    const action = openCoupangShipmentPageAction(fake.tabs);
    const response = await action.handle(parse(action, { action: 'openCoupangShipmentPage', url: COUPANG_SHIPMENT_URL }), context);
    expect(OpenCoupangShipmentPageResponseSchema.parse(response)).toEqual({ success: true, tabId: 7, url: COUPANG_SHIPMENT_URL });
    expect(fake.log).toContain('focus 7');
  });

  it('fetchCoupangShipmentPdfBatch는 항목마다 파일 하나를 돌려주고 탭을 닫는다', async () => {
    const fake = fakeTabPages({ answer: (_message, injected) => (injected ? { ok: true, status: 200, pdf: true, bytes: 5, b64: 'JVBERi0=' } : { ok: false, error: 'content_script_missing' }) });
    const action = fetchCoupangShipmentPdfBatchAction({ tabs: fake.tabs, ...fastClock() });
    const response = await action.handle(parse(action, {
      action: 'fetchCoupangShipmentPdfBatch',
      items: [{ seq: '1', kind: 'label' }, { seq: '1', kind: 'manifest' }],
    }), context);
    expect(FetchCoupangShipmentPdfBatchResponseSchema.parse(response).files.map((file) => [file.seq, file.kind, file.ok])).toEqual([['1', 'label', true], ['1', 'manifest', true]]);
    expect(fake.log.at(-1)).toBe('close 7');
  });

  it('쿠키 과다면 탭을 닫고 SITE_COOKIE_BLOAT로 던진다', async () => {
    const fake = fakeTabPages({ answer: (_message, injected) => (injected ? { ok: true, status: 431, pdf: false, bytes: 0, b64: null } : { ok: false, error: 'content_script_missing' }) });
    const action = fetchCoupangShipmentPdfBatchAction({ tabs: fake.tabs, ...fastClock() });
    await expect(action.handle(parse(action, { action: 'fetchCoupangShipmentPdfBatch', items: [{ seq: '1', kind: 'label' }] }), context)).rejects.toMatchObject({ code: 'SITE_COOKIE_BLOAT' });
    expect(fake.log.at(-1)).toBe('close 7');
  });
});
