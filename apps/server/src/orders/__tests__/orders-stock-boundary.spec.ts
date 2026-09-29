import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ORDERS_ROOT = path.resolve(__dirname, '..');

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return productionTypeScriptFiles(absolute);
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) return [];
    return [absolute];
  });
}

describe('Orders stock boundary', () => {
  it('옛 셀피아 전송 intent 표는 스키마·Orders 소스에서 사라졌고(wave9a, KID-365), 전송 울타리는 실행 kind가 맡는다', () => {
    const schema = readFileSync(
      path.resolve(ORDERS_ROOT, '../../../../prisma/models/orders.prisma'),
      'utf8',
    );
    expect(schema).not.toMatch(/model SellpiaOrderTransmissionIntent/);
    expect(schema).not.toContain('sellpia_order_transmission_intents');

    const source = productionTypeScriptFiles(ORDERS_ROOT)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(source).not.toContain('sellpiaOrderTransmissionIntent');
    expect(source).not.toContain('SellpiaInventoryFreshness');
    expect(source).not.toContain('order_transmission_requested');
  });

  it('does not register a duplicate Rocket purchase-decision backend', () => {
    expect(existsSync(path.join(ORDERS_ROOT, 'adapter/in/web/rocket-po.controller.ts'))).toBe(false);
    expect(existsSync(path.join(ORDERS_ROOT, 'application/service/rocket-po-confirm.service.ts'))).toBe(false);

    const moduleSource = readFileSync(path.join(ORDERS_ROOT, 'orders.module.ts'), 'utf8');
    expect(moduleSource).not.toContain('RocketPoController');
    expect(moduleSource).not.toContain('RocketPoConfirmService');
  });

  it('reads Sellpia inventory through the published owner port', () => {
    const source = productionTypeScriptFiles(ORDERS_ROOT)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    // Rocket confirmation is Supply owned. Orders must not create an
    // accountless reservation or mutate physical stock, and it must not
    // import Inventory persistence implementations directly.
    for (const forbidden of [
      "inventory/adapter/out/persistence",
      "inventory/adapter/out/repository",
      "inventory/read",
      "inventory/transaction",
      'INVENTORY_PORT',
      'reservedStock',
      'RocketInventoryLedger',
      'RocketPoReservation',
      '/api/orders/rocket',
    ]) {
      expect(source, `orders production code still contains ${forbidden}`).not.toContain(forbidden);
    }
  });
});
