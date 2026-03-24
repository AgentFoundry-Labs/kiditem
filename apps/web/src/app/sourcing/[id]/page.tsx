'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  Code2,
  Download,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Square,
  Unlock,
} from 'lucide-react';
import {
  productsApi,
  type ProductDetailResponse,
} from '@/lib/sourcing-api';
import MobilePreview from '../components/MobilePreview';

type EditTabType = 'basic' | 'detail' | 'raw';

interface ProductInfoItem {
  key: string;
  value: string;
}

interface FeatureItem {
  title: string;
  description: string;
}

interface ProductEditState {
  name: string;
  category: string;
  originalPrice: number;
  salePrice: number;
  discountRate: number;
  thumbnails: string[];
  tags: string[];
  rating: number;
  reviewCount: number;
  productInfo: ProductInfoItem[];
  features: FeatureItem[];
}

const PLACEHOLDER_DATA: ProductEditState = {
  name: '',
  category: '',
  originalPrice: 0,
  salePrice: 0,
  discountRate: 0,
  thumbnails: [],
  tags: [],
  rating: 0,
  reviewCount: 0,
  productInfo: [],
  features: [],
};

function mapProcessedData(
  processed: Record<string, unknown>
): ProductEditState {
  const title =
    typeof processed.title === 'string' ? processed.title : '';
  const imagesList = Array.isArray(processed.images)
    ? (processed.images as string[])
    : [];
  const price =
    typeof processed.price === 'number' ? processed.price : 0;
  const specs = Array.isArray(processed.specs)
    ? (processed.specs as ProductInfoItem[])
    : [];
  const feats = Array.isArray(processed.features)
    ? (processed.features as FeatureItem[])
    : [];

  return {
    name: title,
    category: '',
    originalPrice: 0,
    salePrice: price,
    discountRate: 0,
    thumbnails: imagesList,
    tags: [],
    rating: 0,
    reviewCount: 0,
    productInfo: specs,
    features: feats,
  };
}

