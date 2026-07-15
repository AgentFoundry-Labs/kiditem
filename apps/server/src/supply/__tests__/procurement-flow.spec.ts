import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcurementService } from '../application/service/procurement.service';
import { BadRequestException } from '@nestjs/common';
import type { ProcurementRepositoryPort } from '../application/port/out/repository/procurement.repository.port';
import { ProcurementController } from '../adapter/in/http/procurement.controller';

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
      items: [{ productName: 'Widget', quantity: 10, unitPriceCny: 50 }],
    });

    expect(procurement.createDraft).toHaveBeenCalledWith(
      'organization-1',
      {
        supplierName: 'Test Supplier',
        items: [{ productName: 'Widget', quantity: 10, unitPriceCny: 50 }],
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
      items: [{ productName: 'Widget', quantity: 10, unitPriceCny: 50 }],
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
        items: [{ productName: 'Widget', quantity: 10, unitPriceCny: 50 }],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(procurement.createDraft).toHaveBeenCalledOnce();
  });

  it('maps repository Master ownership failure to the IDOR error message', async () => {
    vi.mocked(procurement.createDraft).mockResolvedValue({
      ok: false,
      reason: 'master_product_not_found',
      missingMasterProductIds: ['master-2'],
    });

    await expect(
      service.create('organization-1', {
        supplierName: 'Other Supplier',
        items: [{ productName: 'Widget', masterProductId: 'master-2', quantity: 10, unitPriceCny: 50 }],
      }),
    ).rejects.toThrow('발주 항목의 셀피아 상품을 찾을 수 없거나 권한이 없습니다: master-2');

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
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 0,
        failedPoNumbers: [],
      },
      rows: [],
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
        collection: body.collection,
        rows: body.rows,
        editedQuantities: body.editedQuantities,
        clampEditedQuantities: true,
      },
    });
  });

  it('passes the caller key and authenticated actor to the common submission port', async () => {
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
        idempotencyKey: 'stable-submit-key',
      } as never,
    );

    expect(submissions.submit).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
      idempotencyKey: 'stable-submit-key',
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
