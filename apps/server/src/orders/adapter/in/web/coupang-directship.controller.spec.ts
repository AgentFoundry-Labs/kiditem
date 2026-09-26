import { describe, expect, it, vi } from 'vitest';
import { CoupangDirectshipController } from './coupang-directship.controller';

// 변환·달력 스냅샷 라우트(KID-359, KID-370): 옛 attempt 헤더 대신 성공한 directship 실행 ID를 본문으로 받는다. 원천 포트와 셀피아
// 양식 생성기(파이썬)만 가짜로 둔다 — 응답 머리·상태 규칙이 이 스펙의 대상이다.
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    transport: 'SHIPMENT',
    payloadChecksum: 'a'.repeat(64),
    effectOperationId: OPERATION_ID,
    exportId: '55555555-5555-4555-8555-555555555555',
    transmissionIntentKey: `rocket-final-order:${OPERATION_ID}:shipment`,
    matchedLineCount: 1,
    reconciledRows: 1,
    collectedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }, { poNumber: 'PO-1', productNo: 'P-2' }],
    matchedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
    unmatchedLines: [{ poNumber: 'PO-1', productNo: 'P-2' }],
    duplicate: false,
    ...overrides,
  };
}

const snapshotResponse = { channelAccountId: CHANNEL_ACCOUNT_ID, operationId: OPERATION_ID, collectedAt: '2026-07-18T01:00:00.000Z', entries: [] };

function setup(options: { receipt?: Record<string, unknown>; pos?: unknown[]; generate?: ReturnType<typeof vi.fn> } = {}) {
  const workbook = { generate: options.generate ?? vi.fn().mockResolvedValue({ buffer: Buffer.from('xls'), fileName: 'orders.xls', poCount: 1, rowCount: 2 }) };
  const collection = {
    consume: vi.fn().mockResolvedValue({}),
    readProjection: vi.fn().mockResolvedValue({
      operationId: OPERATION_ID,
      request: { ...captureRequest(), pos: options.pos ?? captureRequest().pos },
      receipt: receipt(options.receipt),
    }),
    readCapture: vi.fn().mockResolvedValue({}),
    readLatestSnapshot: vi.fn().mockResolvedValue(snapshotResponse),
  };
  const controller = new CoupangDirectshipController(workbook as never, collection as never);
  const response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis() };
  return { workbook, collection, controller, response };
}

const convert = (setupResult: ReturnType<typeof setup>, body: unknown = convertBody()) =>
  setupResult.controller.convertCoupangDirectship(body, ORGANIZATION_ID, { id: USER_ID } as never, { once: vi.fn() } as never, setupResult.response as never);

