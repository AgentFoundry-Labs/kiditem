import { AlertTriangle } from 'lucide-react';
import { cn, formatKRW, formatPercent } from '@/lib/utils';
import {
  computeRocketPricing,
  unitCostFromCostCny,
  ROCKET_BUNDLE_THRESHOLD,
} from '../../../lib/rocket-pricing';
import { parseMoney } from '../../../lib/basic-draft';

interface RocketPricingSectionProps {
  consumerPrice: number;
  quantity: string;
  unitCost: string;
  costCny?: number | null;
  isEditing: boolean;
  onQuantityChange: (value: string) => void;
  onUnitCostChange: (value: string) => void;
}

export function RocketPricingSection({
  consumerPrice,
  quantity,
  unitCost,
  costCny,
  isEditing,
  onQuantityChange,
  onUnitCostChange,
}: RocketPricingSectionProps) {
  const autoUnitCost = unitCostFromCostCny(costCny);
  const unitCostValue = parseMoney(unitCost) || autoUnitCost;
  const pricing = computeRocketPricing({
    consumerPrice,
    quantity: parseQuantity(quantity),
    unitCost: unitCostValue,
  });

  if (!pricing.hasConsumerPrice) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">
        판매가를 입력하면 쿠팡 로켓 판매가·공급가·마진율이 계산됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <RocketStat label="소비자가(판매가)" value={`${formatKRW(consumerPrice)}원`} />
        {isEditing ? (
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
            <span className="shrink-0 text-[11px] font-black text-slate-500">묶음 수량</span>
            <input
              aria-label="쿠팡 로켓 묶음 수량"
              inputMode="numeric"
              value={quantity}
              placeholder="1"
              disabled={!pricing.bundled}
              onChange={(event) => onQuantityChange(event.target.value.replace(/[^\d]/g, ''))}
              className="h-7 min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-slate-900 outline-none placeholder:text-slate-300 disabled:text-slate-300"
            />
            <span className="shrink-0 text-[11px] font-bold text-slate-400">개</span>
          </label>
        ) : (
          <RocketStat
            label="묶음 수량"
            value={pricing.bundled ? `${pricing.effectiveQuantity}개` : '단품'}
          />
        )}
        {isEditing ? (
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
            <span className="shrink-0 text-[11px] font-black text-slate-500">단가 원가</span>
            <input
              aria-label="쿠팡 로켓 단가 원가"
              inputMode="numeric"
              value={unitCost}
              placeholder={autoUnitCost > 0 ? String(autoUnitCost) : '0'}
              onChange={(event) => onUnitCostChange(event.target.value.replace(/[^\d]/g, ''))}
              className="h-7 min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-slate-900 outline-none placeholder:text-slate-300"
            />
            <span className="shrink-0 text-[11px] font-bold text-slate-400">원</span>
          </label>
        ) : (
          <RocketStat
            label="단가 원가"
            value={unitCostValue > 0 ? `${formatKRW(unitCostValue)}원` : '미입력'}
          />
        )}
      </div>

      {!pricing.bundled && (
        <p className="text-[11px] font-bold text-slate-400">
          소비자가가 {formatKRW(ROCKET_BUNDLE_THRESHOLD)}원 이상이라 묶음 없이 단품으로 계산합니다.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <RocketResult label="쿠팡 로켓 판매가" value={`${formatKRW(pricing.rocketSellingPrice)}원`} tone="primary" />
        <RocketResult label="쿠팡 공급가" value={`${formatKRW(pricing.supplyPrice)}원`} tone="primary" />
        <RocketResult
          label="마진율"
          value={pricing.marginRate === null ? '원가 입력 필요' : formatPercent(pricing.marginRate)}
          tone={pricing.marginBelowThreshold ? 'danger' : 'default'}
        />
      </div>

      {pricing.marginBelowThreshold && (
        <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-600">
          <AlertTriangle size={14} className="shrink-0" />
          마진율 50% 이하 — 로켓 등록 전 단가/수량을 재확인하세요.
        </div>
      )}
    </div>
  );
}

function RocketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      <span className="shrink-0 text-[11px] font-black text-slate-500">{label}</span>
      <span className="ml-auto text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

function RocketResult({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'danger';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2',
        tone === 'primary' && 'border-emerald-100 bg-emerald-50/50',
        tone === 'danger' && 'border-rose-200 bg-rose-50',
        tone === 'default' && 'border-slate-200 bg-white',
      )}
    >
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className={cn('mt-0.5 text-base font-black', tone === 'danger' ? 'text-rose-600' : 'text-slate-900')}>
        {value}
      </p>
    </div>
  );
}

function parseQuantity(value: string): number {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}
