'use client';
import { useState } from 'react';
import { ImageIcon, CheckCircle, Download, ExternalLink, SkipForward, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveImageUrl } from '@/lib/resolve-url';

interface EditorResultPanelProps {
  originalImage: string | null;
  candidates: Array<{ url: string; filename: string }>;
  selectedCandidateUrl: string | null;
  generationId: string | null;
  isApplying: boolean;
  isSkipping: boolean;
  onSelectCandidate: (url: string) => void;
  onCoupang: () => void;
  onSkip: () => void;
}

export function EditorResultPanel({
  originalImage,
  candidates,
  selectedCandidateUrl,
  generationId,
  isApplying,
  isSkipping,
  onSelectCandidate,
  onCoupang,
  onSkip,
}: EditorResultPanelProps) {
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  if (candidates.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mb-4">
          <Sparkles size={28} className="text-purple-300" />
        </div>
        <div className="text-sm font-semibold text-slate-400 mb-1">결과가 여기에 표시됩니다</div>
        <div className="text-xs text-slate-300">왼쪽에서 이미지를 업로드하고 편집을 시작해보세요</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">편집 결과</div>
          <div className="text-xs text-slate-400">{candidates.length}장 생성됨</div>
        </div>

        {/* Before / After 비교 */}
        <div className="flex items-start gap-4">
          {/* Before */}
          {originalImage && (
            <>
              <div className="flex-shrink-0 w-24">
                <div className="text-[10px] font-mono text-slate-400 uppercase mb-1.5">Before</div>
                <div
                  className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50 cursor-zoom-in"
                  onClick={() => setZoomImage(originalImage)}
                >
                  <img
                    src={originalImage}
                    alt="원본"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              <div className="flex items-center self-center text-slate-300 text-lg font-bold flex-shrink-0">→</div>
            </>
          )}

          {/* After - 후보 그리드 */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-slate-400 uppercase mb-1.5">
              After ({candidates.length}장) — 클릭해서 선택
            </div>
            <div className={cn('grid gap-3', candidates.length <= 2 ? 'grid-cols-2' : 'grid-cols-3')}>
              {candidates.map((c, idx) => {
                const url = resolveImageUrl(c.url) ?? '';
                const isSelected = selectedCandidateUrl === url;
                return (
                  <div key={idx} className="flex flex-col gap-1.5">
                    <button
                      onClick={() => onSelectCandidate(isSelected ? '' : url)}
                      className={cn(
                        'relative rounded-xl overflow-hidden transition-all hover:scale-[1.02] w-full',
                        isSelected
                          ? 'ring-[3px] ring-purple-500 shadow-lg shadow-purple-100'
                          : 'ring-1 ring-slate-200 hover:ring-purple-300',
                      )}
                    >
                      <div className="aspect-square bg-slate-100">
                        {url ? (
                          <img
                            src={url}
                            alt={`후보 ${idx + 1}`}
                            className="w-full h-full object-cover cursor-zoom-in"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onClick={(e) => { e.stopPropagation(); setZoomImage(url); }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon size={24} className="text-slate-300" />
                          </div>
                        )}
                      </div>

                      {/* 좌상단 번호 */}
                      <div className="absolute top-1.5 left-1.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/40 text-white text-[10px] font-bold">
                          {String.fromCharCode(65 + idx)}
                        </span>
                      </div>
                    </button>

                    {/* 체크박스 버튼 — 이미지 아래 */}
                    <button
                      onClick={() => onSelectCandidate(isSelected ? '' : url)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-xs font-semibold border-2 transition-all',
                        isSelected
                          ? 'bg-purple-600 border-purple-600 text-white'
                          : 'bg-white border-slate-300 text-slate-400 hover:border-purple-400 hover:text-purple-500',
                      )}
                    >
                      <span className={cn(
                        'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0',
                        isSelected ? 'bg-white border-white' : 'border-slate-300',
                      )}>
                        {isSelected && (
                          <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-purple-600">
                            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                      {isSelected ? '선택됨' : '선택'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 액션 바 */}
        <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
          {/* 쿠팡 등록하러가기 */}
          <button
            onClick={onCoupang}
            disabled={!selectedCandidateUrl || isApplying}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-40 transition-colors"
          >
            {isApplying ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ExternalLink size={13} />
            )}
            쿠팡 등록하러가기
          </button>

          {/* 다운로드 */}
          {selectedCandidateUrl ? (
            <a
              href={selectedCandidateUrl}
              download
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors"
            >
              <Download size={13} /> 다운로드
            </a>
          ) : (
            <span className="flex items-center gap-2 px-3 py-2.5 text-slate-300 rounded-lg text-xs font-medium cursor-not-allowed">
              <Download size={13} /> 다운로드
            </span>
          )}

          {/* 건너뛰기 (DB 레코드 있을 때만) */}
          {generationId && (
            <button
              onClick={onSkip}
              disabled={isSkipping}
              className="flex items-center gap-2 px-3 py-2.5 text-slate-500 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors"
            >
              {isSkipping ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <SkipForward size={13} />
              )}
              건너뛰기
            </button>
          )}

          {!selectedCandidateUrl && (
            <span className="ml-2 text-xs text-slate-400">후보 이미지를 선택하세요</span>
          )}
        </div>
      </div>

      {/* 줌 모달 */}
      {zoomImage && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center cursor-zoom-out"
          onClick={() => setZoomImage(null)}
        >
          <img
            src={zoomImage}
            alt="확대 보기"
            className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </>
  );
}
