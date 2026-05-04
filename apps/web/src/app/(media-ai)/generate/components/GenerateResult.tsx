'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Sparkles } from 'lucide-react';

type GenerateResultData = {
  html?: string;
  templateId?: string;
  productName?: string;
  raw?: unknown;
};

interface GenerateResultProps {
  result: GenerateResultData;
  onReset: () => void;
  onNewCreate: () => void;
}

export default function GenerateResult({ result, onReset, onNewCreate }: GenerateResultProps) {
  const router = useRouter();
  const html = typeof result.html === 'string' ? result.html : null;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
        <button
          onClick={onReset}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold transition-colors"
        >
          <ArrowLeft size={20} />
          다시 만들기
        </button>
        <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
          <Sparkles size={16} />
          AI GENERATED
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {html ? (
          <div className="flex h-full min-h-[720px] flex-col gap-4">
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                  <CheckCircle2 size={18} />
                  상세페이지 생성 완료
                </div>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {String(result.productName ?? '직접 생성 상세페이지')} · {String(result.templateId ?? 'simple-vertical')}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onNewCreate}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-bold text-xs hover:bg-slate-50 transition-colors"
                >
                  새로 만들기
                </button>
                <button
                  onClick={() => router.push('/sourcing')}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-bold text-xs hover:bg-emerald-600 transition-colors"
                >
                  수집상품 목록
                </button>
              </div>
            </div>
            <iframe
              title="생성된 상세페이지 미리보기"
              srcDoc={html}
              className="h-full min-h-[720px] w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
            />
          </div>
        ) : (
        <div className="mx-auto card max-w-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="text-emerald-500" size={24} />
            <h2 className="text-xl font-bold text-slate-900">
              AI 분석 완료!
            </h2>
          </div>
          <p className="text-sm text-slate-500 mb-6">
            AI 분석 결과가 생성되었습니다. 상세 편집은 수집상품 페이지에서 확인하세요.
          </p>
          <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 overflow-auto max-h-[400px]">
            {JSON.stringify(result, null, 2)}
          </pre>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => router.push('/sourcing')}
              className="px-6 py-2.5 bg-emerald-500 text-white rounded-lg font-bold text-sm hover:bg-emerald-600 transition-colors"
            >
              수집상품 목록으로
            </button>
            <button
              onClick={onNewCreate}
              className="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors"
            >
              새로 만들기
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
