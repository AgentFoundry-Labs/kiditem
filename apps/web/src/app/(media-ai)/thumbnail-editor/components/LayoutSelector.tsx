'use client';

import { cn } from '@/lib/utils';
import type { LayoutKindLite } from '../edit/lib/slots';

/**
 * 낱개/세트 합성 시 배치 프리셋 선택 chip row.
 * Phase 1: auto/fan/grid 만 활성 — 나머지(arch/stack/radial) 는 disabled 로 표시.
 * 값 flow: `page.tsx` state → `slotsToDto(extras.layout)` → 백엔드 DTO.layout → 프롬프트 `{layoutBlock}`.
 */

type Option = {
  value: LayoutKindLite;
  label: string;
  hint: string;
  enabled: boolean;
};

const OPTIONS: Option[] = [
  { value: 'auto', label: '자동', hint: '모델 자율 판단', enabled: true },
  { value: 'fan', label: '부채꼴', hint: '바닥 중심 방사형', enabled: true },
  { value: 'grid', label: '그리드', hint: '정렬된 행/열', enabled: true },
  { value: 'arch', label: '아치', hint: '준비 중', enabled: false },
  { value: 'stack', label: '스택', hint: '준비 중', enabled: false },
  { value: 'radial', label: '라디얼', hint: '준비 중', enabled: false },
];

export function LayoutSelector({
  value,
  onChange,
}: {
  value: LayoutKindLite;
  onChange: (next: LayoutKindLite) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <h3 className="text-[13px] font-bold text-gray-900">배치</h3>
        <span className="text-[11px] text-gray-500">여러 낱개를 어떻게 배치할지 선택</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={!opt.enabled}
              onClick={() => onChange(opt.value)}
              title={opt.hint}
              className={cn(
                'px-2 py-1.5 text-[11px] font-semibold border transition-colors text-left',
                !opt.enabled && 'opacity-40 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400',
                opt.enabled && active && 'bg-violet-600 border-violet-600 text-white',
                opt.enabled && !active && 'bg-white border-gray-200 text-gray-700 hover:border-violet-300 hover:bg-violet-50/30',
              )}
            >
              <div>{opt.label}</div>
              <div className={cn('text-[10px] mt-0.5', active ? 'text-violet-100' : 'text-gray-400')}>{opt.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
