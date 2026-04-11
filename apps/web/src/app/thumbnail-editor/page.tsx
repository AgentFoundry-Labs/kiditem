'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Wand2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { useGenerateThumbnail } from './hooks/useThumbnailEditor';
import { ImageUploader } from './components/ImageUploader';
import { EditorResult } from './components/EditorResult';

export default function ThumbnailEditorPage() {
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');

  const [productName, setProductName] = useState('');
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [packagingImage, setPackagingImage] = useState<string | null>(null);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [composition, setComposition] = useState('');
  const [purpose, setPurpose] = useState<'compliance' | 'quality'>('compliance');
  const [result, setResult] = useState<Array<{ url: string; filename: string }>>([]);

  const generateMutation = useGenerateThumbnail();

  // productId가 있으면 상품 정보 로드
  useEffect(() => {
    if (!productId) return;
    apiClient.get<{ id: string; name: string; imageUrl: string | null }>(`/api/products/${productId}`).then((product) => {
      if (product) {
        setProductName(product.name);
        setOriginalImageUrl(product.imageUrl);
      }
    }).catch(() => {});
  }, [productId]);

  const handleGenerate = async () => {
    try {
      const data = await generateMutation.mutateAsync({
        productId: productId ?? undefined,
        packagingImageUrl: packagingImage ?? undefined,
        productImageUrl: productImage ?? undefined,
        composition: composition || undefined,
        purpose,
      });
      if (data?.candidates) {
        setResult(data.candidates);
        toast.success(`썸네일 ${data.candidates.length}장 생성 완료`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '썸네일 생성 실패');
    }
  };

  const hasInput = !!productId || !!packagingImage || !!productImage;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center">
          <Sparkles size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">썸네일 편집기</h1>
          <p className="text-xs text-slate-400">
            {productName ? productName : '상품 이미지를 업로드하여 쿠팡 가이드라인에 맞는 썸네일을 생성합니다'}
          </p>
        </div>
      </div>

      {/* 입력 영역 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
        {/* 원본 이미지 (productId로 진입 시) */}
        {originalImageUrl && (
          <div className="space-y-1.5">
            <div className="text-sm font-semibold text-slate-700">원본 상품 이미지</div>
            <div className="w-48 aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <img src={originalImageUrl} alt={productName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
          </div>
        )}

        {/* 이미지 업로드 */}
        <div className="grid grid-cols-2 gap-6">
          <ImageUploader
            label="상품 포장 사진"
            description="패키지 박스, 포장 상태"
            value={packagingImage}
            onChange={setPackagingImage}
          />
          <ImageUploader
            label="상품 사진"
            description="실제 상품 모습"
            value={productImage}
            onChange={setProductImage}
          />
        </div>

        {/* 상품 구성 */}
        <div className="space-y-1.5">
          <div className="text-sm font-semibold text-slate-700">상품 구성</div>
          <input
            type="text"
            value={composition}
            onChange={(e) => setComposition(e.target.value)}
            placeholder="예: 테트리스 블록 40개 + 나무 프레임 1개"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          />
        </div>

        {/* 편집 목적 */}
        <div className="space-y-1.5">
          <div className="text-sm font-semibold text-slate-700">편집 목적</div>
          <div className="flex gap-2">
            <button
              onClick={() => setPurpose('compliance')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                purpose === 'compliance'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              가이드라인 수정
            </button>
            <button
              onClick={() => setPurpose('quality')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                purpose === 'quality'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              품질 개선
            </button>
          </div>
        </div>

        {/* 편집 시작 */}
        <button
          onClick={handleGenerate}
          disabled={!hasInput || generateMutation.isPending}
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> 편집 중...
            </>
          ) : (
            <>
              <Wand2 size={16} /> 편집 시작
            </>
          )}
        </button>
      </div>

      {/* 결과 */}
      {result.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <EditorResult
            originalImage={originalImageUrl}
            candidates={result}
          />
        </div>
      )}
    </div>
  );
}
