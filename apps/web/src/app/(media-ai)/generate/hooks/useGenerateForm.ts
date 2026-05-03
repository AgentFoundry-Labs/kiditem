'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE } from '@/lib/api';
import { isApiError } from '@/lib/api-error';
import { useProductImages } from '@/hooks/useProductImages';
import { useKidsPlayfulGenerate } from './useKidsPlayfulGenerate';
import { buildSimpleVerticalHtml } from '../lib/build-simple-vertical-html';
import { imageUrlToBase64 } from '../lib/image-base64';
import {
  adaptSimpleVerticalToDetailPageData,
  type SimpleVerticalGeneration,
} from '../lib/simple-vertical-types';

export type GenerateMode = 'url' | 'image';

export interface GeneratedDetailPageResult {
  kind: 'detail-page';
  templateId: string;
  generationId: string;
  productName: string;
  html: string;
  raw: unknown;
}

export function useGenerateForm() {
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const { images: savedImages, loading: imagesLoading } = useProductImages(productId);
  const detailPageMutation = useKidsPlayfulGenerate();

  const [mode, setMode] = useState<GenerateMode>('url');
  const [url, setUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GeneratedDetailPageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (savedImages.length === 0) return;
    setMode('image');
    Promise.all(savedImages.map((img) => imageUrlToBase64(img.url))).then((results) => {
      const valid = results.filter((r): r is string => r !== null);
      if (valid.length > 0) setImages(valid);
    });
  }, [savedImages]);

  const isFormValid = mode === 'url' ? url.trim() !== '' : images.length > 0;

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const imageUrls = mode === 'image' ? images : [url.trim()].filter(Boolean);
      const categoryLabel = category.trim() || '키즈 상품';
      const rawTitle =
        mode === 'image'
          ? `${categoryLabel} 직접 업로드 상품`
          : `${categoryLabel} URL 입력 상품`;
      const rawDescription =
        mode === 'image'
          ? '사용자가 직접 업로드한 상품 이미지 기반으로 상세페이지를 생성합니다.'
          : `사용자가 입력한 상품 URL 기반으로 상세페이지를 생성합니다.\n${url.trim()}`;

      const data = await detailPageMutation.mutateAsync({
        rawTitle,
        rawCategory: categoryLabel,
        rawDescription,
        rawOptions: '',
        imageUrls,
        heroImageMode: 'llm-pick',
        templateId: 'simple-vertical',
      });
      const detailData = adaptSimpleVerticalToDetailPageData(
        data.result as unknown as SimpleVerticalGeneration,
        data.imageUrls,
        data.processedImages,
        API_BASE,
      );
      setResult({
        kind: 'detail-page',
        templateId: data.templateId,
        generationId: data.id,
        productName: data.productName,
        html: buildSimpleVerticalHtml(detailData),
        raw: data,
      });
    } catch (err) {
      setError(isApiError(err) ? err.detail : '상세페이지 생성 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => setResult(null);
  const newCreate = () => {
    setResult(null);
    setUrl('');
    setImages([]);
  };

  return {
    mode,
    setMode,
    url,
    setUrl,
    images,
    setImages,
    category,
    setCategory,
    isLoading,
    result,
    error,
    setError,
    isFormValid,
    imagesLoading,
    handleSubmit,
    reset,
    newCreate,
  };
}
