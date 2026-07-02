import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { RocketPoController } from '../rocket-po.controller';
import type { InventoryPort } from '../../../inventory/application/port/in/stock/inventory.port';

function makeController() {
  const inventory = {
    applyRocketInventoryEvent: vi.fn(),
  } as unknown as InventoryPort;
  const controller = new RocketPoController({} as never, inventory);
  return { controller, inventory };
}

function makeRow(overrides = {}) {
  return {
    poNumber: '135325078',
    productNo: '41112905',
    barcode: '8806384890259',
    productName: '11000 찍찍이 가방 캐치볼 (핑크)',
    orderQty: 48,
    confirmQty: 4,
    shortageReason: '',
    available: 10,
    inventoryId: 'inventory-1',
    optionId: 'option-1',
    ...overrides,
  };
}

describe('RocketPoController confirmCommit', () => {
  it('uses a source action id based on PO, product number, and barcode without quantity', async () => {
    const { controller, inventory } = makeController();
    vi.mocked(inventory.applyRocketInventoryEvent).mockResolvedValue({
      ledgerId: 'ledger-1',
      alreadyApplied: false,
    });

    await controller.confirmCommit('org-1', { id: 'user-1' } as never, {
      rows: [makeRow({ confirmQty: 4 })],
    });

    expect(inventory.applyRocketInventoryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceActionId: 'rocket-confirm:135325078:41112905:8806384890259',
        sourceRef: '135325078/41112905/8806384890259',
        quantity: 4,
      }),
    );
  });

  it('keeps successful row reservations and reports later row failures', async () => {
    const { controller, inventory } = makeController();
    vi.mocked(inventory.applyRocketInventoryEvent)
      .mockResolvedValueOnce({ ledgerId: 'ledger-1', alreadyApplied: false })
      .mockRejectedValueOnce(new BadRequestException('Rocket source action already has a different quantity'));

    const result = await controller.confirmCommit('org-1', { id: 'user-1' } as never, {
      rows: [
        makeRow({ poNumber: '135325078', productNo: '41112905', barcode: '8806384890259' }),
        makeRow({ poNumber: '135325190', productNo: '41114064', barcode: '8806384890266' }),
      ],
    });

    expect(result.reservedRows).toBe(1);
    expect(result.failedRows).toBe(1);
    expect(result.failed).toEqual([
      {
        poNumber: '135325190',
        productNo: '41114064',
        barcode: '8806384890266',
        reason: 'Rocket source action already has a different quantity',
      },
    ]);
  });
});
