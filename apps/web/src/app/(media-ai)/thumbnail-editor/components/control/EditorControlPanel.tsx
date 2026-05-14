'use client';
import { Loader2, Wand2, ExternalLink, Sparkles, Scissors, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EditUseCase } from './UseCaseSelection';

import type { EditorMode } from '../../edit/page';
import type { LayoutKindLite } from '../../edit/lib/slots';
import { LayoutSelector } from './LayoutSelector';

function CoupangWordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 104 20" fill="none" className={className} aria-label="coupang">
      <text
        x="0"
        y="17"
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        fontWeight={900}
        fontSize="20"
        letterSpacing="-0.04em"
        fill="#e94d4d"
      >
        coupang
      </text>
      <circle cx="97" cy="4.5" r="2.5" fill="#e94d4d" />
    </svg>
  );
}

interface Props {
  mode: EditorMode;
  editCase: EditUseCase | null;
  pieceCount: number | null;
  layout: LayoutKindLite;
  userPrompt: string;
  sceneType: string;
  styleType: string;
  productDescription: string;
  isPending: boolean;
  hasInput: boolean;
  selectedCandidateUrl: string | null;
  generationId: string | null;
  isApplying: boolean;
  onPieceCountChange: (v: number | null) => void;
  onLayoutChange: (v: LayoutKindLite) => void;
  onUserPromptChange: (v: string) => void;
  onSceneTypeChange: (v: string) => void;
  onStyleTypeChange: (v: string) => void;
  onProductDescriptionChange: (v: string) => void;
  onGenerateImageOnly: () => void;
  onGenerate: () => void;
  onCoupang: () => void;
  onReEditFromSelected: () => void;
  /** 편집 지시사항 textarea 바로 아래에 들어가는 추가 영역 (RecomposeVariantPicker 등). */
  recomposeSlot?: React.ReactNode;
}

const SCENE_PRESETS = [
  { value: 'white-studio', label: '화이트 스튜디오' },
  { value: 'lifestyle', label: '생활 인테리어' },
  { value: 'outdoor', label: '야외 / 자연' },
  { value: 'concept', label: '컨셉 / 무드' },
  { value: 'custom-reference', label: '사용자 정의 이미지' },
] as const;

const STYLE_PRESETS = [
  { value: 'minimal', label: '미니멀' },
  { value: 'warm', label: '따뜻한 생활감' },
  { value: 'vivid', label: '선명한 제품샷' },
  { value: 'luxury', label: '고급스러운' },
] as const;

const INPUT_CLASS =
  'w-full bg-[#f2f4f6] rounded-xl px-4 py-3 text-[14px] font-medium text-gray-900 placeholder:text-gray-400 outline-none border-0 focus:bg-white focus:ring-2 focus:ring-violet-500/40 transition-all';

