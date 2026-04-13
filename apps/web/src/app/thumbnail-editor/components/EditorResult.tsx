'use client';
import { useState } from 'react';
import { Download, ArrowRight, ImageIcon } from 'lucide-react';
import { resolveImageUrl } from '@/lib/resolve-url';

interface EditorResultProps {
  originalImage: string | null;
  candidates: Array<{ url: string; filename: string }>;
}

export function EditorResult({ originalImage, candidates }: EditorResultProps) {
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  return (
    <>
      {zoomImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 cursor-zoom-out"
          onClick={() => setZoomImage(null)}
        >
          <img src={zoomImage} alt="확대" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" referrerPolicy="no-referrer" />
        </div>
      )}

      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-700">편집 결과</div>
        <div className="flex items-start gap-4">
          {originalImage && (
            <>
              <div className="flex-shrink-0">
                <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">Before</div>
                <div
                  className="w-48 aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50 cursor-zoom-in"
                  onClick={() => setZoomImage(originalImage)}
                >
                  <img src={originalImage} alt="원본" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              </div>
              <div className="flex items-center pt-20 flex-shrink-0">
                <ArrowRight size={20} className="text-slate-300" />
              </div>
            </>
          )}
          <div className="flex-1">
            <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">After ({candidates.length}장)</div>
            <div className="grid grid-cols-2 gap-2">
              {candidates.map((c, i) => {
                const url = resolveImageUrl(c.url) ?? '';
                return (
                  <div key={i} className="space-y-1">
                    <div
                      className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50 cursor-zoom-in hover:border-purple-400 transition-colors"
                      onClick={() => setZoomImage(url)}
                    >
                      {url ? (
                        <img src={url} alt={`결과 ${i + 1}`} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><ImageIcon size={32} className="text-slate-300" /></div>
                      )}
                    </div>
                    <a
                      href={url}
                      download={c.filename}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      <Download size={12} /> 다운로드
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
