'use client';

import { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import GenerateResult from './components/GenerateResult';
import ProductInputSection from './components/ProductInputSection';
import CategorySelect from './components/CategorySelect';
import GenerateLoadingOverlay from './components/GenerateLoadingOverlay';

export default function GeneratePage() {
  const [mode, setMode] = useState<'url' | 'image'>('url');
  const [url, setUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFormValid = mode === 'url' ? url.trim() !== '' : images.length > 0;

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { category: category || null };
      if (mode === 'url' && url) {
        body.url = url;
      } else if (mode === 'image' && images.length > 0) {
        body.imageBase64s = images;
      }

      const data = await apiClient.post<Record<string, unknown>>('/api/content/analyze-product', body);
      setResult(data);
    } catch (err) {
      setError(
        isApiError(err)
          ? err.detail
          : '상세페이지 생성 중 오류가 발생했습니다.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (result) {
    return (
      <GenerateResult
        result={result}
        onReset={() => setResult(null)}
        onNewCreate={() => {
          setResult(null);
          setUrl('');
          setImages([]);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto">
      <div className="bg-white border-b border-gray-200 px-8 py-10">
        <div className="max-w-4xl mx-auto flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Sparkles className="text-blue-600" size={24} />
              </div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                AI 상세페이지 생성
              </h1>
            </div>
            <p className="text-gray-500 text-lg max-w-2xl leading-relaxed">
              상품 URL이나 이미지를 등록하시면, AI가 외국어를 완벽히 번역하고
              타겟 고객에 맞춘 프리미엄 마케팅 문구를 자동으로 작성합니다.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-4xl mx-auto w-full px-8 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 max-w-4xl mx-auto w-full p-8 space-y-8">
        <ProductInputSection
          mode={mode}
          setMode={setMode}
          url={url}
          setUrl={setUrl}
          images={images}
          setImages={setImages}
        />

        <CategorySelect category={category} setCategory={setCategory} />

        <div className="pt-4 pb-12 flex flex-col gap-4 items-center max-w-md mx-auto">
          <button
            onClick={handleSubmit}
            disabled={isLoading || !isFormValid}
            className={`w-full py-5 rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-3 ${
              isLoading
                ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                : !isFormValid
                  ? 'bg-gray-800 text-gray-400 cursor-not-allowed opacity-50'
                  : 'bg-gray-900 text-white hover:bg-gray-800 shadow-xl shadow-gray-200 active:scale-[0.98]'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 size={24} className="animate-spin" />
                AI 분석 및 디자인 중...
              </>
            ) : (
              <>
                <Sparkles
                  size={24}
                  className={isFormValid ? 'text-blue-400' : ''}
                />
                AI 상세페이지 자동 생성
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading && <GenerateLoadingOverlay />}
    </div>
  );
}
