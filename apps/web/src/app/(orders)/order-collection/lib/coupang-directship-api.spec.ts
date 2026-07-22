import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
const api = vi.hoisted(() => ({ fetchRaw: vi.fn() }));

vi.mock('@/lib/extension-bridge', () => bridge);
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

import {
  collectCoupangDirectFromExtension,
  convertCoupangDirectToSellpiaFile,
} from './coupang-directship-api';

const RUN_ID = '33333333-3333-4333-8333-333333333333';

describe('Coupang direct-shipment collection lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the extension session open for backend file generation', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      pos: [],
      centers: {},
    });

    await collectCoupangDirectFromExtension({
      runId: RUN_ID,
      extensionId: 'order-extension',
    });

    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({
        action: 'collectCoupangDirectOrders',
        runId: RUN_ID,
        deferTerminal: true,
      }),
      240000,
    );
  });

  it('passes cancellation to backend conversion', async () => {
    const abortController = new AbortController();
    api.fetchRaw.mockResolvedValue(new Response('conversion failed', { status: 400 }));

    await expect(convertCoupangDirectToSellpiaFile(
      {
        pos: [{ seq: 'PO-1', transport: 'SHIPMENT' }],
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

  it('parses the durable Rocket export and Sellpia transmission keys', async () => {
    const exportId = '55555555-5555-4555-8555-555555555555';
    const intentKey = `rocket-workbook:${exportId}:shipment`;
    api.fetchRaw.mockResolvedValue(fileResponse({ exportId, intentKey }));

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
      matchedRows: 1,
      importRunId: '66666666-6666-4666-8666-666666666666',
      rocketWorkbookExportId: exportId,
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
      matchedRows: 0,
      importRunId: '66666666-6666-4666-8666-666666666666',
      rocketWorkbookExportId: exportId,
      transmissionIntentKey: null,
    });
  });
});

function fileResponse(input: { exportId: string; intentKey: string }): Response {
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
      'X-Rocket-Workbook-Export-Id': input.exportId,
      'X-Sellpia-Transmission-Intent-Key': input.intentKey,
      'X-Order-Collection-Source-Rows': '1',
      'X-Order-Collection-Product-Rows': '1',
      'X-Order-Collection-Output-Rows': '1',
      'X-Order-Collection-Skipped-Rows': '0',
    },
  });
}
