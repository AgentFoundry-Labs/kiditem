'use client';
import { Package, Palette, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EditUseCase = 'compose' | 'color-variants' | 'single';

interface Props {
  onSelect: (useCase: EditUseCase) => void;
}

const CASES: Array<{ key: EditUseCase; icon: typeof Package; title: string; desc: string; accent: string }> = [
  {
    key: 'compose',
    icon: Package,
    title: '상품+박스/세트 합성',
    desc: '박스·세트 구성·포장을 상품과 함께 자연스럽게 배치',
    accent: 'text-violet-600 bg-violet-100',
  },
  {
    key: 'color-variants',
    icon: Palette,
    title: '색상별 상품 배치',
    desc: '같은 제품의 여러 색상 사진을 한 장에 합성',
    accent: 'text-rose-600 bg-rose-100',
  },
  {
    key: 'single',
    icon: Scissors,
    title: '단일 상품 정리',
    desc: '쿠팡 가이드라인 준수 흰배경 상품 사진',
    accent: 'text-sky-600 bg-sky-100',
  },
];

export function UseCaseSelection({ onSelect }: Props) {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-8 bg-white">
      <div className="w-full max-w-4xl space-y-4">
        <div className="text-center space-y-1">
          <div className="text-sm font-semibold text-gray-900">어떤 편집이 필요하세요?</div>
          <div className="text-xs text-gray-500">용도를 선택하면 맞춤 편집 화면으로 이동합니다</div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {CASES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelect(c.key)}
              className={cn(
                'flex flex-col items-center text-center gap-3 p-6 rounded-2xl bg-white',
                'border border-gray-200 hover:border-gray-300 hover:shadow-sm',
                'transition-all duration-150',
              )}
            >
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', c.accent)}>
                <c.icon size={22} />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold text-gray-900">{c.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{c.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
