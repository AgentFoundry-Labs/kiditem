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
  it('owns the Sellpia transmission fence without inventory-generation behavior', () => {
    const schema = readFileSync(
      path.resolve(ORDERS_ROOT, '../../../../prisma/models/orders.prisma'),
      'utf8',
    );
    const intent = schema.match(
      /model SellpiaOrderTransmissionIntent \{([\s\S]*?)\n\}/,
    )?.[1] ?? '';
    const reconciliation = schema.match(
      /model SellpiaOrderTransmissionIntentReconciliation \{([\s\S]*?)\n\}/,
    )?.[1] ?? '';

    expect(intent).toContain('organizationId');
    expect(intent).toContain('intentKey');
    expect(intent).toContain('@@unique([organizationId, intentKey]');
    expect(reconciliation).toContain('reconciledBy');
    expect(reconciliation).toContain('outcome');

    const source = productionTypeScriptFiles(ORDERS_ROOT)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(source).not.toContain('SellpiaInventoryFreshness');
    expect(source).not.toContain('order_transmission_requested');
  });

  it('does not register a duplicate Rocket purchase-decision backend', () => {
    expect(existsSync(path.join(ORDERS_ROOT, 'controllers/rocket-po.controller.ts'))).toBe(false);
    expect(existsSync(path.join(ORDERS_ROOT, 'services/rocket-po-confirm.service.ts'))).toBe(false);

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
