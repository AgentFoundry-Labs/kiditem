import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcurementService } from '../application/service/procurement.service';
import { BadRequestException } from '@nestjs/common';
import type { ProcurementRepositoryPort } from '../application/port/out/repository/procurement.repository.port';

function makeRepository(): ProcurementRepositoryPort {
  return {
    list: vi.fn(),
    createDraft: vi.fn(),
    findScopedStatus: vi.fn(),
    updateStatusScoped: vi.fn(),
    findScopedForDelete: vi.fn(),
    deleteScoped: vi.fn(),
  } as unknown as ProcurementRepositoryPort;
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

  beforeEach(() => {
    procurement = makeRepository();
    service = new ProcurementService(procurement);
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

  it('maps repository option ownership failure to the existing IDOR error message', async () => {
    vi.mocked(procurement.createDraft).mockResolvedValue({
      ok: false,
      reason: 'option_not_found',
      missingOptionIds: ['option-2'],
    });

    await expect(
      service.create('organization-1', {
        supplierName: 'Other Supplier',
        items: [{ productName: 'Widget', optionId: 'option-2', quantity: 10, unitPriceCny: 50 }],
      }),
    ).rejects.toThrow('발주 항목의 옵션을 찾을 수 없거나 권한이 없습니다: option-2');

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

    await service.updateStatus('organization-1', 'po-1', 'ordered');
    expect(procurement.updateStatusScoped).toHaveBeenCalledWith(
      'organization-1',
      'po-1',
      'pending',
      { status: 'ordered' },
    );
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
    vi.mocked(procurement.findScopedForDelete).mockResolvedValue({ id: 'po-1', status: 'draft' });
    vi.mocked(procurement.deleteScoped).mockResolvedValue(true);

    const result = await service.delete('organization-1', 'po-1');
    expect(procurement.deleteScoped).toHaveBeenCalledWith('organization-1', 'po-1');
    expect(result).toEqual({ id: 'po-1', status: 'draft' });
  });

  it('delete non-draft PO → throws BadRequestException', async () => {
    vi.mocked(procurement.findScopedForDelete).mockResolvedValue({ id: 'po-1', status: 'shipped' });

    await expect(service.delete('organization-1', 'po-1')).rejects.toThrow(BadRequestException);
    expect(procurement.deleteScoped).not.toHaveBeenCalled();
  });

  it('delete wrong organization → not found, no mutation', async () => {
    vi.mocked(procurement.findScopedForDelete).mockResolvedValue(null);

    await expect(service.delete('organization-1', 'po-1')).rejects.toThrow(BadRequestException);

    expect(procurement.deleteScoped).not.toHaveBeenCalled();
  });
});
