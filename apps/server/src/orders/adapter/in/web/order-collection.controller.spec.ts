import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrderCollectionSourceStatusSchema } from '@kiditem/shared/order-collection-source';
import { OrderCollectionController } from './order-collection.controller';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';
const ATTEMPT_TOKEN = '55555555-5555-4555-8555-555555555555';
const CHANNEL_ACCOUNT_ID = '66666666-6666-4666-8666-666666666666';

describe('OrderCollectionController Coupang direct convert', () => {
  it('converts Art09 on the server while retaining only the submitted source', async () => {
    const conversion = {
      buffer: Buffer.from('\uFEFFart09-csv'),
      fileName: 'zzogzzog1_20260727_주문수집.csv',
      sourceRows: 2,
      // 셀피아 양식은 주문 한 건에 주문 줄 하나와 상품 줄 여럿을 쓴다: 출력 5 · 상품 3 = 주문 2.
      productRows: 3,
      outputRows: 5,
      skippedRows: 0,
    };
    const collection = { convertArt09Orders: vi.fn().mockReturnValue(conversion) };
    const source = {
      validateCompletion: vi.fn().mockResolvedValue(undefined),
      completeAttempt: vi.fn().mockResolvedValue({ artifactId: 'art09-artifact' }),
      recordCollectedRows: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new OrderCollectionController(
      collection as never,
      {} as never,
      {} as never,
      {} as never,
      source as never,
    );
    const response = { setHeader: vi.fn() };
    const body = { rows: [{ orderId: '20260727-1234567', productName: '상품', qty: 1 }] };

    const file = await controller.convertArt09(
      body,
      ORGANIZATION_ID,
      ATTEMPT_ID,
      ATTEMPT_TOKEN,
      response as never,
    );

    expect(collection.convertArt09Orders).toHaveBeenCalledWith(body);
    expect(source.completeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      mallKey: 'art09',
      source: expect.objectContaining({
        bytes: Buffer.from('{"rows":[{"orderId":"20260727-1234567","productName":"상품","qty":1}]}'),
      }),
    }));
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv;charset=utf-8');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Artifact-Id', 'art09-artifact');
    // 이 수집이 몇 건을 실어 왔는지는 변환할 때야 안다. 적지 않으면 성공한 수집도 건수 0 으로
    // 남아 대시보드의 '오늘 주문' 이 그만큼 모자라게 센다(사장님 2026-09-21).
    //
    // 적는 것은 **주문 건수**이지 출력 줄 수가 아니다. 출력 줄을 적으면 상품 줄만큼 부풀어
    // 주문수집 화면과 어긋난다 — 63 대 82(사장님 2026-09-22).
    expect(source.recordCollectedRows).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      rowCount: 2,
    });
    expect(file).toBeDefined();
  });

  it('신규 주문 없는 날을 고장난 몰로 적지 않는다', async () => {
    // 변환기는 이미 `NO_NEW_ORDERS` 를 던진다. 예전에는 그걸 `CONVERSION_FAILED` 로 덮어
    // 멀쩡한 날의 꼬망세가 실패한 몰로 기록됐다(사장님 2026-09-21).
    const collection = {
      convertKkomangseOrders: vi.fn().mockImplementation(() => {
        throw new BadRequestException({
          code: 'NO_NEW_ORDERS',
          message: '2026-09-21 꼬망세 신규 주문이 없습니다.',
        });
      }),
    };
    const source = {
      validateCompletion: vi.fn().mockResolvedValue(undefined),
      failAttempt: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new OrderCollectionController(
      collection as never,
      {} as never,
      {} as never,
      {} as never,
      source as never,
    );

    await expect(controller.convertKkomangse(
      { rows: [] } as never,
      ORGANIZATION_ID,
      ATTEMPT_ID,
      ATTEMPT_TOKEN,
      { setHeader: vi.fn() } as never,
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(source.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      code: 'NO_NEW_ORDERS',
      message: '2026-09-21 꼬망세 신규 주문이 없습니다.',
    }));
  });

  it('rejects unfenced mall conversion instead of leaving a standalone export path', async () => {
    const collection = { convertKidsnoteOrders: vi.fn() };
    const source = { validateCompletion: vi.fn(), failAttempt: vi.fn() };
    const controller = new OrderCollectionController(
      collection as never,
      {} as never,
      {} as never,
      {} as never,
      source as never,
    );

    await expect(controller.convertKidsnote(
      { orders: [{ ono: 'ORDER-1' }] },
      ORGANIZATION_ID,
      undefined,
      undefined,
      { setHeader: vi.fn() } as never,
    )).rejects.toThrow('ORDER_COLLECTION_ATTEMPT_HEADERS_REQUIRED');
    expect(collection.convertKidsnoteOrders).not.toHaveBeenCalled();
    expect(source.failAttempt).not.toHaveBeenCalled();
  });

  it('returns the Icecream send-finish workbook without starting an owner lifecycle', () => {
    const conversion = {
      buffer: Buffer.from('xlsx'),
      fileName: '아이스크림몰_출고완료.xlsx',
      sourceRows: 2,
      productRows: 0,
      outputRows: 1,
      skippedRows: 1,
    };
    const collection = { convertIcecreamSendFinish: vi.fn().mockReturnValue(conversion) };
    const source = {
      completeAttempt: vi.fn(),
      failAttempt: vi.fn(),
      recordCollectedRows: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new OrderCollectionController(
      collection as never,
      {} as never,
      {} as never,
      {} as never,
      source as never,
    );
    const response = { setHeader: vi.fn() };
    const body = {
      headers: ['주문번호', '배송번호'],
      rows: [['ORDER-1', 'DELIVERY-1']],
      tracking: [{ ordNo: 'ORDER-1', invNo: 'INVOICE-1', courier: '1136' }],
      fileName: '아이스크림몰_출고완료.xlsx',
    };

    const file = controller.convertIcecreamSendFinish(body, response as never);

    expect(collection.convertIcecreamSendFinish).toHaveBeenCalledWith(body);
    expect(source.completeAttempt).not.toHaveBeenCalled();
    expect(source.failAttempt).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(file).toBeDefined();
  });

  it('records converter failures through the owner before rethrowing them', async () => {
    const conversionError = new Error('malformed source');
    const collection = {
      convertKidsnoteOrders: vi.fn().mockImplementation(() => {
        throw conversionError;
      }),
    };
    const source = {
      validateCompletion: vi.fn().mockResolvedValue(undefined),
      failAttempt: vi.fn().mockResolvedValue({ state: 'FAILED' }),
    };
    const controller = new OrderCollectionController(
      collection as never,
      {} as never,
      {} as never,
      {} as never,
      source as never,
    );

    await expect(controller.convertKidsnote(
      { orders: [{ ono: 'ORDER-1' }] },
      ORGANIZATION_ID,
      ATTEMPT_ID,
      ATTEMPT_TOKEN,
      { setHeader: vi.fn() } as never,
    )).rejects.toBe(conversionError);
    expect(source.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      code: 'CONVERSION_FAILED',
      message: 'malformed source',
      source: expect.objectContaining({ contentType: 'application/json' }),
    }));
  });

  it('generates a Sellpia workbook from every collected line and reports linkage separately', async () => {
    const workbook = {
      generate: vi.fn().mockResolvedValue({
        buffer: Buffer.from('xls'),
        fileName: 'orders.xls',
        poCount: 1,
        rowCount: 2,
      }),
    };
    const collection = {
      consumeAttempt: vi.fn().mockResolvedValue({}),
      readProjection: vi.fn().mockResolvedValue({
        importRunId: '11111111-1111-4111-8111-111111111111',
        request: request(),
        receipt: {
          transport: 'SHIPMENT',
          payloadChecksum: 'a'.repeat(64),
          sourceImportRunId: '11111111-1111-4111-8111-111111111111',
          exportId: '55555555-5555-4555-8555-555555555555',
          transmissionIntentKey: 'rocket-final-order:11111111-1111-4111-8111-111111111111:shipment',
          matchedLineCount: 1,
          reconciledRows: 1,
          collectedLines: [
            { poNumber: 'PO-1', productNo: 'P-1' },
            { poNumber: 'PO-1', productNo: 'P-2' },
          ],
          matchedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
          unmatchedLines: [{ poNumber: 'PO-1', productNo: 'P-2' }],
          duplicate: false,
        },
      }),
    };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
      collection as never,
      {} as never,
      {} as never,
    );
    const response = { setHeader: vi.fn(), status: vi.fn() };

    const file = await controller.convertCoupangDirectship(
      request() as never,
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      ATTEMPT_ID,
      ATTEMPT_TOKEN,
      { once: vi.fn() } as never,
      response as never,
    );

    expect(collection.consumeAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      capture: request(),
      transport: 'SHIPMENT',
    });
    expect(workbook.generate).toHaveBeenCalledOnce();
    expect(workbook.generate.mock.calls[0]?.[0]).toMatchObject({
      transport: 'SHIPMENT',
      pos: [{
        seq: 'PO-1',
        items: [
          expect.objectContaining({ skuId: 'P-1' }),
          expect.objectContaining({ skuId: 'P-2' }),
        ],
      }],
    });
    expect(file).toBeDefined();
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Order-Collection-Import-Run-Id',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Rocket-Workbook-Export-Id',
      '55555555-5555-4555-8555-555555555555',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Sellpia-Transmission-Intent-Key',
      'rocket-final-order:11111111-1111-4111-8111-111111111111:shipment',
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Source-Rows', '1');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Product-Rows', '2');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Output-Rows', '2');
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Skipped-Rows', '0');
    expect(response.setHeader).toHaveBeenCalledWith('X-Rocket-Workbook-Matched-Rows', '1');
    expect(response.setHeader).toHaveBeenCalledWith('X-Rocket-Workbook-Unmatched-Rows', '1');
  });

  it('generates a Sellpia workbook when every collected line is unmatched', async () => {
    const workbook = {
      generate: vi.fn().mockResolvedValue({
        buffer: Buffer.from('xls'),
        fileName: 'orders.xls',
        poCount: 1,
        rowCount: 2,
      }),
    };
    const collection = {
      consumeAttempt: vi.fn().mockResolvedValue({}),
      readProjection: vi.fn().mockResolvedValue({
        importRunId: '11111111-1111-4111-8111-111111111111',
        request: request(),
        receipt: {
          transport: 'SHIPMENT',
          payloadChecksum: 'a'.repeat(64),
          sourceImportRunId: '11111111-1111-4111-8111-111111111111',
          exportId: null,
          transmissionIntentKey: 'rocket-final-order:11111111-1111-4111-8111-111111111111:shipment',
          matchedLineCount: 0,
          reconciledRows: 0,
          collectedLines: [
            { poNumber: 'PO-1', productNo: 'P-1' },
            { poNumber: 'PO-1', productNo: 'P-2' },
          ],
          matchedLines: [],
          unmatchedLines: [
            { poNumber: 'PO-1', productNo: 'P-1' },
            { poNumber: 'PO-1', productNo: 'P-2' },
          ],
          duplicate: false,
        },
      }),
    };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
      collection as never,
      {} as never,
      {} as never,
    );
    const response = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    const result = await controller.convertCoupangDirectship(
      request() as never,
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      ATTEMPT_ID,
      ATTEMPT_TOKEN,
      { once: vi.fn() } as never,
      response as never,
    );

    expect(result).toBeDefined();
    expect(response.status).not.toHaveBeenCalled();
    expect(workbook.generate).toHaveBeenCalledWith(
      request(),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-Order-Collection-Skipped-Rows', '0');
    expect(response.setHeader).toHaveBeenCalledWith('X-Rocket-Workbook-Unmatched-Rows', '2');
  });

  it('returns 204 only when the selected transport has no collected row', async () => {
    const workbook = { generate: vi.fn() };
    const collection = {
      consumeAttempt: vi.fn().mockResolvedValue({}),
      readProjection: vi.fn().mockResolvedValue({
        importRunId: '11111111-1111-4111-8111-111111111111',
        request: { ...request(), pos: [] },
        receipt: {
          transport: 'SHIPMENT',
          payloadChecksum: 'a'.repeat(64),
          sourceImportRunId: '11111111-1111-4111-8111-111111111111',
          exportId: null,
          transmissionIntentKey: null,
          matchedLineCount: 0,
          reconciledRows: 0,
          collectedLines: [],
          matchedLines: [],
          unmatchedLines: [],
          duplicate: false,
        },
      }),
    };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
      collection as never,
      {} as never,
      {} as never,
    );
    const response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis() };
    const emptyRequest = { ...request(), pos: [] };

    const result = await controller.convertCoupangDirectship(
      emptyRequest as never,
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      ATTEMPT_ID,
      ATTEMPT_TOKEN,
      { once: vi.fn() } as never,
      response as never,
    );

    expect(result).toBeUndefined();
    expect(response.status).toHaveBeenCalledWith(204);
    expect(workbook.generate).not.toHaveBeenCalled();
  });

  it('leaves the COMPLETE owner intact when one server transport conversion fails', async () => {
    const conversionError = new Error('server workbook failed');
    const workbook = {
      generate: vi.fn().mockRejectedValue(conversionError),
    };
    const collection = {
      consumeAttempt: vi.fn().mockResolvedValue({ state: 'COMPLETE' }),
      readProjection: vi.fn().mockResolvedValue({
        importRunId: ATTEMPT_ID,
        request: request(),
        receipt: {
          transport: 'SHIPMENT',
          payloadChecksum: 'a'.repeat(64),
          sourceImportRunId: ATTEMPT_ID,
          exportId: null,
          transmissionIntentKey: 'rocket-final-order:owner:shipment',
          matchedLineCount: 0,
          reconciledRows: 0,
          collectedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
          matchedLines: [],
          unmatchedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
          duplicate: false,
        },
      }),
      failAttempt: vi.fn(),
    };
    const controller = new OrderCollectionController(
      {} as never,
      workbook as never,
      collection as never,
      {} as never,
      {} as never,
    );

    await expect(controller.convertCoupangDirectship(
      request() as never,
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      ATTEMPT_ID,
      ATTEMPT_TOKEN,
      { once: vi.fn() } as never,
      { setHeader: vi.fn() } as never,
    )).rejects.toBe(conversionError);
    expect(collection.failAttempt).not.toHaveBeenCalled();
  });

  it('stops a running directship attempt with organization scope only, never the attempt token', async () => {
    const stopped = {
      attemptId: ATTEMPT_ID,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
    };
    const owner = { cancelAttempt: vi.fn().mockResolvedValue(stopped) };
    const controller = new OrderCollectionController(
      {} as never,
      {} as never,
      owner as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.cancelCoupangDirectAttempt(ATTEMPT_ID, ORGANIZATION_ID),
    ).resolves.toEqual(stopped);
    expect(owner.cancelAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
    });
  });

  it('reads one directship source by channel account and answers the shared status shape without a token', async () => {
    const status = {
      mallKey: null,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      running: {
        attemptId: ATTEMPT_ID,
        collectionMode: 'browser',
        startedAt: '2026-09-15T00:00:00.000Z',
        expiresAt: '2026-09-15T00:30:00.000Z',
      },
      lastComplete: null,
      lastAttempt: {
        attemptId: ATTEMPT_ID,
        state: 'RUNNING',
        errorCode: null,
        errorMessage: null,
        endedAt: null,
      },
    };
    const owner = { readSourceStatus: vi.fn().mockResolvedValue(status) };
    const controller = new OrderCollectionController(
      {} as never,
      {} as never,
      owner as never,
      {} as never,
      {} as never,
    );

    const view = await controller.readCoupangDirectSourceStatus(CHANNEL_ACCOUNT_ID, ORGANIZATION_ID);

    expect(owner.readSourceStatus).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
    });
    // strict 스키마라 attemptToken 같은 여분 키가 있으면 여기서 깨진다.
    expect(OrderCollectionSourceStatusSchema.parse(view)).toEqual(status);
  });

  it('refuses a directship source read with no channel account', async () => {
    const owner = { readSourceStatus: vi.fn() };
    const controller = new OrderCollectionController(
      {} as never,
      {} as never,
      owner as never,
      {} as never,
      {} as never,
    );

    await expect(controller.readCoupangDirectSourceStatus(undefined, ORGANIZATION_ID))
      .rejects.toThrow('INVALID_COUPANG_DIRECT_SCOPE');
    await expect(controller.readCoupangDirectSourceStatus('not-a-uuid', ORGANIZATION_ID))
      .rejects.toThrow('INVALID_COUPANG_DIRECT_SCOPE');
    expect(owner.readSourceStatus).not.toHaveBeenCalled();
  });

});

function request() {
  return {
    channelAccountId: '44444444-4444-4444-8444-444444444444',
    transport: 'SHIPMENT',
    centers: { Center: { addr: 'Seoul' } },
    pos: [{
      seq: 'PO-1',
      status: 'PA',
      center: 'Center',
      transport: 'SHIPMENT',
      edd: '2026-07-20',
      reg: '2026-07-18 09:00:00',
      items: [{
        skuId: 'P-1',
        barcode: '8801234567890',
        name: 'Rocket item 1',
        qty: 2,
        amount: 2000,
      }, {
        skuId: 'P-2',
        barcode: '8801234567891',
        name: 'Rocket item 2',
        qty: 1,
        amount: 1000,
      }],
    }],
  };
}
