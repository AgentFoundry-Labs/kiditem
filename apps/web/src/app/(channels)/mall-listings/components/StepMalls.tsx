'use client';

import { AlertTriangle, Check, FileSpreadsheet, MousePointerClick, Plug, ShieldAlert } from 'lucide-react';
import type { MallPublishTarget } from '@kiditem/shared/mall-publishing';
import { cn } from '@/lib/utils';
import { MALL_READINESS_LABEL, MALL_READINESS_TONE, mallHazardBadges } from '../../_shared/mall-presentation';
import { MALL_PUBLISH_ADAPTERS } from '../../_shared/adapters';
import type { MallPublishAdapter } from '../../_shared/mall-publish-adapter';

interface StepMallsProps {
  targets: MallPublishTarget[];
  selected: ReadonlySet<string>;
  productCount: number;
  onToggle: (mallKey: string) => void;
}

const MODE_META: Record<MallPublishAdapter['mode'], { label: string; icon: typeof Plug }> = {
  api: { label: '공식 API', icon: Plug },
  form: { label: '어드민 폼', icon: MousePointerClick },
  excel: { label: '엑셀 일괄', icon: FileSpreadsheet },
};

/** 이 몰이 상품 N개를 어떻게 나눠 처리하는지 한 줄로. */
function batchHint(adapter: MallPublishAdapter, productCount: number): string {
  if (!Number.isFinite(adapter.batchSize)) {
    return `파일 하나에 ${productCount}건 전부`;
  }
  if (adapter.batchSize === 1) {
    return `1개씩 ${productCount}번 · 탭이 ${productCount}번 열림`;
  }
  return `${adapter.batchSize}개씩 ${Math.ceil(productCount / adapter.batchSize)}번`;
}

/**
 * 2단계 — 보낼 몰.
 *
 * 어댑터가 있는 몰만 고를 수 있다. 매니페스트에는 27개 몰이 있지만 그건 "이 몰이
 * 무엇을 지원하는가" 를 아는 것이고, 실제로 보내는 방법을 아는 것은 어댑터다.
 * 둘을 섞어 보여주면 고를 수 없는 몰을 고르게 된다.
 */
export function StepMalls({ targets, selected, productCount, onToggle }: StepMallsProps) {
  const targetByKey = new Map(targets.map((target) => [target.manifest.key, target]));
  const withoutAdapter = targets.filter(
    (target) => !MALL_PUBLISH_ADAPTERS.some((adapter) => adapter.mallKey === target.manifest.key),
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          보낼 몰
          {selected.size > 0 ? (
            <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700">
              {selected.size}개
            </span>
          ) : null}
        </h2>
        <p className="text-xs text-slate-400">여러 개를 골라 한 번에 보냅니다.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MALL_PUBLISH_ADAPTERS.map((adapter) => (
          <MallAdapterCard
            key={adapter.mallKey}
            adapter={adapter}
            target={targetByKey.get(adapter.mallKey) ?? null}
            selected={selected.has(adapter.mallKey)}
            productCount={productCount}
            onToggle={() => onToggle(adapter.mallKey)}
          />
        ))}
      </div>

      {withoutAdapter.length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
          <summary className="cursor-pointer text-xs text-slate-500">
            송신 경로가 아직 없는 몰 {withoutAdapter.length}개
          </summary>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            매니페스트에는 있지만 어댑터가 없습니다. 어댑터 파일 하나를 추가하면 이 화면에
            그대로 나타납니다 — 화면을 고칠 필요는 없습니다.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {withoutAdapter.map((target) => (
              <span
                key={target.manifest.key}
                title={target.manifest.note}
                className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-400 ring-1 ring-slate-200"
              >
                {target.manifest.name}
              </span>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function MallAdapterCard({
  adapter,
  target,
  selected,
  productCount,
  onToggle,
}: {
  adapter: MallPublishAdapter;
  target: MallPublishTarget | null;
  selected: boolean;
  productCount: number;
  onToggle: () => void;
}) {
  const mode = MODE_META[adapter.mode];
  const ModeIcon = mode.icon;
  const hazards = target ? mallHazardBadges(target.manifest) : [];

  return (
    <article
      className={cn(
        'rounded-xl border bg-white p-3.5 transition',
        selected ? 'border-purple-400 ring-1 ring-purple-200' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`${adapter.mallName} 선택`}
          className="mt-0.5 h-4 w-4 flex-none accent-purple-600"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {target ? (
              <span className={cn('h-1.5 w-1.5 flex-none rounded-full', MALL_READINESS_TONE[target.readiness])} />
            ) : null}
            <span className="truncate text-sm font-semibold text-slate-900">{adapter.mallName}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5">
              <ModeIcon size={10} />
              {mode.label}
            </span>
            {target ? <span>{MALL_READINESS_LABEL[target.readiness]}</span> : null}
          </span>
        </span>
      </label>

      <dl className="mt-3 space-y-1.5 text-[11px]">
        <div className="flex gap-2">
          <dt className="w-16 flex-none text-slate-400">처리 단위</dt>
          <dd className="text-slate-600">{batchHint(adapter, Math.max(productCount, 1))}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 flex-none text-slate-400">최종 제출</dt>
          <dd className={adapter.requiresOperatorSubmit ? 'text-amber-600' : 'text-slate-600'}>
            {adapter.requiresOperatorSubmit ? '사람이 직접' : '자동'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 flex-none text-slate-400">몰별 값</dt>
          <dd className="text-slate-600">{adapter.fields.length}개</dd>
        </div>
      </dl>

      {hazards.length > 0 ? (
        <ul className="mt-2.5 space-y-1 border-t border-slate-100 pt-2">
          {hazards.slice(0, 2).map((hazard) => (
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
        </ul>
      ) : (
        <p className="mt-2.5 flex items-center gap-1 border-t border-slate-100 pt-2 text-[11px] text-emerald-600">
          <Check size={11} />
          알려진 위험 없음
        </p>
      )}
    </article>
  );
}
