'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { useProductImages } from '../_shared/hooks/useProductImages';
import GenerateResult from './components/GenerateResult';
import ProductInputSection from './components/ProductInputSection';
import CategorySelect from './components/CategorySelect';
import GenerateLoadingOverlay from './components/GenerateLoadingOverlay';
import GeneratePageHeader from './components/GeneratePageHeader';
import GenerateSubmitButton from './components/GenerateSubmitButton';

async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = url.startsWith('/') ? await apiClient.fetchRaw(url) : await fetch(url);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function GeneratePage() {
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const { images: savedImages, loading: imagesLoading } = useProductImages(productId);

  const [mode, setMode] = useState<'url' | 'image'>('url');
  const [url, setUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 허브 이미지 프리로드: productId로 진입 시 저장된 이미지를 base64로 변환
  useEffect(() => {
    if (savedImages.length === 0) return;
    setMode('image');

    Promise.all(savedImages.map((img) => imageUrlToBase64(img.url))).then(
      (results) => {
        const valid = results.filter((r): r is string => r !== null);
        if (valid.length > 0) setImages(valid);
      },
    );
  }, [savedImages]);

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
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      <GeneratePageHeader />

      {error && (
        <div className="max-w-4xl mx-auto w-full px-8 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
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
          imagesLoading={imagesLoading}
        />

        <CategorySelect category={category} setCategory={setCategory} />

        <GenerateSubmitButton isLoading={isLoading} isFormValid={isFormValid} onSubmit={handleSubmit} />
      </div>

      {isLoading && <GenerateLoadingOverlay />}
    </div>
  );
}