describe('CoupangDirectshipController — 성공한 실행 ID로 변환, 최근 성공 캡처로 달력(KID-359, KID-370)', () => {
  it('고른 운송유형을 그 실행으로 소비하고, 모든 수집 줄로 셀피아 양식을 만들며 연결 수를 머리로 알린다', async () => {
    const s = setup();
    const file = await convert(s);
    expect(s.collection.consume).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      operationId: OPERATION_ID,
      capture: { channelAccountId: CHANNEL_ACCOUNT_ID, pos: captureRequest().pos, centers: captureRequest().centers },
      transport: 'SHIPMENT',
    });
    expect(s.collection.readProjection).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, operationId: OPERATION_ID, transport: 'SHIPMENT' });
    expect(s.workbook.generate.mock.calls[0]?.[0]).toMatchObject({ transport: 'SHIPMENT', pos: [{ seq: 'PO-1' }] });
    expect(file).toBeDefined();
    for (const [name, value] of [
      ['X-Order-Collection-Operation-Id', OPERATION_ID],
      ['X-Rocket-Workbook-Export-Id', '55555555-5555-4555-8555-555555555555'],
      ['X-Sellpia-Transmission-Intent-Key', `rocket-final-order:${OPERATION_ID}:shipment`],
      ['X-Order-Collection-Source-Rows', '1'],
      ['X-Order-Collection-Product-Rows', '2'],
      ['X-Order-Collection-Output-Rows', '2'],
      ['X-Order-Collection-Skipped-Rows', '0'],
      ['X-Rocket-Workbook-Matched-Rows', '1'],
      ['X-Rocket-Workbook-Unmatched-Rows', '1'],
    ]) expect(s.response.setHeader).toHaveBeenCalledWith(name, value);
  });

  it('모든 줄이 워크북과 맞지 않아도 양식을 만든다', async () => {
    const s = setup({ receipt: { exportId: null, matchedLines: [], unmatchedLines: receipt().collectedLines, matchedLineCount: 0, reconciledRows: 0 } });
    await expect(convert(s)).resolves.toBeDefined();
    expect(s.response.status).not.toHaveBeenCalled();
    expect(s.response.setHeader).toHaveBeenCalledWith('X-Rocket-Workbook-Unmatched-Rows', '2');
  });

  it('고른 운송유형에 수집 줄이 없을 때만 204', async () => {
    const s = setup({ pos: [], receipt: { exportId: null, transmissionIntentKey: null, collectedLines: [], matchedLines: [], unmatchedLines: [] } });
    await expect(convert(s, { ...convertBody(), pos: [] })).resolves.toBeUndefined();
    expect(s.response.status).toHaveBeenCalledWith(204);
    expect(s.workbook.generate).not.toHaveBeenCalled();
  });

  it('양식 생성이 실패해도 오류만 올린다(실행·캡처는 소비 쪽 규칙 그대로)', async () => {
    const failure = new Error('server workbook failed');
    const s = setup({ generate: vi.fn().mockRejectedValue(failure) });
    await expect(convert(s)).rejects.toBe(failure);
  });

  it('실행 ID·운송유형·계정이 없는 본문은 소비 전에 VALIDATION_FAILED', async () => {
    const s = setup();
    const { operationId: _operationId, ...withoutOperation } = convertBody();
    await expect(convert(s, withoutOperation)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(convert(s, { ...convertBody(), transport: 'TRUCK' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(s.collection.consume).not.toHaveBeenCalled();
  });

  it('달력 스냅샷은 계정의 최근 성공 캡처를 읽기만 한다 — 계정 ID가 UUID가 아니면 읽기 전에 VALIDATION_FAILED', async () => {
    const s = setup();
    await expect(s.controller.readCoupangDirectSnapshot(CHANNEL_ACCOUNT_ID, ORGANIZATION_ID)).resolves.toEqual(snapshotResponse);
    expect(s.collection.readLatestSnapshot).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, channelAccountId: CHANNEL_ACCOUNT_ID });
    await expect(s.controller.readCoupangDirectSnapshot(undefined as never, ORGANIZATION_ID)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(s.controller.readCoupangDirectSnapshot('not-an-id', ORGANIZATION_ID)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(s.collection.readLatestSnapshot).toHaveBeenCalledTimes(1);
  });

  it('스냅샷을 쓰는 라우트는 없다', () => {
    expect('saveCoupangDirectSnapshot' in CoupangDirectshipController.prototype).toBe(false);
  });
});

function captureRequest() {
  return {
    channelAccountId: CHANNEL_ACCOUNT_ID,
    transport: 'SHIPMENT' as const,
    centers: { Center: { addr: 'Seoul' } },
    pos: [{
      seq: 'PO-1',
      status: 'PA' as const,
      center: 'Center',
      transport: 'SHIPMENT' as const,
      edd: '2026-07-20',
      reg: '2026-07-18 09:00:00',
      items: [
        { skuId: 'P-1', barcode: '8801234567890', name: 'Rocket item 1', qty: 2, amount: 2000 },
        { skuId: 'P-2', barcode: '8801234567891', name: 'Rocket item 2', qty: 1, amount: 1000 },
      ],
    }],
  };
}

function convertBody() {
  const { centers, pos } = captureRequest();
  return { operationId: OPERATION_ID, channelAccountId: CHANNEL_ACCOUNT_ID, transport: 'SHIPMENT', pos, centers };
}
