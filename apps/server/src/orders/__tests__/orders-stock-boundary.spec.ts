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
  it('does not expose the deferred Rocket purchase-decision backend', () => {
    expect(existsSync(path.join(ORDERS_ROOT, 'controllers/rocket-po.controller.ts'))).toBe(false);
    expect(existsSync(path.join(ORDERS_ROOT, 'services/rocket-po-confirm.service.ts'))).toBe(false);
  });

  it('has no dependency on legacy inventory stock decisions', () => {
    const source = productionTypeScriptFiles(ORDERS_ROOT)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    for (const forbidden of [
      'InventoryModule',
      'INVENTORY_PORT',
      'reservedStock',
      'RocketInventoryLedger',
      'confirm-fill',
      'confirm-generate',
      'confirm-preview',
      'confirm-commit',
    ]) {
      expect(source, `orders production code still contains ${forbidden}`).not.toContain(forbidden);
    }
  });
});
