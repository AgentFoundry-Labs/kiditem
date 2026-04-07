'use client';
import { useState } from 'react';
import { ImageIcon, Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { ScoreBreakdown } from './ScoreBreakdown';
import { cn } from '@/lib/utils';
import type { ThumbnailAnalysisResult } from '@kiditem/shared';

const GRADE_BG: Record<string, string> = {
  S: 'bg-emerald-500',
  A: 'bg-blue-500',
  B: 'bg-amber-500',
  C: 'bg-orange-500',
  F: 'bg-red-500',
};

interface UploadAnalyzerProps {
  onAnalyzed?: (result: ThumbnailAnalysisResult) => void;
}

export function UploadAnalyzer({ onAnalyzed }: UploadAnalyzerProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [productName, setProductName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<ThumbnailAnalysisResult[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const analyzeUrl = async (url: string, name?: string) => {
    if (!url) return;
    setAnalyzing(true);
    try {
      const data = await apiClient.post<ThumbnailAnalysisResult>('/api/thumbnail-analysis/analyze', {
        imageUrl: url,
        productName: name || '업로드 이미지',
      });
      if (data.grade) {
        setResults((prev) => [data, ...prev]);
        onAnalyzed?.(data);
        toast.success(`${data.grade}등급 (${data.overallScore}점) — Gemini Vision 분류 완료`);
      }
    } catch {
      toast.error('AI 분석 실패');
    } finally {
      setAnalyzing(false);
      setImageUrl('');
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-2xl p-5 bg-white shadow-md border border-slate-200">
            <div className="text-sm font-bold mb-3 text-slate-900">쿠팡 이미지 URL로 분류</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://thumbnail.coupangcdn.com/... 또는 이미지 URL 붙여넣기"
                className="flex-1 px-3 py-2.5 rounded-xl text-sm bg-slate-50 border border-slate-200 text-slate-900"
              />
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="상품명 (선택)"
                className="w-40 px-3 py-2.5 rounded-xl text-sm bg-slate-50 border border-slate-200 text-slate-900"
              />
              <button
                onClick={() => analyzeUrl(imageUrl, productName)}
                disabled={!imageUrl || analyzing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 transition-colors"
              >
                {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                분류
              </button>
            </div>
          </div>

          <div
            className={cn(
              'rounded-2xl p-8 text-center cursor-pointer transition-all shadow-md border-2 border-dashed',
              dragOver ? 'scale-[1.01] bg-purple-50 border-purple-600' : 'bg-white border-slate-200'
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file && file.type.startsWith('image/')) handleFileUpload(file);
            }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.multiple = true;
              input.onchange = () => {
                if (input.files) Array.from(input.files).forEach(handleFileUpload);
              };
              input.click();
            }}
          >
            <ImageIcon size={32} className="mx-auto mb-2 text-slate-300" />
            <div className="text-sm font-semibold text-slate-600">이미지를 드래그하거나 클릭해서 업로드</div>
            <div className="text-xs mt-1 text-slate-400">JPG, PNG 지원 — 쿠팡 Wing에서 이미지를 저장 후 여기에 업로드</div>
          </div>

          {results.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600">분류 결과 ({results.length}개)</div>
              {results.map((r, idx) => (
                <div key={idx} className="rounded-xl p-4 bg-white shadow-sm border border-slate-200">
                  <div className="flex items-start gap-4">
                    {r.imageUrl && (
                      <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0 bg-slate-50">
                        <img src={r.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('px-2 py-0.5 rounded-md text-xs font-black text-white', GRADE_BG[r.grade] || 'bg-slate-500')}>{r.grade}</span>
                        <span className="text-sm font-bold tabular-nums text-slate-900">{r.overallScore}점</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">
                          {r.method === 'ai' ? 'Gemini AI' : '룰 기반'}
                        </span>
                      </div>
                      <div className="text-xs line-clamp-1 text-slate-600">{r.productName}</div>
                      {r.scores && <ScoreBreakdown scores={r.scores} />}
                      <div className="mt-2 space-y-1">
                        {r.issues.filter((i) => i.severity === 'critical').map((issue, i) => (
                          <div key={i} className="text-[11px] text-red-700 bg-red-50 px-2 py-1 rounded">
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl p-5 bg-white shadow-md border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} className="text-purple-600" />
            <span className="text-sm font-bold text-purple-600">Gemini Vision 분류 기준</span>
          </div>
          <div className="space-y-3">
            {[
              { label: '쿠팡 가이드라인', max: 25, color: '#2563eb', items: ['순백색(#FFF) 배경', '상품 85%+ 비율', '워터마크/텍스트 없음', '1:1 정사각형'] },
              { label: '히어로 샷 품질', max: 20, color: '#7c3aed', items: ['30도 틸트 촬영', '소프트박스 조명', '선명도/포커스', '입체감/깊이'] },
              { label: '구도 / 레이아웃', max: 20, color: '#059669', items: ['중앙 정렬', '5-10% 여백', '세트 상품 배치', '그림자 처리'] },
              { label: '브랜드 일관성', max: 15, color: '#d97706', items: ['톤/색감 통일', '레이아웃 반복', '브랜드 인식 형성'] },
              { label: '모바일 매력도', max: 20, color: '#dc2626', items: ['작은 화면 가독성', '상품 대비', '경쟁 상품 대비 차별화', '24pt+ 폰트'] },
            ].map((cat) => (
              <div key={cat.label} className="rounded-xl p-3" style={{ background: `${cat.color}08`, border: `1px solid ${cat.color}15` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold" style={{ color: cat.color }}>{cat.label}</span>
                  <span className="text-[10px] font-bold tabular-nums" style={{ color: cat.color }}>{cat.max}점</span>
                </div>
                <div className="space-y-0.5">
                  {cat.items.map((item, i) => (
                    <div key={i} className="text-[11px] flex items-center gap-1.5 text-slate-600">
                      <div className="w-1 h-1 rounded-full" style={{ background: cat.color }} />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 text-center border-t border-slate-200">
            <div className="text-[11px] font-mono text-slate-400">
              S: 90+ | A: 75+ | B: 60+ | C: 40+ | F: 39-
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
