'use client';
import { Scissors, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Backend 로 보내는 프롬프트 라우팅 키. 4개 값은 그대로 유지 —
 * UI 엔트리는 "자동 정리" 한 버튼이지만 `EditorInputPanel` 에서 이미지 종류(박스/색상/번들)를
 * 추가하면 자동으로 `compose` / `color-variants` / `bundle` 로 승격된다.
 */
export type EditUseCase = 'compose' | 'color-variants' | 'single' | 'bundle';

/** UseCaseSelection 엔트리 = 최상위 "트랙". 세부 editCase 는 슬롯 구성으로 자동 결정. */
export type WorkflowTrack = 'auto-clean' | 'creative';

interface Props {
  onSelect: (track: WorkflowTrack) => void;
}

const TRACKS: Array<{
  key: WorkflowTrack;
  icon: typeof Scissors;
  title: string;
  desc: string;
  hint: string;
  accentIcon: string;
  accentBorder: string;
}> = [
  {
    key: 'auto-clean',
    icon: Scissors,
    title: '쿠팡 썸네일 자동 정리',
    desc: '흰배경 · 가이드라인 준수 대표이미지',
    hint: '박스·색상·번들 이미지도 함께 올리면 자동 구성됩니다',
    accentIcon: 'text-violet-600 bg-violet-100',
    accentBorder: 'hover:border-violet-300 hover:bg-violet-50/30',
  },
  {
    key: 'creative',
    icon: Sparkles,
    title: 'AI 연출 생성',
    desc: '라이프스타일 · 아웃도어 · 컨셉 배경',
    hint: '씬·스타일 선택으로 분위기 있는 컷 합성',
    accentIcon: 'text-fuchsia-600 bg-fuchsia-100',
    accentBorder: 'hover:border-fuchsia-300 hover:bg-fuchsia-50/30',
  },
];

export function UseCaseSelection({ onSelect }: Props) {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-8 bg-white">
      <div className="w-full max-w-2xl space-y-5">
        <div className="text-center space-y-1">
          <div className="text-sm font-semibold text-gray-900">어떤 편집이 필요하세요?</div>
          <div className="text-xs text-gray-500">둘 중 하나를 선택하면 맞춤 편집 화면으로 이동합니다</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {TRACKS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onSelect(t.key)}
                className={cn(
                  'flex flex-col items-start text-left gap-3 p-6 rounded-2xl bg-white',
                  'border border-gray-200 hover:shadow-sm',
                  'transition-all duration-150',
                  t.accentBorder,
                )}
              >
                <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', t.accentIcon)}>
                  <Icon size={22} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-sm font-semibold text-gray-900">{t.title}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{t.desc}</div>
                </div>
                <div className="text-[11px] text-gray-400 leading-relaxed pt-1 border-t border-gray-100 w-full">
                  {t.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
