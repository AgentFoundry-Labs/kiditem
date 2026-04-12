'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Wand2, Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { API_BASE } from '@/lib/api';
import { useProductImages } from '@/hooks/useProductImages';
import { ProductSelector } from '@/components/product/ProductSelector';
import { useGenerateThumbnail } from './hooks/useThumbnailEditor';
import { useOriginalImage } from './hooks/useOriginalImage';
import { ImageUploader } from './components/ImageUploader';
import { EditorResult } from './components/EditorResult';

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const res = url.startsWith('/') ? await apiClient.fetchRaw(url) : await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function ThumbnailEditorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialProductId = searchParams.get('productId');

  const [productId, setProductId] = useState<string | null>(initialProductId);
  const [productName, setProductName] = useState('');
  const [productSku, setProductSku] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [packagingImage, setPackagingImage] = useState<string | null>(null);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [isProductImageFromOriginal, setIsProductImageFromOriginal] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [pieceCount, setPieceCount] = useState<number | ''>('');
  const [colorCount, setColorCount] = useState<number | ''>('');
  const [purpose, setPurpose] = useState<'compliance' | 'quality'>('compliance');
  const [result, setResult] = useState<Array<{ url: string; filename: string }>>([]);

  const generateMutation = useGenerateThumbnail();
  const { images: hubImages, loading: hubLoading } = useProductImages(productId);
  const { data: originalImageData, isFetching: originalLoading } = useOriginalImage(productId);

  const boxImages = hubImages.filter((img) => img.role === 'box');
  const productImages = hubImages.filter((img) => img.role === 'product');

  // productId가 있으면 상품 정보 로드
  useEffect(() => {
    if (!productId) {
      setProductName('');
      setProductSku(null);
      setOriginalImageUrl(null);
      return;
    }
    apiClient.get<{ id: string; name: string; sku: string | null; imageUrl: string | null }>(`/api/products/${productId}`).then((product) => {
      if (product) {
        setProductName(product.name);
        setProductSku(product.sku);
        setOriginalImageUrl(product.imageUrl);
      }
    }).catch(() => {});
  }, [productId]);

  const handleSelectProduct = (product: { id: string; name: string; imageUrl: string | null; sku: string | null }) => {
    setProductId(product.id);
    // 편집기 state 초기화 (이전 선택 상품 데이터 제거)
    setPackagingImage(null);
    setProductImage(null);
    setIsProductImageFromOriginal(false);
  };

  // 원본 이미지 로드 완료 시 자동 할당
  useEffect(() => {
    if (!originalImageData?.dataUrl) return;
    setProductImage(originalImageData.dataUrl);
    setIsProductImageFromOriginal(true);
  }, [originalImageData]);

  // 허브에 포장 사진 있으면 추가 옵션 자동 펼침
  useEffect(() => {
    if (boxImages.length > 0) setOptionsOpen(true);
  }, [boxImages.length]);

  const handleProductImageChange = (value: string | null) => {
    setProductImage(value);
    setIsProductImageFromOriginal(false);
  };

  const handleSelectHubImage = async (url: string, slot: 'packaging' | 'product') => {
    const b64 = await fetchAsBase64(url);
    if (!b64) {
      toast.error('이미지를 불러올 수 없습니다 (CORS 차단 가능성)');
      return;
    }
    if (slot === 'packaging') {
      setPackagingImage(b64);
    } else {
      setProductImage(b64);
      setIsProductImageFromOriginal(false);
    }
  };

  const handleGenerate = async () => {
    try {
      const data = await generateMutation.mutateAsync({
        productId: productId ?? undefined,
        packagingImage: packagingImage ?? undefined,
        productImage: productImage ?? undefined,
        pieceCount: pieceCount || undefined,
        colorCount: colorCount || undefined,
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

  const canGenerate = !!productImage;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
        >
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
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
        {/* 상품 선택 */}
        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-700">상품 선택 (선택 사항)</div>
          <ProductSelector selectedId={productId} onSelect={handleSelectProduct} />
          {productId && productName && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              {originalImageUrl ? (
                <img
                  src={originalImageUrl}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 text-xs">
                  없음
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{productName}</div>
                {productSku && (
                  <div className="text-xs text-slate-400">SKU: {productSku}</div>
                )}
              </div>
              <button
                onClick={() => setProductId(null)}
                className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                선택 해제
              </button>
            </div>
          )}
        </div>

        {/* 상품 사진 (메인) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-700">📸 상품 사진</div>
              <div className="text-xs text-slate-400">필수 — 편집 대상 이미지</div>
            </div>
            {originalLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                원본 이미지 로드 중...
              </div>
            )}
          </div>
          <div className="relative max-w-md">
            <ImageUploader
              label=""
              description="이미지를 업로드하거나 허브에서 선택하세요"
              value={productImage}
              onChange={handleProductImageChange}
            />
            {isProductImageFromOriginal && productImage && (
              <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600 text-white text-xs rounded-lg">
                쿠팡 원본
              </div>
            )}
          </div>
          {productImages.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-slate-500">허브에서 선택</div>
              <div className="flex gap-2 flex-wrap">
                {productImages.map((img) => {
                  const fullUrl = img.url.startsWith('/') ? `${API_BASE}${img.url}` : img.url;
                  return (
                    <button
                      key={img.url}
                      onClick={() => handleSelectHubImage(img.url, 'product')}
                      className="w-14 h-14 rounded-lg border-2 border-slate-200 hover:border-purple-400 overflow-hidden transition-colors"
                      title={img.label || '상품 사진'}
                    >
                      <img src={fullUrl} alt={img.label || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 추가 옵션 (접힘) */}
        <div className="border-t border-slate-100 pt-4">
          <button
            onClick={() => setOptionsOpen(!optionsOpen)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors"
          >
            <ChevronDown size={16} className={`transition-transform ${optionsOpen ? 'rotate-0' : '-rotate-90'}`} />
            추가 옵션 (포장 사진, 상품 구성)
            {hubLoading && (
              <span className="flex items-center gap-1 text-xs font-normal text-slate-400 ml-2">
                <Loader2 size={12} className="animate-spin" />
                허브 로딩 중...
              </span>
            )}
          </button>
          {optionsOpen && (
            <div className="mt-4 space-y-6">
              {/* 포장 사진 */}
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-slate-700">📦 포장 사진</div>
                  <div className="text-xs text-slate-400">옵션 — 패키지 박스, 포장 상태</div>
                </div>
                <div className="max-w-md">
                  <ImageUploader
                    label=""
                    description="이미지를 업로드하거나 허브에서 선택하세요"
                    value={packagingImage}
                    onChange={setPackagingImage}
                  />
                </div>
                {boxImages.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500">허브에서 선택</div>
                    <div className="flex gap-2 flex-wrap">
                      {boxImages.map((img) => {
                        const fullUrl = img.url.startsWith('/') ? `${API_BASE}${img.url}` : img.url;
                        return (
                          <button
                            key={img.url}
                            onClick={() => handleSelectHubImage(img.url, 'packaging')}
                            className="w-14 h-14 rounded-lg border-2 border-slate-200 hover:border-purple-400 overflow-hidden transition-colors"
                            title={img.label || '포장 사진'}
                          >
                            <img src={fullUrl} alt={img.label || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 상품 구성 */}
              <div className="space-y-2">
                <div>
                  <div className="text-sm font-semibold text-slate-700">상품 구성</div>
                  <div className="text-xs text-slate-400">옵션 — AI 프롬프트에 포함</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">개입 수</label>
                    <input
                      type="number"
                      min={1}
                      value={pieceCount}
                      onChange={(e) => setPieceCount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="예: 40"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">색상 종류</label>
                    <input
                      type="number"
                      min={1}
                      value={colorCount}
                      onChange={(e) => setColorCount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="예: 5"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 편집 목적 */}
        <div className="space-y-1.5">
          <div className="text-sm font-semibold text-slate-700">편집 목적</div>
          <div className="flex gap-2">
            <button
              onClick={() => setPurpose('compliance')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                purpose === 'compliance'
                  ? 'bg-purple-600 text-white'
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
          disabled={!canGenerate || generateMutation.isPending}
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
            productId={productId}
          />
        </div>
      )}
    </div>
  );
}
