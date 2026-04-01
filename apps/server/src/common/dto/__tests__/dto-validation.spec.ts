import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from '../pagination.dto';
import { OrderActionBodyDto } from '../../../orders/dto/order-action.dto';
import {
  PurchaseOrderActionBodyDto,
} from '../../../inventory/dto/purchase-order-action.dto';

// ── Helpers ──

async function expectValid<T>(DtoClass: new () => T, plain: object): Promise<T> {
  const dto = plainToInstance(DtoClass, plain);
  const errors = await validate(dto as object);
  expect(errors).toHaveLength(0);
  return dto;
}

async function expectInvalid(DtoClass: new () => any, plain: object, count?: number) {
  const dto = plainToInstance(DtoClass, plain);
  const errors = await validate(dto as object);
  expect(errors.length).toBeGreaterThan(0);
  if (count !== undefined) expect(errors).toHaveLength(count);
  return errors;
}

// ── Tests ──

describe('PaginationQueryDto', () => {
  it('applies default values when empty', async () => {
    const dto = await expectValid(PaginationQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(50);
  });

  it('accepts valid page and limit', async () => {
    await expectValid(PaginationQueryDto, { page: 3, limit: 100 });
  });

  it('transforms string to number via @Type', async () => {
    const dto = await expectValid(PaginationQueryDto, { page: '5', limit: '20' });
    expect(dto.page).toBe(5);
    expect(dto.limit).toBe(20);
  });

  it('rejects non-positive page', async () => {
    await expectInvalid(PaginationQueryDto, { page: 0 });
    await expectInvalid(PaginationQueryDto, { page: -1 });
  });

  it('rejects limit exceeding 200', async () => {
    await expectInvalid(PaginationQueryDto, { limit: 201 });
  });
});

describe('OrderActionBodyDto', () => {
  it('valid confirm action', async () => {
    await expectValid(OrderActionBodyDto, {
      action: 'confirm',
      shipmentBoxIds: [1, 2, 3],
    });
  });

  it('valid invoice action', async () => {
    await expectValid(OrderActionBodyDto, {
      action: 'invoice',
      shipmentBoxId: 123,
      deliveryCompanyCode: 'CJGLS',
      invoiceNumber: '1234567890',
    });
  });

  it('rejects unknown action', async () => {
    await expectInvalid(OrderActionBodyDto, { action: 'cancel' });
  });

  it('confirm requires shipmentBoxIds', async () => {
    await expectInvalid(OrderActionBodyDto, { action: 'confirm' });
  });

  it('confirm rejects empty shipmentBoxIds', async () => {
    await expectInvalid(OrderActionBodyDto, {
      action: 'confirm',
      shipmentBoxIds: [],
    });
  });

  it('invoice requires all three fields', async () => {
    await expectInvalid(OrderActionBodyDto, { action: 'invoice', shipmentBoxId: 1 }, 2);
  });
});

describe('PurchaseOrderActionBodyDto', () => {
  const UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('valid create action', async () => {
    await expectValid(PurchaseOrderActionBodyDto, {
      action: 'create',
      companyId: UUID,
      supplierName: '광저우 무역',
      items: [{ productName: '아동복 세트', quantity: 100, unitPriceCny: 25.5 }],
    });
  });

  it('valid updateStatus action', async () => {
    await expectValid(PurchaseOrderActionBodyDto, {
      action: 'updateStatus',
      id: UUID,
      status: 'ordered',
    });
  });

  it('valid delete action', async () => {
    await expectValid(PurchaseOrderActionBodyDto, {
      action: 'delete',
      id: UUID,
    });
  });

  it('create rejects missing items', async () => {
    await expectInvalid(PurchaseOrderActionBodyDto, {
      action: 'create',
      companyId: UUID,
      supplierName: 'X',
    });
  });

  it('create rejects empty items array', async () => {
    await expectInvalid(PurchaseOrderActionBodyDto, {
      action: 'create',
      companyId: UUID,
      supplierName: 'X',
      items: [],
    });
  });

  it('create validates nested item fields', async () => {
    await expectInvalid(PurchaseOrderActionBodyDto, {
      action: 'create',
      companyId: UUID,
      supplierName: 'X',
      items: [{ productName: '', quantity: -1, unitPriceCny: 25 }],
    });
  });

  it('updateStatus rejects missing id', async () => {
    await expectInvalid(PurchaseOrderActionBodyDto, {
      action: 'updateStatus',
      status: 'shipped',
    });
  });
});
