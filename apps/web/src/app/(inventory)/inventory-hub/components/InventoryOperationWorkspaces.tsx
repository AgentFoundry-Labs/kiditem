'use client';

import ReturnTransfers from '../../stock-ops/components/ReturnTransfers';
import StockTransfers from '../../stock-ops/components/StockTransfers';
import ChannelAvailability from './ChannelAvailability';
import SellpiaImportHistory from './SellpiaImportHistory';

export function InventoryIoWorkspace() {
  return (
    <div className="space-y-8">
      <StockTransfers />
      <ReturnTransfers />
    </div>
  );
}

export function RocketInventoryWorkspace() {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Rocket도 채널 계정으로 계산합니다. 이 화면에서는 Sellpia 현재고를 수정하지 않습니다.
      </div>
      <ChannelAvailability />
    </section>
  );
}

export function InventoryLedgerWorkspace() {
  return (
    <section className="space-y-6">
      <div><h2 className="text-lg font-semibold">운영 기록 수불부</h2></div>
      <StockTransfers readOnly />
      <ReturnTransfers readOnly />
    </section>
  );
}

export function InventoryAuditWorkspace() {
  return (
    <section className="space-y-4">
      <div><h2 className="text-lg font-semibold">Sellpia 스냅샷 실사 기록</h2></div>
      <SellpiaImportHistory />
    </section>
  );
}
