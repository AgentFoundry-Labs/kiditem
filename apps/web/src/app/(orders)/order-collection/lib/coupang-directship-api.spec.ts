import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const api = vi.hoisted(() => ({ fetchRaw: vi.fn(), getParsed: vi.fn(), get: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiClient: api }));

import {
  collectCoupangDirectFromExtension,
  convertCoupangDirectToSellpiaFile,
} from './coupang-directship-api';

// 직배송 캡처 = 실행 kind orders.coupang_directship(KID-359). "attemptId"는 실행 ID다.
const OPERATION_ID = '33333333-3333-4333-8333-333333333333';
const RUN = { attemptId: OPERATION_ID, attemptToken: OPERATION_ID, sourceOwner: 'coupang_directship' as const };
const CAPTURE = { channelAccountId: '11111111-1111-4111-8111-111111111111', pos: [], centers: {} };

function operation(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: OPERATION_ID,
    kind: 'orders.coupang_directship',
    status,
    lockKeys: [],
    plan: { channelAccountId: CAPTURE.channelAccountId, captureMode: 'browser' },
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-26T00:01:00.000Z',
    expiresAt: '2026-09-26T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}

describe('Coupang direct-shipment collection lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('확장이 도는 실행이 끝나기를 실행 reader로 기다렸다가 서버가 보관한 캡처를 읽는다', async () => {
    api.get
      .mockResolvedValueOnce({ operations: [operation('executing')] })
      .mockResolvedValue({ operations: [operation('succeeded')] });
    api.getParsed.mockResolvedValue(CAPTURE);

    await expect(collectCoupangDirectFromExtension({ ...RUN, extensionId: 'order-extension' })).resolves.toEqual({ pos: [], centers: {} });

    expect(api.get).toHaveBeenCalledWith('/api/operations?kinds=orders.coupang_directship&limit=10');
    expect(api.getParsed).toHaveBeenCalledWith(
      `/api/orders/collection/coupang-directship/operations/${OPERATION_ID}/capture`,
      expect.anything(),
    );
  }, 10_000);

  it('실패한 실행은 그 실행의 실패 문장으로 거절한다', async () => {
    api.get.mockResolvedValue({ operations: [operation('failed', { errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '쿠팡 서플라이어 허브 로그인이 필요합니다.' })] });
    await expect(collectCoupangDirectFromExtension(RUN)).rejects.toThrow('쿠팡 서플라이어 허브 로그인이 필요합니다.');
    expect(api.getParsed).not.toHaveBeenCalled();
  });

  it('passes cancellation to backend conversion', async () => {
    const abortController = new AbortController();
    api.fetchRaw.mockResolvedValue(new Response('conversion failed', { status: 400 }));

    await expect(convertCoupangDirectToSellpiaFile(
      {
        pos: [{
          status: 'PA',
          items: [],
          seq: 'PO-1',
          center: '',
          transport: 'SHIPMENT',
          edd: '',
          reg: '',
        }],
        centers: {},
      },
      'SHIPMENT',
      {
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        download: false,
        signal: abortController.signal,
        run: RUN,
      },
    )).rejects.toThrow('conversion failed');

    expect(api.fetchRaw).toHaveBeenCalledWith(
      '/api/orders/collection/coupang-directship/convert',
      expect.objectContaining({ signal: abortController.signal }),
    );
    expect(JSON.parse(api.fetchRaw.mock.calls[0]?.[1]?.body as string))
      .toMatchObject({
        operationId: OPERATION_ID,
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        transport: 'SHIPMENT',
      });
  });

  it('keeps every collected row even when none match an active Rocket workbook', async () => {
    const intentKey = 'rocket-final-order:66666666-6666-4666-8666-666666666666:shipment';
    api.fetchRaw.mockResolvedValue(fileResponse({ exportId: null, intentKey }));

    const result = await convertCoupangDirectToSellpiaFile(
      { pos: [], centers: {} },
      'SHIPMENT',
      {
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        download: false,
        run: RUN,
      },
    );

    expect(result).toMatchObject({
      file: expect.objectContaining({ fileName: 'rocket.xls' }),
      outputRows: 1,
      workbookMatchedRows: 0,
      workbookUnmatchedRows: 1,
      importRunId: '66666666-6666-4666-8666-666666666666',
      rocketWorkbookExportId: null,
      transmissionIntentKey: intentKey,
    });
  });

  it('represents a successful no-match probe without trying to read a workbook', async () => {
    const exportId = '55555555-5555-4555-8555-555555555555';
    api.fetchRaw.mockResolvedValue(new Response(null, {
      status: 204,
      headers: {
        'X-Order-Collection-Operation-Id': '66666666-6666-4666-8666-666666666666',
        'X-Rocket-Workbook-Export-Id': exportId,
        'X-Order-Collection-Output-Rows': '0',
      },
    }));

    await expect(convertCoupangDirectToSellpiaFile(
      { pos: [], centers: {} },
      'MILKRUN',
      {
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        download: false,
        run: RUN,
      },
    )).resolves.toEqual({
      file: null,
      outputRows: 0,
      workbookMatchedRows: 0,
      workbookUnmatchedRows: 0,
      importRunId: '66666666-6666-4666-8666-666666666666',
      rocketWorkbookExportId: exportId,
      transmissionIntentKey: null,
    });
  });
});

function fileResponse(input: { exportId: string | null; intentKey: string }): Response {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['title'], ['header'], ['row']]),
    'Sheet1',
  );
  return new Response(XLSX.write(workbook, { type: 'array', bookType: 'xls' }), {
    status: 200,
    headers: {
      'Content-Disposition': "attachment; filename*=UTF-8''rocket.xls",
      'X-Order-Collection-Operation-Id': '66666666-6666-4666-8666-666666666666',
      ...(input.exportId ? { 'X-Rocket-Workbook-Export-Id': input.exportId } : {}),
      'X-Sellpia-Transmission-Intent-Key': input.intentKey,
      'X-Order-Collection-Source-Rows': '1',
      'X-Order-Collection-Product-Rows': '1',
      'X-Order-Collection-Output-Rows': '1',
      'X-Order-Collection-Skipped-Rows': '0',
      'X-Rocket-Workbook-Matched-Rows': '0',
      'X-Rocket-Workbook-Unmatched-Rows': '1',
    },
  });
}
