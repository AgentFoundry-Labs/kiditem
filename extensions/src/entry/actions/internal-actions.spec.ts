import { ExportWingInventoryWorkbookResponseSchema } from '@kiditem/shared/extension-actions';
import { describe, expect, it } from 'vitest';
import type { ApiPort } from '../../core/api';
import type { ActionContext } from '../../core/dispatch';
import { exportWingInventoryWorkbookAction } from './export-wing-inventory-workbook';
import { kiditemApiRequestAction } from './kiditem-api-request';

const context: ActionContext = { environmentId: 'office', sender: { id: 'ext', tab: { id: 7 } } };

function api(respond: (path: string, init?: RequestInit) => Response) {
  const calls: Array<{ environmentId: string; path: string; init?: RequestInit }> = [];
  return {
    calls,
    apiFor(environmentId: string): ApiPort {
      return { fetch: async (path, init) => { calls.push({ environmentId, path, init }); return respond(path, init); } };
    },
  };
}

function parsed<T>(action: { schema: { safeParse(value: unknown): { success: boolean; data?: T } } }, message: unknown): T {
  const result = action.schema.safeParse(message);
  if (!result.success) throw new Error('invalid');
  return result.data as T;
}

describe('Wing 재고 내보내기(콘텐츠 스크립트 → 확장, KID-366)', () => {
  it('Wing 탭이 묶인 환경의 API로 행을 보내 xls를 base64로 돌려준다', async () => {
    const fake = api(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-disposition': "attachment; filename*=UTF-8''%EC%9E%AC%EA%B3%A0.xls" } }));
    const action = exportWingInventoryWorkbookAction({ apiFor: fake.apiFor, now: () => new Date(2026, 8, 29, 9, 5) });
    const response = await action.handle(parsed(action, { action: 'exportWingInventoryWorkbook', rows: [{ 상품명: 'A' }] }), context);
    expect(ExportWingInventoryWorkbookResponseSchema.parse(response)).toEqual({ success: true, fileName: '재고.xls', b64: 'AQID' });
    expect(fake.calls[0]).toMatchObject({ environmentId: 'office', path: '/api/channels/coupang-wing/inventory-export', init: { method: 'POST' } });
    expect(JSON.parse(String(fake.calls[0]!.init!.body))).toEqual({ products: [{ 상품명: 'A' }], fileName: 'wing-inventory_2026-09-29_09.05.xls' });
  });

  it('행이 없으면 부르지 않고, 서버 오류 봉투는 그 코드로 던진다', async () => {
    const fake = api(() => Response.json({ statusCode: 400, code: 'VALIDATION_FAILED', kind: 'validation', message: '행이 올바르지 않습니다.' }, { status: 400 }));
    const action = exportWingInventoryWorkbookAction({ apiFor: fake.apiFor, now: () => new Date() });
    await expect(action.handle(parsed(action, { action: 'exportWingInventoryWorkbook', rows: [] }), context)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fake.calls).toEqual([]);
    await expect(action.handle(parsed(action, { action: 'exportWingInventoryWorkbook', rows: [{ a: 1 }] }), context)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', message: '행이 올바르지 않습니다.' });
  });
});

describe('팝업 API 요청(kiditemApiRequest)', () => {
  it('/api/ 경로만 그 환경 토큰으로 부르고 Authorization 머리는 버린다', async () => {
    const fake = api(() => Response.json({ items: [] }, { status: 200 }));
    const action = kiditemApiRequestAction({ apiFor: fake.apiFor });
    const response = await action.handle(parsed(action, { action: 'kiditemApiRequest', environmentId: 'office', path: '/api/operations?limit=1', init: { headers: { Authorization: 'x', Accept: 'application/json' } } }), context);
    expect(response).toEqual({ success: true, ok: true, status: 200, body: { items: [] } });
    expect(new Headers(fake.calls[0]!.init!.headers).get('authorization')).toBeNull();
    expect(action.schema.safeParse({ action: 'kiditemApiRequest', path: 'https://evil.test/api/x' }).success).toBe(false);
    expect(action.schema.safeParse({ action: 'kiditemApiRequest', path: '/other' }).success).toBe(false);
  });
});
