'use client';
import { Loader2, Wand2, Download, ExternalLink, SkipForward, Sparkles, Scissors } from 'lucide-react';

type EditorMode = 'edit' | 'creative';

interface EditorControlPanelProps {
  mode: EditorMode;
  purpose: 'compliance' | 'quality';
  composition: string;
  userPrompt: string;
  sceneType: string;
  styleType: string;
  productDescription: string;
  isPending: boolean;
  hasInput: boolean;
  selectedCandidateUrl: string | null;
  generationId: string | null;
  isApplying: boolean;
  isSkipping: boolean;
  onPurposeChange: (v: 'compliance' | 'quality') => void;
  onCompositionChange: (v: string) => void;
  onUserPromptChange: (v: string) => void;
  onSceneTypeChange: (v: string) => void;
  onStyleTypeChange: (v: string) => void;
  onProductDescriptionChange: (v: string) => void;
  onGenerate: () => void;
  onCoupang: () => void;
  onSkip: () => void;
}

const primaryColor = { edit: '#8b5cf6', creative: '#d946ef' };

const lightInput: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  color: '#111827',
  borderRadius: 12,
  width: '100%',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
};

export function EditorControlPanel({
  mode,
  purpose,
  composition,
  userPrompt,
  sceneType,
  styleType,
  productDescription,
  isPending,
  hasInput,
  selectedCandidateUrl,
  generationId,
  isApplying,
  isSkipping,
  onPurposeChange,
  onCompositionChange,
  onUserPromptChange,
  onSceneTypeChange,
  onStyleTypeChange,
  onProductDescriptionChange,
  onGenerate,
  onCoupang,
  onSkip,
}: EditorControlPanelProps) {
  const accent = primaryColor[mode];

  return (
    <div
      className="flex flex-col h-full overflow-hidden bg-white"
      style={{ borderLeft: '1px solid #e5e7eb' }}
    >
      {/* 헤더 */}
      <div
        className="flex-shrink-0 px-5 py-3.5 flex items-center gap-2"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        {mode === 'edit' ? <Scissors size={11} style={{ color: accent }} /> : <Sparkles size={11} style={{ color: accent }} />}
        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
          {mode === 'edit' ? '편집 설정' : 'AI 연출 설정'}
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {mode === 'edit' ? (
          <>
            {/* 편집 목적 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">편집 목적</label>
              <div className="flex flex-col gap-2">
                {[
                  { value: 'compliance', label: '가이드라인 수정', sub: '쿠팡 광고 기준 준수', color: accent },
                  { value: 'quality',    label: '품질 개선',       sub: '시각적 완성도 향상', color: accent },
                ].map((opt) => {
                  const active = purpose === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onPurposeChange(opt.value as 'compliance' | 'quality')}
                      className="w-full px-4 py-2.5 rounded-xl text-left transition-all duration-200"
                      style={{
                        background: active ? `${opt.color}12` : '#f9fafb',
                        border: active ? `1px solid ${opt.color}55` : '1px solid #e5e7eb',
                        color: active ? opt.color : '#6b7280',
                      }}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{opt.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 상품 구성 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">
                상품 구성 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <input
                type="text"
                value={composition}
                onChange={(e) => onCompositionChange(e.target.value)}
                placeholder="예: 테트리스 블록 40개 + 나무 프레임 1개"
                style={{ ...lightInput }}
              />
            </div>

            {/* 편집 지시사항 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">
                편집 지시사항 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <textarea
                rows={5}
                value={userPrompt}
                onChange={(e) => onUserPromptChange(e.target.value)}
                placeholder="예: 배경을 순백색으로, 제품이 화면의 75%를 채우도록 확대해주세요."
                style={{ ...lightInput, resize: 'none' }}
              />
              <div className="text-[10px] text-gray-400">구도, 배경, 조명 등 세부 지시사항</div>
            </div>

            <button
              onClick={onGenerate}
              disabled={!hasInput || isPending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-40"
              style={{ background: accent }}
            >
              {isPending ? <><Loader2 size={15} className="animate-spin" /> 편집 중...</> : <><Wand2 size={15} /> 편집 시작</>}
            </button>
          </>
        ) : (
          <>
            {/* 촬영 씬 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">촬영 씬</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'white-studio', emoji: '⬜', label: '화이트 스튜디오' },
                  { value: 'lifestyle',    emoji: '🏠', label: '생활 인테리어' },
                  { value: 'outdoor',      emoji: '🌿', label: '야외 / 자연' },
                  { value: 'concept',      emoji: '✨', label: '컨셉 / 무드' },
                ].map((opt) => {
                  const active = sceneType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onSceneTypeChange(opt.value)}
                      className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl text-xs font-medium transition-all duration-200"
                      style={{
                        background: active ? `${accent}12` : '#f9fafb',
                        border: active ? `1px solid ${accent}55` : '1px solid #e5e7eb',
                        color: active ? accent : '#6b7280',
                      }}
                    >
                      <span className="text-lg">{opt.emoji}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 분위기 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">분위기</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'minimal', label: '미니멀' },
                  { value: 'warm',    label: '따뜻한 생활감' },
                  { value: 'vivid',   label: '선명한 제품샷' },
                  { value: 'luxury',  label: '고급스러운' },
                ].map((opt) => {
                  const active = styleType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onStyleTypeChange(opt.value)}
                      className="px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200"
                      style={{
                        background: active ? `${accent}12` : '#f9fafb',
                        border: active ? `1px solid ${accent}55` : '1px solid #e5e7eb',
                        color: active ? accent : '#6b7280',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 제품 설명 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">
                제품 설명 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <textarea
                rows={3}
                value={productDescription}
                onChange={(e) => onProductDescriptionChange(e.target.value)}
                placeholder="예: 영아용 딸랑이. 파스텔 컬러. 안전 인증 완료."
                style={{ ...lightInput, resize: 'none' }}
              />
            </div>

            {/* 추가 지시사항 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-gray-600">
                추가 지시사항 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <textarea
                rows={3}
                value={userPrompt}
                onChange={(e) => onUserPromptChange(e.target.value)}
                placeholder="예: 아이가 장난감을 쥐고 있는 손 클로즈업"
                style={{ ...lightInput, resize: 'none' }}
              />
            </div>

            <button
              onClick={onGenerate}
              disabled={!hasInput || isPending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-40"
              style={{ background: accent }}
            >
              {isPending ? <><Loader2 size={15} className="animate-spin" /> 생성 중...</> : <><Sparkles size={15} /> AI 연출 생성</>}
            </button>
          </>
        )}

        {!hasInput && (
          <p className="text-center text-xs text-gray-400">왼쪽에서 이미지를 업로드하세요</p>
        )}
      </div>

      {/* 결과 처리 */}
      {generationId && (
        <div
          className="flex-shrink-0 px-5 py-4 space-y-2 bg-gray-50"
          style={{ borderTop: '1px solid #e5e7eb' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2 text-gray-400">
            결과 처리
          </div>

          <button
            onClick={onCoupang}
            disabled={!selectedCandidateUrl || isApplying}
            className="w-full flex items-center justify-center gap-2 text-white rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-40"
            style={{ background: accent }}
          >
            {isApplying ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            쿠팡 등록하러가기
          </button>

          {selectedCandidateUrl ? (
            <a
              href={selectedCandidateUrl}
              download target="_blank" rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}
            >
              <Download size={14} /> 다운로드
            </a>
          ) : (
            <div
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium opacity-30 cursor-not-allowed"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
            >
              <Download size={14} /> 다운로드
            </div>
          )}

          <button
            onClick={onSkip}
            disabled={isSkipping}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-40 text-gray-400"
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {isSkipping ? <Loader2 size={14} className="animate-spin" /> : <SkipForward size={14} />}
            건너뛰기
          </button>

          {!selectedCandidateUrl && (
            <p className="text-center text-[11px] text-gray-400">가운데에서 이미지를 선택하세요</p>
          )}
        </div>
      )}
    </div>
  );
}
