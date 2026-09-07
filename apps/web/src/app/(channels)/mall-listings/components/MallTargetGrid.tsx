'use client';

import { AlertTriangle, Ban, Check, ShieldAlert } from 'lucide-react';
import type { MallPublishTarget } from '@kiditem/shared/mall-publishing';
import { cn } from '@/lib/utils';
import {
  MALL_KIND_LABEL,
  MALL_READINESS_LABEL,
  MALL_READINESS_TONE,
  mallHazardBadges,
} from '../../_shared/mall-presentation';

interface MallTargetGridProps {
  targets: MallPublishTarget[];
  selectedKeys: ReadonlySet<string>;
  onToggle: (mallKey: string) => void;
}

export function MallTargetGrid({ targets, selectedKeys, onToggle }: MallTargetGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {targets.map((target) => (
        <MallTargetCard
          key={target.manifest.key}
          target={target}
          selected={selectedKeys.has(target.manifest.key)}
          onToggle={() => onToggle(target.manifest.key)}
        />
      ))}
    </div>
  );
}

function MallTargetCard({
  target,
  selected,
  onToggle,
}: {
  target: MallPublishTarget;
  selected: boolean;
  onToggle: () => void;
}) {
  const { manifest } = target;
  const hazards = mallHazardBadges(manifest);
  const selectable = target.readiness !== 'unsupported';

  return (
    <article
      className={cn(
        'rounded-xl border bg-white p-3 transition',
        selected ? 'border-purple-400 ring-1 ring-purple-200' : 'border-slate-200',
        !selectable && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            disabled={!selectable}
            onChange={onToggle}
            aria-label={`${manifest.name} 선택`}
            className="mt-0.5 h-4 w-4 flex-none accent-purple-600 disabled:cursor-not-allowed"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span
                className={cn('h-1.5 w-1.5 flex-none rounded-full', MALL_READINESS_TONE[target.readiness])}
              />
              <span className="truncate text-sm font-medium text-slate-900">{manifest.name}</span>
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-400">
              {MALL_KIND_LABEL[manifest.kind]} · {MALL_READINESS_LABEL[target.readiness]}
            </span>
          </span>
        </label>
        {manifest.unverified ? (
          <span title={manifest.note}>
            <Ban size={13} className="mt-0.5 flex-none text-slate-300" />
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1">
        <CapabilityChip label="등록" enabled={manifest.supports.createListing} />
        <CapabilityChip label="품절" enabled={manifest.supports.soldOut} />
        <CapabilityChip label="해제" enabled={manifest.supports.resume} />
        <CapabilityChip label="재고" enabled={manifest.supports.setStock !== null} />
      </div>

      {hazards.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {hazards.slice(0, 3).map((hazard) => (
            <li
              key={hazard.label}
              title={hazard.detail}
              className={cn(
                'flex items-start gap-1 text-[11px]',
                hazard.tone === 'danger' ? 'text-red-600' : 'text-amber-600',
              )}
            >
              {hazard.tone === 'danger' ? (
                <ShieldAlert size={11} className="mt-0.5 flex-none" />
              ) : (
                <AlertTriangle size={11} className="mt-0.5 flex-none" />
              )}
              <span className="line-clamp-1">{hazard.label}</span>
            </li>
          ))}
          {hazards.length > 3 ? (
            <li className="pl-4 text-[11px] text-slate-400">외 {hazards.length - 3}건</li>
          ) : null}
        </ul>
      ) : null}

      <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-400" title={manifest.note}>
        {manifest.note}
      </p>
    </article>
  );
}

function CapabilityChip({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
        enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400',
      )}
    >
      {enabled ? <Check size={9} /> : null}
      {label}
    </span>
  );
}
