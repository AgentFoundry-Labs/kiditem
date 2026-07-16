'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, ClipboardList, PackageX } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { MasterProductOperationsListResponse } from '@kiditem/shared/product-operations';

type Props = {
  data: MasterProductOperationsListResponse;
  onShowOutOfStock: () => void;
};

export function ProductOperationsCommandCenter({ data, onShowOutOfStock }: Props) {
  const connectedCount = data.items.filter((item) => item.channelCount > 0).length;
  const unconnectedCount = data.items.length - connectedCount;
  const outOfStockCount = data.items.filter((item) => item.inventoryStatus === 'out_of_stock').length;
  const configurationCount = data.items.filter((item) => item.inventoryStatus === 'configuration_required').length;
  const reviewCount = data.items.filter((item) => item.inventoryStatus === 'review_required').length;
  const warningCount = configurationCount + reviewCount;
  const inventoryUnits = data.items.reduce((sum, item) => sum + item.inventoryUnits, 0);
  const lowProfitCount = data.items.filter((item) => item.profit !== null && item.profit < 0).length;
  const aGradeCount = data.items.filter((item) => item.abcGrade === 'A').length;
  const bGradeCount = data.items.filter((item) => item.abcGrade === 'B').length;
  const cGradeCount = data.items.filter((item) => item.abcGrade === 'C').length;

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-semibold text-[var(--text-tertiary)]">
        카탈로그 전체 수를 제외한 운영 지표는 현재 페이지 {formatNumber(data.items.length)}개 상품 기준입니다.
      </p>
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-5">
      <article className="flex min-h-[270px] flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 pb-2.5 pt-5 shadow-sm">
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)]">카탈로그 상품 전체</p>
          <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
            {formatNumber(data.total)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[var(--surface-sunken)] p-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[var(--text-tertiary)]">현재 페이지 채널 연결</p>
              <p className="mt-0.5 text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(connectedCount)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[var(--text-tertiary)]">현재 페이지 채널 미연결</p>
              <p className="mt-0.5 text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(unconnectedCount)}</p>
            </div>
          </div>
        </div>
        <div className="mt-auto">
          <Breakdown label="신상품" value="미수집" tone="text-emerald-600" />
          <Breakdown label="현재 페이지 A등급" value={aGradeCount} tone="text-emerald-700" />
          <Breakdown label="현재 페이지 B등급" value={bGradeCount} tone="text-amber-600" />
          <Breakdown label="현재 페이지 C등급" value={cGradeCount} tone="text-rose-600" />
        </div>
      </article>

      <article className="min-h-[270px] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] shadow-sm">
        <div className="flex h-full flex-col divide-y divide-[var(--border-subtle)]">
          <QuickButton
            icon={PackageX}
            label="현재 페이지 품절 상품"
            count={outOfStockCount}
            tone="blue"
            onClick={onShowOutOfStock}
          />
          <Link
            href="/purchase-orders"
            className="flex flex-1 items-center gap-3 bg-violet-50 px-4 py-3 text-left text-violet-700 transition-colors hover:bg-violet-100"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100"><ClipboardList size={17} /></span>
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold">발주하기</span>
            <span className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1 text-sm font-extrabold text-[var(--text-tertiary)]">계산 전</span>
          </Link>
          <QuickButton
            icon={AlertTriangle}
            label="현재 페이지 재고위험"
            count={warningCount}
            tone="orange"
          />
        </div>
      </article>

      <OperationsCard title="재고관리 · 현재 페이지" value={inventoryUnits} valueTone="text-teal-700">
        <Breakdown label="재고위험" value={warningCount} tone="text-teal-700" />
        <Breakdown label="품절" value={outOfStockCount} tone="text-rose-600" />
        <Breakdown label="임박 재고" value="미수집" tone="text-amber-600" />
        <Breakdown label="발주 필요" value="미수집" tone="text-[var(--primary)]" />
      </OperationsCard>

      <OperationsCard title="손익점검 · 현재 페이지" value={lowProfitCount} valueTone="text-amber-600">
        <Breakdown label="점검 대상" value={lowProfitCount} tone="text-amber-600" />
        <Breakdown label="적자상품" value={lowProfitCount} tone="text-rose-600" />
        <Breakdown label="이익률 3%↓" value="미수집" tone="text-amber-600" />
        <Breakdown label="핵심상품" value="미수집" tone="text-emerald-700" />
      </OperationsCard>

      <article className="flex min-h-[270px] flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 pb-2.5 pt-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)]">알림 · 현재 페이지</p>
            <p className={`mt-2 text-3xl font-extrabold tabular-nums tracking-tight ${warningCount > 0 ? 'text-amber-600' : 'text-[var(--text-primary)]'}`}>
              {formatNumber(warningCount)}
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><Bell size={17} /></span>
        </div>
        <div className="mt-auto">
          <Breakdown label="오류" value={reviewCount} tone={reviewCount > 0 ? 'text-rose-600' : undefined} />
          <Breakdown label="경고" value={configurationCount} tone={configurationCount > 0 ? 'text-amber-600' : undefined} />
          <Breakdown label="최신 가져오기" value="미수집" />
          <Link
            href="/inventory-hub?tab=sellpia-sync"
            className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
          >
            <span className="truncate text-[11px] font-bold">Sellpia 가져오기 내역</span>
            <span className="text-[11px] font-bold text-[var(--text-muted)]">열기</span>
          </Link>
        </div>
      </article>
      </section>
    </div>
  );
}

function OperationsCard({
  title,
  value,
  valueTone = 'text-[var(--text-primary)]',
  children,
}: {
  title: string;
  value: number | string;
  valueTone?: string;
  children: ReactNode;
}) {
  return (
    <article className="flex min-h-[270px] flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 pb-2.5 pt-5 shadow-sm">
      <div>
        <p className="text-xs font-bold text-[var(--text-tertiary)]">{title}</p>
        <p className={`mt-2 text-3xl font-extrabold tabular-nums tracking-tight ${valueTone}`}>
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
      </div>
      <div className="mt-auto">{children}</div>
    </article>
  );
}

function Breakdown({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
      <p className="text-xs font-bold text-[var(--text-secondary)]">{label}</p>
      <p className={`text-[14px] font-extrabold tabular-nums ${tone ?? 'text-[var(--text-primary)]'}`}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
    </div>
  );
}

function QuickButton({
  icon: Icon,
  label,
  count,
  tone,
  onClick,
}: {
  icon: typeof PackageX;
  label: string;
  count: number;
  tone: 'blue' | 'orange';
  onClick?: () => void;
}) {
  const styles = tone === 'blue'
    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
    : 'bg-amber-50 text-amber-700 hover:bg-amber-100';
  const iconStyles = tone === 'blue' ? 'bg-blue-100' : 'bg-amber-100';
  const content = (
    <>
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconStyles}`}><Icon size={17} /></span>
      <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{label}</span>
      <span className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1 text-base font-extrabold tabular-nums text-[var(--text-primary)]">{formatNumber(count)}</span>
    </>
  );
  const className = `flex flex-1 items-center gap-3 px-4 py-3 text-left transition-colors ${styles}`;
  return onClick
    ? <button type="button" onClick={onClick} className={className}>{content}</button>
    : <div className={className}>{content}</div>;
}
