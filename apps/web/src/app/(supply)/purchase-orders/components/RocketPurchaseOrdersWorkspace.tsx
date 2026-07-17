'use client';

import { useState } from 'react';
import { RocketPurchasePreviewSection } from './RocketPurchasePreviewSection';

function localCalendarDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function plusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localCalendarDay(date);
}

/**
 * `/purchase-orders?tab=rocket` 단독 화면.
 * 로켓 발주 화면(`/rocket-orders`)에 임베드될 때는 그 화면의 캘린더가 입고예정일 범위를 주지만
 * 여기에는 캘린더가 없으므로 이 화면이 범위를 소유한다. 기본값은 캘린더와 동일하게 다음 7일.
 */
export function RocketPurchaseOrdersWorkspace() {
  const [from, setFrom] = useState(() => localCalendarDay(new Date()));
  const [to, setTo] = useState(() => plusDays(6));

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
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-slate-600">
          <span>조회 시작일</span>
          <input
            aria-label="조회 시작일"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-600">
          <span>조회 종료일</span>
          <input
            aria-label="조회 종료일"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>
      <RocketPurchasePreviewSection from={from} to={to} />
    </div>
  );
}
