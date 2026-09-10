import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
const api = vi.hoisted(() => ({ fetchRaw: vi.fn(), getParsed: vi.fn() }));

vi.mock('@/lib/extension-bridge', () => bridge);
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

import {
  collectCoupangDirectFromExtension,
  convertCoupangDirectToSellpiaFile,
} from './coupang-directship-api';

const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_TOKEN = '44444444-4444-4444-8444-444444444444';

describe('Coupang direct-shipment collection lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the server-issued Directship attempt without the retired generic defer flag', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: true,
    });
    api.getParsed.mockResolvedValue({
      attempt: { state: 'COMPLETE' },
      capture: { channelAccountId: '11111111-1111-4111-8111-111111111111', pos: [], centers: {} },
    });

    await expect(collectCoupangDirectFromExtension({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      extensionId: 'order-extension',
    })).resolves.toEqual({ pos: [], centers: {} });

    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({
        action: 'collectCoupangDirectOrders',
        attemptId: ATTEMPT_ID,
        date: null,
      }),
      240000,
    );
    expect(api.getParsed).toHaveBeenCalledWith(
      `/api/orders/collection/coupang-directship/attempts/${ATTEMPT_ID}/capture`,
      expect.anything(),
    );
  });

  it('reads a completed owner capture without requiring the extension again', async () => {
    api.getParsed.mockResolvedValue({
      attempt: { state: 'COMPLETE' },
      capture: {
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        pos: [],
        centers: {},
      },
    });

    await expect(collectCoupangDirectFromExtension({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      sourceOwner: 'coupang_directship',
    })).resolves.toEqual({ pos: [], centers: {} });

    expect(bridge.detectOrderCollectionExtensionId).not.toHaveBeenCalled();
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
    expect(api.getParsed).toHaveBeenCalledWith(
      `/api/orders/collection/coupang-directship/attempts/${ATTEMPT_ID}/capture`,
      expect.anything(),
    );
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
      },
    )).rejects.toThrow('conversion failed');

    expect(api.fetchRaw).toHaveBeenCalledWith(
      '/api/orders/collection/coupang-directship/convert',
      expect.objectContaining({ signal: abortController.signal }),
    );
    expect(JSON.parse(api.fetchRaw.mock.calls[0]?.[1]?.body as string))
      .toMatchObject({
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
        'X-Order-Collection-Import-Run-Id': '66666666-6666-4666-8666-666666666666',
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
      'X-Order-Collection-Import-Run-Id': '66666666-6666-4666-8666-666666666666',
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
