'use client';
import { useState } from 'react';
import { Download, ArrowRight, ImageIcon, Save, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { resolveImageUrl } from '@/app/thumbnails/lib/resolve-url';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';

interface EditorResultProps {
  originalImage: string | null;
  candidates: Array<{ url: string; filename: string }>;
  productId?: string | null;
}

export function EditorResult({ originalImage, candidates, productId }: EditorResultProps) {
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  const handleSaveToHub = async (url: string) => {
    if (!productId) return;
    if (savedUrls.has(url)) return;
    if (saving !== null) return;

    setSaving(url);
    try {
      // 서버가 파일 복사 + Product.images append를 원자적으로 처리
      await apiClient.post(`/api/products/${productId}/images/save-from-url`, {
        url,
        role: 'product',
        label: 'AI 편집 결과',
      });
      setSavedUrls((prev) => new Set(prev).add(url));
      toast.success('허브에 저장되었습니다');
    } catch (err: unknown) {
      if (isApiError(err)) toast.error(err.detail);
      else toast.error('이미지 저장 실패');
    } finally {
      setSaving(null);
    }
  };

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
                const isSaved = savedUrls.has(c.url);
                const isSavingThis = saving === c.url;
                const saveDisabled = saving !== null || isSaved;
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
                    <div className="flex gap-1">
                      <a
                        href={url}
                        download={c.filename}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                      >
                        <Download size={12} /> 다운로드
                      </a>
                      {productId && (
                        <button
                          onClick={() => handleSaveToHub(c.url)}
                          disabled={saveDisabled}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                            isSaved
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'text-purple-600 hover:bg-purple-50 disabled:opacity-40 disabled:hover:bg-transparent'
                          }`}
                        >
                          {isSavingThis ? (
                            <><Loader2 size={12} className="animate-spin" /> 저장 중</>
                          ) : isSaved ? (
                            <><Check size={12} /> 저장됨</>
                          ) : (
                            <><Save size={12} /> 허브에 저장</>
                          )}
                        </button>
                      )}
                    </div>
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
