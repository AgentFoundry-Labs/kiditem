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
  it('does not register a duplicate Rocket purchase-decision backend', () => {
    expect(existsSync(path.join(ORDERS_ROOT, 'controllers/rocket-po.controller.ts'))).toBe(false);
    expect(existsSync(path.join(ORDERS_ROOT, 'services/rocket-po-confirm.service.ts'))).toBe(false);

    const moduleSource = readFileSync(path.join(ORDERS_ROOT, 'orders.module.ts'), 'utf8');
    expect(moduleSource).not.toContain('RocketPoController');
    expect(moduleSource).not.toContain('RocketPoConfirmService');
  });

  it('reads Sellpia inventory but never re-owns Inventory stock decisions', () => {
    const source = productionTypeScriptFiles(ORDERS_ROOT)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    // Rocket confirmation/commitment is Supply + Inventory owned. Orders must
    // not create an accountless parallel reservation or mutate physical stock.
    for (const forbidden of [
      'InventoryModule',
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

describe('Rocket reservation schema boundary', () => {
  it('keeps InventoryCommitment as the only active Rocket stock hold ledger', () => {
    const prismaModels = path.resolve(ORDERS_ROOT, '../../../../prisma/models');
    const schema = readdirSync(prismaModels)
      .filter((entry) => entry.endsWith('.prisma'))
      .map((entry) => readFileSync(path.join(prismaModels, entry), 'utf8'))
      .join('\n');

    expect(schema).not.toContain('model RocketPoReservation');
    expect(schema).not.toContain('rocketPoReservations');
    expect(schema).toContain('model InventoryCommitment');
  });
});