export function EditorControlPanel({
  mode,
  editCase,
  pieceCount,
  layout,
  userPrompt,
  sceneType,
  styleType,
  productDescription,
  isPending,
  hasInput,
  selectedCandidateUrl,
  generationId,
  isApplying,
  onPieceCountChange,
  onLayoutChange,
  onUserPromptChange,
  onSceneTypeChange,
  onStyleTypeChange,
  onProductDescriptionChange,
  onGenerateImageOnly,
  onGenerate,
  onCoupang,
  onReEditFromSelected,
  recomposeSlot,
}: Props) {
  const generateDisabled = !hasInput || isPending;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="flex-shrink-0 px-5 pt-6 pb-3">
        <div className="flex items-center gap-2">
          {mode === 'edit' ? <Scissors size={14} className="text-violet-600" /> : <Sparkles size={14} className="text-fuchsia-600" />}
          <h2 className="text-[15px] font-bold text-[var(--text-primary)]">
            {mode === 'edit' ? '편집 설정' : 'AI 연출 설정'}
          </h2>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 pt-1 pb-3 bg-white">
        <div className="mb-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
              <Wand2 size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-extrabold text-violet-950">
                이미지만으로 바로 생성
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-violet-700">
                아래 세부 설정과 지시사항을 무시하고, 업로드한 이미지 기준으로 썸네일을 만듭니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGenerateImageOnly}
            disabled={generateDisabled}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[13px] font-bold text-violet-700 shadow-sm ring-1 ring-violet-200 transition-all hover:bg-violet-600 hover:text-white disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-violet-700"
          >
            {isPending ? (
              <><Loader2 size={15} className="animate-spin" /> 생성 중</>
            ) : (
              <><Wand2 size={15} /> 이미지로만 생성</>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={generateDisabled}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-[15px] font-bold text-white transition-all disabled:opacity-40 bg-violet-600 hover:bg-violet-700 active:scale-[0.99]"
        >
          {isPending ? (
            <><Loader2 size={16} className="animate-spin" /> {mode === 'edit' ? '편집 중' : '생성 중'}</>
          ) : (
            <>
              {mode === 'edit' ? <Wand2 size={16} /> : <Sparkles size={16} />}
              {mode === 'edit' ? '편집하기' : 'AI 연출 생성'}
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {mode === 'edit' ? (
          <>
            {editCase === 'compose' && (
              <div className="bg-white rounded-2xl p-4">
                <label className="block text-[13px] font-bold text-gray-900 mb-2">
                  개입 수 <span className="text-gray-400 font-normal">선택</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={pieceCount ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onPieceCountChange(v === '' ? null : Math.max(1, parseInt(v, 10) || 1));
                  }}
                  placeholder="예: 3"
                  className={INPUT_CLASS}
                />
                <p className="text-[12px] text-gray-500 mt-2">세트·묶음 수량 (예: 3개입)</p>
              </div>
            )}

            {(editCase === 'color-variants' || editCase === 'bundle' || (editCase === 'compose' && pieceCount && pieceCount >= 2)) && (
              <div className="bg-white rounded-2xl p-4">
                <LayoutSelector value={layout} onChange={onLayoutChange} />
              </div>
            )}

            <div className="bg-white rounded-2xl p-4">
              <label className="block text-[13px] font-bold text-gray-900 mb-2">
                편집 지시사항 <span className="text-gray-400 font-normal">선택</span>
              </label>
              <textarea
                rows={4}
                value={userPrompt}
                onChange={(e) => onUserPromptChange(e.target.value)}
                placeholder="예: 배경을 순백색으로, 제품이 화면의 75%를 채우도록"
                className={cn(INPUT_CLASS, 'resize-none')}
              />
            </div>

            {/* AI 분류 picker 등 — 편집 지시사항 바로 아래 영역 */}
            {recomposeSlot}
          </>
        ) : (
          <>
            <div className="bg-white rounded-2xl p-4">
              <label className="block text-[13px] font-bold text-gray-900 mb-2.5">촬영 씬</label>
              <div className="grid grid-cols-2 gap-2">
                {SCENE_PRESETS.slice(0, 4).map((opt) => {
                  const active = sceneType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onSceneTypeChange(opt.value)}
                      className={cn(
                        'px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all',
                        active
                          ? 'bg-violet-600 text-white'
                          : 'bg-[#f2f4f6] text-gray-700 hover:bg-gray-200/60',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {(() => {
                const opt = SCENE_PRESETS[4];
                const active = sceneType === opt.value;
                return (
                  <button
                    type="button"
                    onClick={() => onSceneTypeChange(opt.value)}
                    className={cn(
                      'w-full mt-2 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all',
                      active
                        ? 'bg-violet-600 text-white'
                        : 'bg-[#f2f4f6] text-gray-700 hover:bg-gray-200/60',
                    )}
                  >
                    🖼️ {opt.label}
                  </button>
                );
              })()}
            </div>

            <div className="bg-white rounded-2xl p-4">
              <label className="block text-[13px] font-bold text-gray-900 mb-2.5">분위기</label>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_PRESETS.map((opt) => {
                  const active = styleType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onStyleTypeChange(opt.value)}
                      className={cn(
                        'px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all',
                        active
                          ? 'bg-violet-600 text-white'
                          : 'bg-[#f2f4f6] text-gray-700 hover:bg-gray-200/60',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4">
              <label className="block text-[13px] font-bold text-gray-900 mb-2">
                제품 설명 <span className="text-gray-400 font-normal">선택</span>
              </label>
              <textarea
                rows={3}
                value={productDescription}
                onChange={(e) => onProductDescriptionChange(e.target.value)}
                placeholder="예: 영아용 딸랑이. 파스텔 컬러. 안전 인증 완료."
                className={cn(INPUT_CLASS, 'resize-none')}
              />
            </div>

            <div className="bg-white rounded-2xl p-4">
              <label className="block text-[13px] font-bold text-gray-900 mb-2">
                추가 지시사항 <span className="text-gray-400 font-normal">선택</span>
              </label>
              <textarea
                rows={3}
                value={userPrompt}
                onChange={(e) => onUserPromptChange(e.target.value)}
                placeholder="예: 아이가 장난감을 쥐고 있는 손 클로즈업"
                className={cn(INPUT_CLASS, 'resize-none')}
              />
            </div>
          </>
        )}

        {!hasInput && (
          <p className="text-center text-[12px] text-gray-400 py-2">
            왼쪽에서 이미지를 업로드하세요
          </p>
        )}
      </div>

      {generationId && (
        <div className="flex-shrink-0 px-4 pb-4 pt-3 space-y-2 bg-gray-50 border-t border-gray-200">
          <div className="pb-1">
            <h3 className="text-[14px] font-bold text-gray-900">완료 처리</h3>
            <p className="text-[12px] text-gray-500 mt-0.5">
              선택한 이미지로 이어서 편집하거나 쿠팡에 적용하세요
            </p>
          </div>

          <button
            type="button"
            onClick={onReEditFromSelected}
            disabled={!selectedCandidateUrl || isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-bold transition-all disabled:opacity-40 bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 active:scale-[0.99]"
            title="선택한 결과 이미지를 다음 생성의 시작점으로 사용"
          >
            <RotateCcw size={15} />
            선택 이미지로 재편집
          </button>

          <button
            type="button"
            onClick={onCoupang}
            disabled={!selectedCandidateUrl || isApplying}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl text-[15px] font-bold text-white transition-all disabled:opacity-40 bg-black hover:bg-neutral-800 active:scale-[0.99]"
          >
            {isApplying ? (
              <><Loader2 size={16} className="animate-spin" /> 적용 중</>
            ) : (
              <>
                <CoupangWordmark className="h-4 w-auto" />
                <span className="text-white/90">Wing에 적용</span>
                <ExternalLink size={14} className="text-white/60" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
