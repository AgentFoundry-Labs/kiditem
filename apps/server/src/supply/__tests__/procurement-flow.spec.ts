import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ROCKET_SAVED_PO_RESPONSE_PROFILE } from '@kiditem/shared/rocket-purchase-preview';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import { ProcurementService } from '../application/service/procurement.service';
import { ProcurementController } from '../adapter/in/http/procurement.controller';
import type { ProcurementRepositoryPort } from '../application/port/out/repository/procurement.repository.port';

function makeRepository(): ProcurementRepositoryPort {
  return {
    list: vi.fn(),
    createDraft: vi.fn(),
    findScopedStatus: vi.fn(),
    updateStatusScoped: vi.fn(),
  } as unknown as ProcurementRepositoryPort;
}

function makeSubmissionTransaction() {
  return {
    deletePurchaseOrder: vi.fn(),
  };
}

const MOCK_ORDER_DRAFT = {
  id: 'po-1',
  organizationId: 'organization-1',
  supplierName: 'Test Supplier',
  supplierId: null,
  status: 'draft',
  totalAmountCny: 500,
  orderDate: new Date(),
  expectedDeliveryDate: null,
  receivedAt: null,
};

describe('ProcurementService — PO status lifecycle', () => {
  let service: ProcurementService;
  let procurement: ProcurementRepositoryPort;
  let transaction: ReturnType<typeof makeSubmissionTransaction>;

  beforeEach(() => {
    procurement = makeRepository();
    transaction = makeSubmissionTransaction();
    const Service = ProcurementService as unknown as new (
      repository: ProcurementRepositoryPort,
      submissionTransaction: typeof transaction,
    ) => ProcurementService;
    service = new Service(procurement, transaction);
  });

  it('create PO delegates draft creation to the outgoing repository port', async () => {
    const created = { ...MOCK_ORDER_DRAFT, items: [], supplier: null };
    vi.mocked(procurement.createDraft).mockResolvedValue({ ok: true, order: created });

    const result = await service.create('organization-1', {
      supplierName: 'Test Supplier',
      items: [{ productName: 'Widget', sellpiaInventorySkuId: 'sellpia-sku-1', quantity: 10, unitPriceCny: 50 }],
    });

    expect(procurement.createDraft).toHaveBeenCalledWith(
      'organization-1',
      {
        supplierName: 'Test Supplier',
        items: [{ productName: 'Widget', sellpiaInventorySkuId: 'sellpia-sku-1', quantity: 10, unitPriceCny: 50 }],
      },
    );
    expect(result).toEqual(created);
  });

  it('create PO with supplierId stays in the application command and repository boundary', async () => {
    const created = { ...MOCK_ORDER_DRAFT, supplierId: 'supplier-1', items: [], supplier: null };
    vi.mocked(procurement.createDraft).mockResolvedValue({ ok: true, order: created });

    await service.create('organization-1', {
      supplierName: 'Test Supplier',
      supplierId: 'supplier-1',
      items: [{ productName: 'Widget', sellpiaInventorySkuId: 'sellpia-sku-1', quantity: 10, unitPriceCny: 50 }],
    });

    expect(procurement.createDraft).toHaveBeenCalledWith(
      'organization-1',
      expect.objectContaining({ supplierId: 'supplier-1' }),
    );
  });

  it('maps repository supplier ownership failure to BadRequestException', async () => {
    vi.mocked(procurement.createDraft).mockResolvedValue({
      ok: false,
      reason: 'supplier_not_found',
    });

    await expect(
      service.create('organization-1', {
        supplierName: 'Other Supplier',
        supplierId: 'supplier-2',
        items: [{ productName: 'Widget', sellpiaInventorySkuId: 'sellpia-sku-1', quantity: 10, unitPriceCny: 50 }],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(procurement.createDraft).toHaveBeenCalledOnce();
  });

  it('maps repository Sellpia SKU ownership failure to the IDOR error message', async () => {
    vi.mocked(procurement.createDraft).mockResolvedValue({
      ok: false,
      reason: 'sellpia_inventory_sku_not_found',
      missingSellpiaInventorySkuIds: ['sellpia-sku-2'],
    });

    await expect(
      service.create('organization-1', {
        supplierName: 'Other Supplier',
        items: [{ productName: 'Widget', sellpiaInventorySkuId: 'sellpia-sku-2', quantity: 10, unitPriceCny: 50 }],
      }),
    ).rejects.toThrow('발주 항목의 셀피아 상품을 찾을 수 없거나 권한이 없습니다: sellpia-sku-2');

    expect(procurement.createDraft).toHaveBeenCalledOnce();
  });

  it('updateStatus draft→pending → valid transition', async () => {
    vi.mocked(procurement.findScopedStatus).mockResolvedValue({ id: 'po-1', status: 'draft' });
    vi.mocked(procurement.updateStatusScoped).mockResolvedValue({
      ...MOCK_ORDER_DRAFT,
      status: 'pending',
      items: [],
      supplier: null,
    });

    const result = await service.updateStatus('organization-1', 'po-1', 'pending');
    expect(procurement.findScopedStatus).toHaveBeenCalledWith('organization-1', 'po-1');
    expect(procurement.updateStatusScoped).toHaveBeenCalledWith(
      'organization-1',
      'po-1',
      'draft',
      { status: 'pending' },
    );
    expect((result as any).status).toBe('pending');
  });

  it('updateStatus pending→ordered → valid transition', async () => {
    vi.mocked(procurement.findScopedStatus).mockResolvedValue({ id: 'po-1', status: 'pending' });
    vi.mocked(procurement.updateStatusScoped).mockResolvedValue({
      ...MOCK_ORDER_DRAFT,
      status: 'ordered',
      items: [],
      supplier: null,
    });

    await expect(
      service.updateStatus('organization-1', 'po-1', 'ordered'),
    ).rejects.toThrow('submit');
    expect(procurement.updateStatusScoped).not.toHaveBeenCalled();
  });

  it('updateStatus ordered→shipped → valid transition', async () => {
    vi.mocked(procurement.findScopedStatus).mockResolvedValue({ id: 'po-1', status: 'ordered' });
    vi.mocked(procurement.updateStatusScoped).mockResolvedValue({
      ...MOCK_ORDER_DRAFT,
      status: 'shipped',
      items: [],
      supplier: null,
    });

    await service.updateStatus('organization-1', 'po-1', 'shipped');
    expect(procurement.updateStatusScoped).toHaveBeenCalledWith(
      'organization-1',
      'po-1',
      'ordered',
      { status: 'shipped' },
    );
  });

  it('updateStatus shipped→received → valid transition, sets receivedAt', async () => {
    vi.mocked(procurement.findScopedStatus).mockResolvedValue({ id: 'po-1', status: 'shipped' });
    vi.mocked(procurement.updateStatusScoped).mockResolvedValue({
      ...MOCK_ORDER_DRAFT,
      status: 'received',
      items: [],
      supplier: null,
    });

    await service.updateStatus('organization-1', 'po-1', 'received');
    expect(procurement.updateStatusScoped).toHaveBeenCalledWith(
      'organization-1',
      'po-1',
      'shipped',
      { status: 'received', receivedAt: expect.any(Date) },
    );
  });

  it('invalid transition draft→received → throws BadRequestException', async () => {
    vi.mocked(procurement.findScopedStatus).mockResolvedValue({ id: 'po-1', status: 'draft' });

    await expect(service.updateStatus('organization-1', 'po-1', 'received')).rejects.toThrow(BadRequestException);
    expect(procurement.updateStatusScoped).not.toHaveBeenCalled();
  });

  it('updateStatus wrong organization → not found, no mutation', async () => {
    vi.mocked(procurement.findScopedStatus).mockResolvedValue(null);

    await expect(service.updateStatus('organization-1', 'po-1', 'pending')).rejects.toThrow(BadRequestException);

    expect(procurement.updateStatusScoped).not.toHaveBeenCalled();
  });

  it('delete draft PO → ok', async () => {
    transaction.deletePurchaseOrder.mockResolvedValue({
      kind: 'deleted',
      order: { id: 'po-1', status: 'draft' },
    });

    const result = await service.delete('organization-1', 'po-1');
    expect(transaction.deletePurchaseOrder).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      purchaseOrderId: 'po-1',
    });
    expect(result).toEqual({ id: 'po-1', status: 'draft' });
  });

  it('delete non-draft PO → throws BadRequestException', async () => {
    transaction.deletePurchaseOrder.mockResolvedValue({ kind: 'not_deletable' });

    await expect(service.delete('organization-1', 'po-1')).rejects.toThrow(BadRequestException);
  });

  it('delete wrong organization → not found, no mutation', async () => {
    transaction.deletePurchaseOrder.mockResolvedValue({ kind: 'not_found' });

    await expect(service.delete('organization-1', 'po-1')).rejects.toThrow(BadRequestException);
  });

  it('delete pending PO with unresolved provider intent → rejects without deletion', async () => {
    transaction.deletePurchaseOrder.mockResolvedValue({ kind: 'unresolved_attempt' });

    await expect(service.delete('organization-1', 'po-1'))
      .rejects.toThrow('외부 주문 시도');
  });
});

describe('ProcurementController purchase submission boundary', () => {
  it('routes saved Rocket PO list and collection reads through the account-scoped catalog port', async () => {
    const snapshot = { rows: [] };
    const catalog = {
      listSavedPos: vi.fn().mockResolvedValue([]),
      loadSavedCollection: vi.fn().mockResolvedValue(snapshot),
    };
    const Controller = ProcurementController as unknown as new (
      procurement: Record<string, unknown>,
      submissions: Record<string, unknown>,
      previews: Record<string, unknown>,
      workbookExports: Record<string, unknown>,
      catalog: typeof catalog,
    ) => ProcurementController;
    // Supply 가 자기 소유 제출 증거를 붙여 완성한다(Channels 는 스냅샷만 소유).
    const workbookExports = { listExportedPoLineIds: vi.fn().mockResolvedValue([]) };
    const controller = new Controller({}, {}, {}, workbookExports, catalog);
    const channelAccountId = '11111111-1111-4111-8111-111111111111';
    const sourceImportRunId = '22222222-2222-4222-8222-222222222222';

    await controller.handleAction(
      'organization-1',
      { id: 'authenticated-user' } as never,
      {
        action: 'listSavedRocketPos',
        channelAccountId,
        from: '2026-07-01',
        to: '2026-07-31',
        rocketStatus: '거래처확인요청',
      } as never,
      undefined,
      undefined,
      ROCKET_SAVED_PO_RESPONSE_PROFILE,
    );
    await controller.handleAction(
      'organization-1',
      { id: 'authenticated-user' } as never,
      {
        action: 'loadSavedRocketCollection',
        channelAccountId,
        sourceImportRunId,
      } as never,
      undefined,
      undefined,
      ROCKET_SAVED_PO_RESPONSE_PROFILE,
    );

    expect(catalog.listSavedPos).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      channelAccountId,
      from: '2026-07-01',
      to: '2026-07-31',
      status: '거래처확인요청',
    });
    expect(catalog.loadSavedCollection).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      channelAccountId,
      sourceImportRunId,
    });
    expect(workbookExports.listExportedPoLineIds).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      channelAccountId,
      poLineIds: [],
    });

    await expect(controller.handleAction(
      'organization-1',
      { id: 'authenticated-user' } as never,
      {
        action: 'loadSavedRocketCollection',
        channelAccountId,
        sourceImportRunId,
      } as never,
    )).resolves.toBe(snapshot);
    expect(workbookExports.listExportedPoLineIds).toHaveBeenCalledTimes(1);
  });

  it('routes Rocket workbook export and evidence-gated abandonment through the Supply action endpoint', async () => {
    const workbookExports = {
      exportWorkbook: vi.fn().mockResolvedValue({ duplicate: false }),
      abandonWorkbook: vi.fn().mockResolvedValue({ duplicate: false }),
    };
    const Controller = ProcurementController as unknown as new (
      procurement: Record<string, unknown>,
      submissions: Record<string, unknown>,
      previews: Record<string, unknown>,
      workbookExports: typeof workbookExports,
    ) => ProcurementController;
    const controller = new Controller({}, {}, {}, workbookExports);
    const request = {
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      channelAccountId: '22222222-2222-4222-8222-222222222222',
      sourceImportRunId: '33333333-3333-4333-8333-333333333333',
      editedQuantities: {},
      shortageReasons: {},
      artifactFileName: 'coupang-rocket.xlsx',
      artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    const workbook = {
      originalname: 'coupang-rocket.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('workbook'),
    };

    await controller.handleAction(
      'organization-1',
      { id: 'authenticated-user' } as never,
      { action: 'exportRocketWorkbook', requestJson: JSON.stringify(request) } as never,
      workbook as never,
    );
    await controller.handleAction(
      'organization-1',
      { id: 'authenticated-user' } as never,
      {
        action: 'abandonRocketWorkbook',
        exportId: '44444444-4444-4444-8444-444444444444',
      } as never,
    );

    expect(workbookExports.exportWorkbook).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      userId: 'authenticated-user',
      request,
      artifactBytes: workbook.buffer,
    });
    expect(workbookExports.abandonWorkbook).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      userId: 'authenticated-user',
      request: {
        exportId: '44444444-4444-4444-8444-444444444444',
      },
    });
  });

  it('routes transient Rocket workbook conversion to the owner without durable export', async () => {
    const bytes = Buffer.from('transient-workbook');
    const workbookExports = {
      convertWorkbook: vi.fn().mockResolvedValue({
        bytes,
        fileName: '쿠팡_로켓_20260717.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        summary: {
          totalRows: 2,
          workbookQuantity: 5,
          fullyConfirmedRows: 1,
          shortRows: 1,
        },
      }),
      exportWorkbook: vi.fn(),
    };
    const Controller = ProcurementController as unknown as new (
      procurement: Record<string, unknown>,
      submissions: Record<string, unknown>,
      previews: Record<string, unknown>,
      workbookExports: typeof workbookExports,
    ) => ProcurementController;
    const controller = new Controller({}, {}, {}, workbookExports);
    const response = { setHeader: vi.fn() };
    const request = {
      sourceRows: [],
      workbookRows: [],
    };

    const result = await controller.handleAction(
      'organization-1',
      { id: 'authenticated-user' } as never,
      {
        action: 'convertRocketConfirmationWorkbook',
        requestJson: JSON.stringify(request),
      } as never,
      undefined,
      response as never,
    );

    expect(workbookExports.convertWorkbook).toHaveBeenCalledWith({
      request,
    });
    expect(workbookExports.exportWorkbook).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "attachment; filename*=UTF-8''%EC%BF%A0%ED%8C%A1_%EB%A1%9C%EC%BC%93_20260717.xlsx",
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-Rocket-Workbook-Quantity', '5');
    expect((result as import('@nestjs/common').StreamableFile).getStream().read()).toEqual(bytes);

    const template = {
      originalname: '쿠팡_원본.xlsx',
      buffer: Buffer.from('template'),
    };
    await controller.handleAction(
      'organization-1',
      { id: 'authenticated-user' } as never,
      {
        action: 'convertRocketConfirmationWorkbook',
        requestJson: JSON.stringify(request),
      } as never,
      template as never,
    );
    expect(workbookExports.convertWorkbook).toHaveBeenNthCalledWith(2, {
      request,
      templateBytes: template.buffer,
      templateFileName: template.originalname,
    });
  });

  it('allows bounded Rocket workbook metadata above the multipart 1 MiB default', () => {
    const source = readFileSync(
      __filename.replace(/__tests__\/[^/]+$/, 'adapter/in/http/procurement.controller.ts'),
      'utf8',
    );

    expect(source).toContain(`limits: {
      fileSize: MAX_ROCKET_WORKBOOK_SIZE,
      fieldSize: MAX_ROCKET_WORKBOOK_REQUEST_SIZE,
    }`);
    expect(source).toContain(
      'const MAX_ROCKET_WORKBOOK_REQUEST_SIZE = 25 * 1024 * 1024;',
    );
  });

  it('routes previewRocket through the existing action-body endpoint with server actor scope', async () => {
    const previews = { preview: vi.fn().mockResolvedValue({ rows: [] }) };
    const Controller = ProcurementController as unknown as new (
      procurement: Record<string, unknown>,
      submissions: Record<string, unknown>,
      previews: typeof previews,
    ) => ProcurementController;
    const controller = new Controller({}, {}, previews);
    const body = {
      action: 'previewRocket',
      inventoryAttemptId: '99999999-9999-4999-8999-999999999999',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      sourceImportRunId: '33333333-3333-4333-8333-333333333333',
      editedQuantities: {},
      clampEditedQuantities: true,
    };

    await controller.handleAction(
      'organization-1',
      { id: 'authenticated-user' } as never,
      body as never,
    );

    expect(previews.preview).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      userId: 'authenticated-user',
      request: {
        channelAccountId: body.channelAccountId,
        sourceImportRunId: body.sourceImportRunId,
        inventoryAttemptId: body.inventoryAttemptId,
        editedQuantities: body.editedQuantities,
        clampEditedQuantities: true,
      },
    });
  });

  it('carries the completed inventory attempt for Rocket export preflight', async () => {
    const previews = { preview: vi.fn().mockResolvedValue({ rows: [] }) };
    const Controller = ProcurementController as unknown as new (
      procurement: Record<string, unknown>,
      submissions: Record<string, unknown>,
      previews: typeof previews,
    ) => ProcurementController;
    const controller = new Controller({}, {}, previews);
    const body = {
      action: 'previewRocket',
      inventoryAttemptId: '99999999-9999-4999-8999-999999999999',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      sourceImportRunId: '33333333-3333-4333-8333-333333333333',
      editedQuantities: {},
      clampEditedQuantities: true,
    };

    await controller.handleAction(
      'organization-1',
      { id: 'authenticated-user' } as never,
      body as never,
    );

    expect(previews.preview).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ inventoryAttemptId: body.inventoryAttemptId }),
    }));
  });

  it('passes the caller key, canonical business-input hash, and authenticated actor to the common submission port', async () => {
    const procurement = {
      findAll: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      delete: vi.fn(),
    };
    const submissions = {
      submit: vi.fn().mockResolvedValue({ orderId: 'po-1', status: 'ordered' }),
      reconcile: vi.fn(),
    };
    const Controller = ProcurementController as unknown as new (
      procurement: typeof procurement,
      submissions: typeof submissions,
    ) => ProcurementController;
    const controller = new Controller(procurement, submissions);

    await controller.handleAction(
      'organization-1',
      { id: '00000000-0000-4000-8000-000000000001' } as never,
      {
        action: 'submit',
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        inventoryAttemptId: '0187e942-9098-7382-9a22-c5b821f2f5d2',
        idempotencyKey: 'stable-submit-key',
      } as never,
    );

    expect(submissions.submit).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
      inventoryAttemptId: '0187e942-9098-7382-9a22-c5b821f2f5d2',
      idempotencyKey: 'stable-submit-key',
      requestHash: canonicalOwnerInputHash({
        purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        inventoryAttemptId: '0187e942-9098-7382-9a22-c5b821f2f5d2',
      }),
      userId: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('ignores a client actor override when reconciling and records CurrentUser', async () => {
    const submissions = { submit: vi.fn(), reconcile: vi.fn() };
    const Controller = ProcurementController as unknown as new (
      procurement: Record<string, unknown>,
      submissions: typeof submissions,
    ) => ProcurementController;
    const controller = new Controller({}, submissions);

    await controller.handleAction(
      'organization-1',
      { id: 'authenticated-user' } as never,
      {
        action: 'reconcileSubmission',
        id: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        outcome: 'provider_succeeded',
        providerReference: '1688-1',
        userId: 'client-forged-user',
      } as never,
    );

    expect(submissions.reconcile).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
      userId: 'authenticated-user',
      outcome: 'provider_succeeded',
      providerReference: '1688-1',
    });
  });
});
