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
  // 사용자 원본(03123c2f) 로켓 발주확정 백엔드 복원: 저장 발주(rocket_purchase_orders)
  // 달력/미리보기 공급을 위해 컨트롤러·서비스를 되살렸다. (되돌린 리팩터 = 4547f07e)
  it('exposes the restored Rocket purchase-decision backend', () => {
    expect(existsSync(path.join(ORDERS_ROOT, 'controllers/rocket-po.controller.ts'))).toBe(true);
    expect(existsSync(path.join(ORDERS_ROOT, 'services/rocket-po-confirm.service.ts'))).toBe(true);
  });

  it('reads Sellpia inventory but never re-owns Inventory stock decisions', () => {
    const source = productionTypeScriptFiles(ORDERS_ROOT)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    // 로켓 예약은 전용 RocketPoReservation 테이블로 셀피아 재고 위에 얹는다.
    // orders 는 SellpiaInventorySku.currentStock 을 읽기만 하고, Inventory 모듈/포트나
    // Inventory 소유 재고 필드(reservedStock)·로켓 원장을 직접 소유하지 않는다.
    for (const forbidden of [
      'InventoryModule',
      'INVENTORY_PORT',
      'reservedStock',
      'RocketInventoryLedger',
    ]) {
      expect(source, `orders production code still contains ${forbidden}`).not.toContain(forbidden);
    }
  });
});