const CATEGORIES = [
  '생활/건강 > 세제/세정제 > 세탁세제 > 액상세제',
  '생활/건강 > 세제/세정제 > 세탁세제 > 캡슐세제',
  '뷰티 > 스킨케어 > 에센스/세럼 > 비타민세럼',
  '식품 > 건강식품 > 비타민/미네랄 > 종합비타민',
  '가전디지털 > 생활가전 > 청소기 > 로봇청소기',
  '패션의류 > 여성의류 > 원피스 > 미디원피스',
];

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [product, setProduct] = useState<ProductDetailResponse | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EditTabType>('basic');
  const [isLocked, setIsLocked] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [editData, setEditData] = useState<ProductEditState>(PLACEHOLDER_DATA);

  const fetchProduct = useCallback(async () => {
    setIsLoadingProduct(true);
    setLoadError(null);
    try {
      const data = await productsApi.getDetail(productId);
      setProduct(data);
      if (data.processed_data) {
        setEditData(mapProcessedData(data.processed_data));
      } else {
        setEditData({
          ...PLACEHOLDER_DATA,
          name: data.name,
          salePrice: data.price_krw ?? 0,
          thumbnails: data.thumbnail_url ? [data.thumbnail_url] : [],
        });
      }
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : '상품 정보를 불러올 수 없습니다.'
      );
    } finally {
      setIsLoadingProduct(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  useEffect(() => {
    if (!isReprocessing) return;
    const interval = setInterval(async () => {
      try {
        const status = await productsApi.status(productId);
        if (status.status !== 'PROCESSING') {
          setIsReprocessing(false);
          fetchProduct();
        }
      } catch {
        void 0;
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isReprocessing, productId, fetchProduct]);

  const handleReprocess = async () => {
    try {
      await productsApi.process(productId);
      setIsReprocessing(true);
    } catch {
      void 0;
    }
  };

  const handleCancelReprocess = async () => {
    try {
      await productsApi.cancel(productId);
    } catch {
      void 0;
    } finally {
      setIsReprocessing(false);
    }
  };

  const updateField = <K extends keyof ProductEditState>(
    field: K,
    value: ProductEditState[K]
  ) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoadingProduct) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/sourcing')}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-sm text-gray-400">불러오는 중...</span>
        </header>
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Loader2 size={32} className="animate-spin" />
            <p className="text-sm font-medium">
              상품 정보를 불러오고 있습니다...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/sourcing')}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-sm text-gray-400">오류</span>
        </header>
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="flex flex-col items-center gap-3 text-gray-500">
            <AlertCircle size={32} className="text-red-400" />
            <p className="text-sm font-medium">{loadError}</p>
            <button
              onClick={fetchProduct}
              className="mt-2 px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition-colors"
            >
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { key: EditTabType; label: string }[] = [
    { key: 'basic', label: '기본 정보' },
    { key: 'detail', label: '상세페이지' },
    { key: 'raw', label: '원본 데이터' },
  ];

  const renderBasicTab = () => (
    <div className="space-y-6 p-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-700">
              썸네일 이미지
            </label>
            <span className="text-xs text-gray-400">
              {editData.thumbnails.length}/10장
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {editData.thumbnails.map((url, index) => (
              <div
                key={`thumb-${index}`}
                className="relative group w-[88px] h-[88px] rounded-lg overflow-hidden border-2 border-gray-200 hover:border-emerald-400 transition-colors cursor-grab"
              >
                <img
                  src={url}
                  alt={`상품 이미지 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical
                    size={14}
                    className="text-white drop-shadow-md"
                  />
                </div>
                {index === 0 && (
                  <span className="absolute bottom-0 left-0 right-0 bg-emerald-600 text-white text-[10px] text-center py-0.5 font-medium">
                    대표
                  </span>
                )}
                <button
                  onClick={() =>
                    updateField(
                      'thumbnails',
                      editData.thumbnails.filter((_, i) => i !== index)
                    )
                  }
                  className="absolute top-1 right-1 w-5 h-5 bg-black/50 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                updateField('thumbnails', [
                  ...editData.thumbnails,
                  `https://placehold.co/400x400/e2e8f0/64748b?text=상품+${editData.thumbnails.length + 1}`,
                ])
              }
              className="w-[88px] h-[88px] rounded-lg border-2 border-dashed border-gray-300 hover:border-emerald-400 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-emerald-500 transition-colors"
            >
              <Plus size={20} />
              <span className="text-[10px] font-medium">이미지 추가</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-700">
            카테고리
          </label>
          <div className="relative">
            <select
              value={editData.category}
              onChange={(e) => updateField('category', e.target.value)}
              className="w-full appearance-none px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors cursor-pointer"
            >
              <option value="">카테고리 선택</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-700">
              상품명
            </label>
            <span
              className={`text-xs font-medium ${
                editData.name.length > 100
                  ? 'text-red-500'
                  : 'text-gray-400'
              }`}
            >
              {editData.name.length}/100자
            </span>
          </div>
          <input
            type="text"
            value={editData.name}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors"
            placeholder="상품명을 입력하세요"
            maxLength={100}
          />
        </div>
      </div>

      {editData.productInfo.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="text-sm font-semibold text-gray-700 block mb-3">
            상품 정보
          </label>
          <div className="flex flex-wrap gap-2">
            {editData.productInfo.map((item, idx) => (
              <div
                key={idx}
                className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs text-gray-700"
              >
                <span className="font-medium text-gray-500">
                  {item.key}:
                </span>{' '}
                {item.value}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderDetailTab = () => (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">
          생성된 상세페이지
        </h3>
        <div className="flex items-center gap-2">
          <Link
            href={`/sourcing/${productId}/editor`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Pencil size={12} />
            에디터에서 편집
          </Link>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors">
            <Download size={12} />
            이미지 다운로드
          </button>
        </div>
      </div>

      {product?.is_processed ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Code2 size={40} className="mb-3 text-gray-300" />
            <p className="text-sm font-medium">
              상세페이지 미리보기
            </p>
            <p className="text-xs text-gray-400 mt-1">
              AI 가공된 상세페이지가 여기에 표시됩니다
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Settings size={40} className="mb-3 text-gray-300" />
            <p className="text-sm font-medium">
              생성된 상세페이지가 없습니다
            </p>
            <p className="text-xs text-gray-400 mt-1">
              AI 가공을 먼저 실행해주세요
            </p>
          </div>
        </div>
      )}
    </div>
  );

  const renderRawTab = () => (
    <div className="p-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">
          원본 데이터 (JSON)
        </h3>
        {product?.raw_data ? (
          <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-700 overflow-auto max-h-[600px] font-mono leading-relaxed">
            {JSON.stringify(product.raw_data, null, 2)}
          </pre>
        ) : (
          <div className="text-sm text-gray-400 text-center py-8">
            원본 데이터가 없습니다
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/sourcing')}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-sm font-bold text-gray-900">
              {editData.name || '(상품명 없음)'}
            </h1>
            <p className="text-[10px] text-gray-400">
              ID: {productId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsLocked((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              isLocked
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-gray-50 text-gray-600 border border-gray-200'
            }`}
          >
            {isLocked ? (
              <Lock size={12} />
            ) : (
              <Unlock size={12} />
            )}
            {isLocked ? '잠김' : '열림'}
          </button>

          <button
            onClick={handleReprocess}
            disabled={isReprocessing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              size={12}
              className={isReprocessing ? 'animate-spin' : ''}
            />
            AI 재가공
          </button>
        </div>
      </header>

      {isReprocessing && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-amber-700 text-sm font-medium">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            AI 재가공 중... 완료되면 자동으로 업데이트됩니다.
          </div>
          <button
            onClick={handleCancelReprocess}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            <Square size={12} />
            중단
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[65%] flex flex-col overflow-hidden border-r border-gray-200">
          <div className="flex border-b border-gray-200 bg-white">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? 'text-emerald-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
                )}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-50">
            {activeTab === 'basic' && renderBasicTab()}
            {activeTab === 'detail' && renderDetailTab()}
            {activeTab === 'raw' && renderRawTab()}
          </div>
        </div>

        <div className="w-[35%] overflow-y-auto bg-gray-50/50 p-6">
          <MobilePreview
            name={editData.name}
            mainImage={
              editData.thumbnails[0] ??
              'https://placehold.co/400x400/e2e8f0/64748b?text=No+Image'
            }
            salePrice={editData.salePrice}
            originalPrice={editData.originalPrice}
            discountRate={editData.discountRate}
            rating={editData.rating}
            reviewCount={editData.reviewCount}
          />
        </div>
      </div>
    </div>
  );
}
