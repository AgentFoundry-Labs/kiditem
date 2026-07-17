'use client';

import { useState } from 'react';
import { AlertTriangle, Boxes, PackageCheck } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { VariantRecipeDialog } from './VariantRecipeDialog';
import type { ProductVariantDetail } from '@kiditem/shared/product-operations';

const WARNING_LABELS = {
  none: '구성 완료',
  configuration_required: '재고 연결 필요',
  review_required: '검토 필요',
} as const;

export default function ProductVariantPanel({ variants }: { variants: ProductVariantDetail[] }) {
  const [editingVariant, setEditingVariant] = useState<ProductVariantDetail | null>(null);

  return (
    <section id="variants" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[var(--text-primary)]">판매 옵션</h2>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            각 옵션은 중앙 Sellpia 구성 레시피 하나를 모든 판매 채널에서 공유합니다.
          </p>
        </div>
        <span className="text-sm font-bold text-[var(--text-tertiary)]">{formatNumber(variants.length)}개 옵션</span>
      </div>

      {variants.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-800">
          재고 연결 필요 · 판매 옵션이 없습니다.
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {variants.map((variant) => {
            const warning = variant.warningState !== 'none';
            const bottleneck = findBottleneck(variant);
            return (
              <article
                key={variant.id}
                id={`variant-${variant.id}`}
                className={`rounded-2xl border p-5 ${warning ? 'border-amber-300 bg-amber-50/70' : 'border-[var(--border-subtle)] bg-[var(--card-bg)]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--primary)]">
                        {variant.displayReference.label} {variant.displayReference.value}
                      </span>
                      {variant.isDefault ? <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">기본</span> : null}
                      <span className={`rounded px-2 py-0.5 text-[10px] font-extrabold ${warning ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                        {WARNING_LABELS[variant.warningState]}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-extrabold text-[var(--text-primary)]">{variant.name}</h3>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">{variant.optionLabel ?? '옵션 라벨 없음'}</p>
                  </div>
                  <div className="text-right">
                    {variant.capacity === null ? (
                      <p className="text-sm font-extrabold text-amber-700">판매 가능 미확정</p>
                    ) : (
                      <p className="text-sm font-extrabold text-emerald-700">판매 가능 {formatNumber(variant.capacity)}개</p>
                    )}
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">옵션 수용량</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {variant.components.length === 0 ? (
                    <p className="flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800">
                      <AlertTriangle size={14} /> Sellpia 구성품을 연결해주세요.
                    </p>
                  ) : variant.components.map((component) => (
                    <div key={component.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2 font-semibold text-[var(--text-secondary)]">
                        {component.isActive ? <PackageCheck size={14} className="text-emerald-600" /> : <AlertTriangle size={14} className="text-amber-600" />}
                        <span className="truncate">{component.code} · {component.name}{component.optionName ? ` / ${component.optionName}` : ''}</span>
                      </span>
                      <span className="font-bold tabular-nums text-[var(--text-primary)]">재고 {formatNumber(component.currentStock)} · 필요 {formatNumber(component.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)]">
                    <Boxes size={14} /> 병목 {bottleneck ? `${bottleneck.code} (${formatNumber(Math.floor(bottleneck.currentStock / bottleneck.quantity))}개)` : '미확정'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditingVariant(variant)}
                    className="rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-xs font-extrabold text-[var(--primary)]"
                  >
                    레시피 편집
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editingVariant ? (
        <VariantRecipeDialog
          open
          variant={editingVariant}
          onOpenChange={(open) => !open && setEditingVariant(null)}
        />
      ) : null}
    </section>
  );
}

function findBottleneck(variant: ProductVariantDetail) {
  return variant.components
    .filter((component) => component.isActive)
    .reduce<ProductVariantDetail['components'][number] | null>((lowest, component) => {
      if (!lowest) return component;
      return Math.floor(component.currentStock / component.quantity)
        < Math.floor(lowest.currentStock / lowest.quantity)
        ? component
        : lowest;
    }, null);
}
