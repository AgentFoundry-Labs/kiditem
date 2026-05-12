import type { RecomposeVariantKey, ThumbnailAnalysisResult } from '@kiditem/shared/ai';
import { RecomposeVariantPicker } from '../../../_shared/components/thumbnails/RecomposeVariantPicker';

interface RecomposeControlSlotProps {
  classification: NonNullable<ThumbnailAnalysisResult['recompose']>;
  userPrompt: string;
  selectedVariantKey: RecomposeVariantKey | undefined;
  onSelectVariant: (key: RecomposeVariantKey | undefined) => void;
}

export function RecomposeControlSlot({
  classification,
  userPrompt,
  selectedVariantKey,
  onSelectVariant,
}: RecomposeControlSlotProps) {
  return (
    <div className="bg-violet-50/40 rounded-2xl p-4 border border-violet-200">
      <div className="text-[13px] font-bold text-violet-900 mb-1">
        AI 분류 — 변형 선택
      </div>
      <p className="text-[11px] text-violet-700 mb-2">
        {userPrompt.trim()
          ? '위쪽 텍스트가 있으면 자유 편집(generate flow). 변형 선택 시 분류 prompt 가 우선 적용됩니다.'
          : '편집 지시사항 비우고 편집하기 누르면 AI 분류 자동 적용. 변형 선택 시 그쪽이 우선.'}
      </p>
      <RecomposeVariantPicker
        classification={classification}
        onSelect={onSelectVariant}
        layout="detail"
      />
      {selectedVariantKey && (
        <div className="mt-2 text-[11px] font-semibold text-violet-900">
          ✓ 선택됨:{' '}
          {selectedVariantKey === 'with-box'
            ? '박스+상품'
            : selectedVariantKey === 'no-box'
            ? '상품만'
            : '자동 (auto)'}
        </div>
      )}
    </div>
  );
}
