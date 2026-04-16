'use client';
import { useState } from 'react';
import { ImageIcon, CheckCircle, Loader2, Sparkles, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveImageUrl } from '@/lib/resolve-url';

import type { EditorMode } from '../page';

interface EditorResultPanelProps {
  mode: EditorMode;
  originalImage: string | null;
  candidates: Array<{ url: string; filename: string }>;
  selectedCandidateUrl: string | null;
  isGenerating?: boolean;
  onSelectCandidate: (url: string) => void;
}

const accentColor = { edit: '#a78bfa', creative: '#e879f9' };

export function EditorResultPanel({
  mode,
  originalImage,
  candidates,
  selectedCandidateUrl,
  isGenerating,
  onSelectCandidate,
}: EditorResultPanelProps) {
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const accent = accentColor[mode];

  if (isGenerating && candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50">
        <Loader2 size={32} className="animate-spin mb-4" style={{ color: accent }} />
        <div className="text-sm font-semibold text-gray-700">
          {mode === 'edit' ? '이미지 편집 중...' : 'AI 연출 생성 중...'}
        </div>
        <div className="text-xs mt-1 text-gray-400">잠시만 기다려주세요</div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
          style={{ background: '#f3f4f6', border: '1px solid #e5e7eb' }}
        >
          {mode === 'edit'
            ? <Scissors size={32} style={{ color: accent }} />
            : <Sparkles size={32} style={{ color: accent }} />
          }
        </div>
        <div className="text-sm font-bold mb-1 text-gray-600">결과가 여기에 표시됩니다</div>
        <div className="text-xs text-gray-400">
          {mode === 'edit' ? '오른쪽에서 설정하고 편집을 시작하세요' : '씬을 설정하고 생성을 시작하세요'}
        </div>
      </div>
    );
  }

  const selectedUrl = selectedCandidateUrl ?? resolveImageUrl(candidates[0].url) ?? '';

  return (
    <>
      <div className="flex flex-col h-full bg-gray-50">
        {/* 헤더 */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 bg-white"
          style={{ borderBottom: '1px solid #e5e7eb' }}
        >
          <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
            생성 결과
          </div>
          <div className="text-xs text-gray-400">{candidates.length}장 생성됨</div>
        </div>

        {/* 메인 이미지 */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-5">
          {selectedUrl ? (
            <img
              src={selectedUrl}
              alt="선택된 이미지"
              className="object-contain rounded-2xl cursor-zoom-in"
              style={{
                maxWidth: '420px',
                maxHeight: '420px',
                width: '100%',
                height: '100%',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px #e5e7eb',
              }}
              referrerPolicy="no-referrer"
              onClick={() => setZoomImage(selectedUrl)}
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <ImageIcon size={40} className="text-gray-300" />
            </div>
          )}
        </div>

        {/* 하단 후보 strip */}
        <div
          className="flex-shrink-0 flex items-center gap-3 px-5 py-3 overflow-x-auto bg-white"
          style={{ borderTop: '1px solid #e5e7eb' }}
        >
          {originalImage && (
            <>
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div
                  className="w-14 h-14 rounded-xl overflow-hidden cursor-zoom-in"
                  style={{ border: '1px solid #e5e7eb' }}
                  onClick={() => setZoomImage(originalImage)}
                >
                  <img src={originalImage} alt="원본" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <span className="text-[10px] text-gray-400">원본</span>
              </div>
              <span className="text-base font-bold flex-shrink-0 text-gray-300">→</span>
            </>
          )}

          {candidates.map((c, idx) => {
            const url = resolveImageUrl(c.url) ?? '';
            const isSelected = selectedCandidateUrl === url;
            return (
              <div key={idx} className="flex flex-col items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onSelectCandidate(isSelected ? '' : url)}
                  className={cn('relative w-14 h-14 rounded-xl overflow-hidden transition-all duration-200', isSelected ? 'scale-110' : 'hover:scale-105')}
                  style={{
                    boxShadow: isSelected
                      ? `0 0 0 2.5px ${accent}, 0 4px 16px rgba(0,0,0,0.12)`
                      : '0 0 0 1px #e5e7eb',
                  }}
                >
                  {url ? (
                    <img src={url} alt={`후보 ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <ImageIcon size={16} className="text-gray-300" />
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute inset-0 flex items-end justify-center pb-0.5">
                      <CheckCircle size={14} className="drop-shadow" style={{ color: accent }} />
                    </div>
                  )}
                </button>
                <span className="text-[10px] text-gray-400">{String.fromCharCode(65 + idx)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {zoomImage && (
        <div className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center cursor-zoom-out" onClick={() => setZoomImage(null)}>
          <img src={zoomImage} alt="확대 보기" className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain" referrerPolicy="no-referrer" />
        </div>
      )}
    </>
  );
}
