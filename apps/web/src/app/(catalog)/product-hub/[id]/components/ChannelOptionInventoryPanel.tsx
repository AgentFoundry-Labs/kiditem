'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, PackageCheck } from 'lucide-react';
import type { ProductChannelListingSummary } from '@kiditem/shared/product-operations';
import { formatNumber } from '@/lib/utils';
import { ChannelOptionInventoryDialog } from './ChannelOptionInventoryDialog';

type OptionRow = ProductChannelListingSummary['options'][number] & {
  channel: string;
  channelAccountName: string;
};

export default function ChannelOptionInventoryPanel({
  channelListings,
  inventoryOptionId,
  initialInventorySearch,
  onInventoryDialogClose,
}: {
  channelListings: ProductChannelListingSummary[];
  inventoryOptionId?: string;
  initialInventorySearch?: string;
  onInventoryDialogClose?: () => void;
}) {
  const options = useMemo<OptionRow[]>(() => channelListings.flatMap((listing) =>
    listing.options.map((option) => ({
      ...option,
      channel: listing.channel,
      channelAccountName: listing.channelAccountName,
    }))), [channelListings]);
  const [editingOption, setEditingOption] = useState<OptionRow | null>(null);

  useEffect(() => {
    if (!inventoryOptionId) return;
    setEditingOption(options.find(({ id }) => id === inventoryOptionId) ?? null);
  }, [inventoryOptionId, options]);

  return (
    <section id="channel-options" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[var(--text-primary)]">채널 판매 옵션 · 재고 구성</h2>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            실제 판매되는 채널 옵션마다 차감할 Sellpia 재고 SKU와 수량을 관리합니다.
          </p>
        </div>
        <span className="text-sm font-bold text-[var(--text-tertiary)]">{formatNumber(options.length)}개 옵션</span>
      </div>

      {options.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-800">
          연결된 채널 판매 옵션이 없습니다. 상품 매칭 화면에서 채널 상품을 먼저 연결해 주세요.
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {options.map((option) => {
            const configured = option.inventoryComponents.length > 0;
            const bottleneck = findBottleneck(option);
            return (
              <article
                key={option.id}
                id={`channel-option-${option.id}`}
                className={`rounded-2xl border p-5 ${configured ? 'border-[var(--border-subtle)] bg-[var(--card-bg)]' : 'border-amber-300 bg-amber-50/70'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {option.channel} · {option.channelAccountName}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-extrabold ${configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                        {configured ? '구성 완료' : '재고 연결 필요'}
                      </span>
                    </div>
                    <h3 className="mt-2 truncate text-base font-extrabold text-[var(--text-primary)]">
                      {option.itemName ?? option.externalOptionId}
                    </h3>
                    <p className="mt-1 font-mono text-xs text-[var(--text-tertiary)]">{option.sellerSku ?? option.externalOptionId}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-extrabold ${option.capacity === null ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {option.capacity === null ? '판매 가능 미확정' : `판매 가능 ${formatNumber(option.capacity)}개`}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">현재 재고 기준</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {!configured ? (
                    <p className="flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800">
                      <AlertTriangle size={14} /> 이 채널 옵션이 차감할 재고를 연결해 주세요.
                    </p>
                  ) : option.inventoryComponents.map((component) => (
                    <div key={component.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2 font-semibold text-[var(--text-secondary)]">
                        {component.isActive === true ? <PackageCheck size={14} className="text-emerald-600" /> : <AlertTriangle size={14} className="text-amber-600" />}
                        <span className="truncate">{component.code} · {component.name}{component.optionName ? ` / ${component.optionName}` : ''}</span>
                      </span>
                      <span className="font-bold tabular-nums text-[var(--text-primary)]">가용 {component.availableStock === null ? '미수집' : formatNumber(component.availableStock)} · 차감 {formatNumber(component.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)]">
                    <Boxes size={14} /> 병목 {bottleneck ? `${bottleneck.code} (${formatNumber(Math.floor(bottleneck.availableStock / bottleneck.quantity))}개)` : '미확정'}
                  </p>
                  <button type="button" onClick={() => setEditingOption(option)} className="rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-xs font-extrabold text-[var(--primary)]">
                    재고 구성 편집
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editingOption ? (
        <ChannelOptionInventoryDialog
          open
          option={editingOption}
          initialInventorySearch={initialInventorySearch}
          onOpenChange={(open) => {
            if (!open) {
              setEditingOption(null);
              onInventoryDialogClose?.();
            }
          }}
        />
      ) : null}
    </section>
  );
}

function findBottleneck(option: ProductChannelListingSummary['options'][number]) {
  type AvailableComponent = ProductChannelListingSummary['options'][number]['inventoryComponents'][number] & {
    availableStock: number;
  };

  return option.inventoryComponents
    .filter((component): component is AvailableComponent => component.isActive === true && component.availableStock !== null)
    .reduce<AvailableComponent | null>((lowest, component) => {
      if (!lowest) return component;
      return Math.floor(component.availableStock / component.quantity)
        < Math.floor(lowest.availableStock / lowest.quantity)
        ? component
        : lowest;
    }, null);
}
