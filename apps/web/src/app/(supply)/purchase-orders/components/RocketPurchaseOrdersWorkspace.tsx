'use client';

import { RocketPurchasePreviewSection } from './RocketPurchasePreviewSection';

export function RocketPurchaseOrdersWorkspace() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          로켓 발주 수량 검토
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          수집한 쿠팡 로켓 PO를 Sellpia 최신 재고와 상품 구성 기준으로 검토합니다.
        </p>
      </header>
      <RocketPurchasePreviewSection />
    </div>
  );
}
