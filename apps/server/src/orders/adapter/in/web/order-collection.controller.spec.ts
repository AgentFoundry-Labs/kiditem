import { describe, expect, it, vi } from 'vitest';
import { OrderCollectionController } from './order-collection.controller';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OPERATION_ID = '22222222-2222-4222-8222-222222222222';

describe('OrderCollectionController', () => {
  it('몰 변환 라우트는 본문 operationId로 그 몰의 성공한 실행만 다시 변환한다', async () => {
    const mallOrders = {
      convertOperation: vi.fn().mockResolvedValue({ operationId: OPERATION_ID, artifactId: 'artifact-1', mallKey: 'kidsnote', conversion: null }),
    };
    const controller = new OrderCollectionController({} as never, mallOrders as never);
    const response = { setHeader: vi.fn(), status: vi.fn() };

    await controller.convertKidsnote(ORGANIZATION_ID, response as never, OPERATION_ID);

    expect(mallOrders.convertOperation).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, operationId: OPERATION_ID, mallKey: 'kidsnote' });
    expect(response.status).toHaveBeenCalledWith(204);
  });

  it('옛 attempt 헤더 변환은 없다 — operationId가 없으면 아무것도 변환하지 않고 VALIDATION_FAILED(KID-380 T4)', async () => {
    const mallOrders = { convertOperation: vi.fn() };
    const controller = new OrderCollectionController({} as never, mallOrders as never);

    await expect(controller.convertKidsnote(ORGANIZATION_ID, { setHeader: vi.fn() } as never, undefined))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'operation_id_required', mallKey: 'kidsnote' } });
    await expect(controller.convertDomeggook(ORGANIZATION_ID, { setHeader: vi.fn() } as never, 'not-a-uuid'))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'invalid_operation_id' } });
    expect(mallOrders.convertOperation).not.toHaveBeenCalled();
  });

  it('returns the Icecream send-finish workbook without starting a collection', () => {
    const conversion = {
      buffer: Buffer.from('xlsx'),
      fileName: '아이스크림몰_출고완료.xlsx',
      sourceRows: 2,
      productRows: 0,
      outputRows: 1,
      skippedRows: 1,
    };
    const collection = { convertIcecreamSendFinish: vi.fn().mockReturnValue(conversion) };
    const mallOrders = { convertOperation: vi.fn() };
    const controller = new OrderCollectionController(collection as never, mallOrders as never);
    const response = { setHeader: vi.fn() };
    const body = {
      headers: ['주문번호', '배송번호'],
      rows: [['ORDER-1', 'DELIVERY-1']],
      tracking: [{ ordNo: 'ORDER-1', invNo: 'INVOICE-1', courier: '1136' }],
      fileName: '아이스크림몰_출고완료.xlsx',
    };

    const file = controller.convertIcecreamSendFinish(body, response as never);

    expect(collection.convertIcecreamSendFinish).toHaveBeenCalledWith(body);
    expect(mallOrders.convertOperation).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(file).toBeDefined();
  });
});
