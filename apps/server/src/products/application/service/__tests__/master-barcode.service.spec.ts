import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { MasterBarcodeService } from '../master-barcode.service';

describe('MasterBarcodeService', () => {
  it('updates MasterProduct barcode through the products repository transaction', async () => {
    const tx = { tx: true };
    const masters = {
      findActiveBarcodeOwners: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: 'master-1' }),
    };
    const options = {
      findActiveByBarcode: vi.fn().mockResolvedValue(null),
    };
    const transactions = {
      run: vi.fn((callback) => callback(tx)),
    };
    const service = new MasterBarcodeService(
      masters as never,
      options as never,
      transactions as never,
    );

    await service.updateMasterBarcode({
      organizationId: 'org-1',
      masterId: 'master-1',
      barcode: ' 8806384882841 ',
    });

    expect(transactions.run).toHaveBeenCalled();
    expect(masters.update).toHaveBeenCalledWith({
      organizationId: 'org-1',
      id: 'master-1',
      data: { barcode: '8806384882841' },
      tx,
    });
  });

  it('rejects barcode already assigned to another active master product', async () => {
    const tx = { tx: true };
    const masters = {
      findActiveBarcodeOwners: vi.fn().mockResolvedValue([
        { id: 'master-2', code: 'M-00000002', name: '다른 상품' },
      ]),
      update: vi.fn(),
    };
    const options = {
      findActiveByBarcode: vi.fn().mockResolvedValue(null),
    };
    const transactions = {
      run: vi.fn((callback) => callback(tx)),
    };
    const service = new MasterBarcodeService(
      masters as never,
      options as never,
      transactions as never,
    );

    await expect(service.updateMasterBarcode({
      organizationId: 'org-1',
      masterId: 'master-1',
      barcode: '8806384882841',
    })).rejects.toBeInstanceOf(ConflictException);

    expect(masters.findActiveBarcodeOwners).toHaveBeenCalledWith({
      organizationId: 'org-1',
      barcode: '8806384882841',
      tx,
    });
    expect(masters.update).not.toHaveBeenCalled();
  });

  it('rejects barcode already assigned to an active product option', async () => {
    const tx = { tx: true };
    const masters = {
      findActiveBarcodeOwners: vi.fn().mockResolvedValue([
        { id: 'master-1', code: 'M-00000001', name: '현재 상품' },
      ]),
      update: vi.fn(),
    };
    const options = {
      findActiveByBarcode: vi.fn().mockResolvedValue({
        id: 'option-1',
        masterId: 'master-2',
        sku: 'M-00000002-01',
      }),
    };
    const transactions = {
      run: vi.fn((callback) => callback(tx)),
    };
    const service = new MasterBarcodeService(
      masters as never,
      options as never,
      transactions as never,
    );

    await expect(service.updateMasterBarcode({
      organizationId: 'org-1',
      masterId: 'master-1',
      barcode: '8806384882841',
    })).rejects.toBeInstanceOf(ConflictException);

    expect(options.findActiveByBarcode).toHaveBeenCalledWith(
      tx,
      'org-1',
      '8806384882841',
    );
    expect(masters.update).not.toHaveBeenCalled();
  });
});
