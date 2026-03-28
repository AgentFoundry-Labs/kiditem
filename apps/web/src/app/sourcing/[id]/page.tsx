'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ChevronDown,
  Download,
  Loader2,
  Pencil,
  Settings,
} from 'lucide-react';
import {
  productsApi,
  type ProductDetailResponse,
} from '@/lib/sourcing-api';
import type { DetailPageData } from '@kiditem/templates';
import { getTemplate, parseDetailPageData, placeholderDetailPageData } from '@kiditem/templates';
import { API_BASE } from '@/lib/api';
import { renderTemplateToHtml } from '@/lib/template-html';
import MobilePreview from '../components/MobilePreview';
import ProductEditHeader from '../components/ProductEditHeader';
import ProductEditTabs, {
  type EditTabType,
} from '../components/ProductEditTabs';
import ThumbnailGrid from '../components/ThumbnailGrid';
import TagEditor from '../components/TagEditor';
import RawDataTab from '../components/RawDataTab';

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

  const [product, setProduct] = useState<ProductDetailResponse | null>(
    null
  );
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EditTabType>('basic');
  const [isEditComplete, setIsEditComplete] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [editData, setEditData] =
    useState<ProductEditState>(PLACEHOLDER_DATA);
  const [templateCss, setTemplateCss] = useState('');
  const [detailPageData, setDetailPageData] = useState<DetailPageData>(placeholderDetailPageData);

  const goBack = () => router.push('/sourcing');

  const fetchProduct = useCallback(async () => {
    setIsLoadingProduct(true);
    setLoadError(null);
    try {
      const [data, previewRes, css] = await Promise.all([
        productsApi.getDetail(productId),
        fetch(`${API_BASE}/api/products/${productId}/preview`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null) as Promise<{ template: string | null; data: Record<string, unknown> } | null>,
        fetch('/templates-styles.css')
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => ''),
      ]);
      setProduct(data);
      setTemplateCss(css);

      if (previewRes?.template && previewRes?.data) {
        try {
          const parsed = parseDetailPageData(previewRes.data);
          const resolve = (url: string) => url.startsWith('/processed/') ? `${API_BASE}${url}` : url;
          parsed.images = Array.isArray(parsed.images) ? parsed.images.map(resolve) : [];
          parsed.sizeImages = Array.isArray(parsed.sizeImages) ? parsed.sizeImages.map(resolve) : [];
          parsed.detailImages = Array.isArray(parsed.detailImages) ? parsed.detailImages.map(resolve) : [];
          if (parsed.heroBanner) parsed.heroBanner = resolve(parsed.heroBanner);
          setDetailPageData(parsed);
        } catch {
          setDetailPageData(placeholderDetailPageData);
        }
      } else {
        setDetailPageData(placeholderDetailPageData);
      }

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

  const updateField = <K extends keyof ProductEditState>(
    field: K,
    value: ProductEditState[K]
  ) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const detailPreviewHtml = useMemo(() => {
    const config = getTemplate('bold-vertical');
    return renderTemplateToHtml(
      config.component as React.ComponentType<unknown>,
      detailPageData,
      config,
      templateCss,
    );
  }, [detailPageData, templateCss]);

  if (isLoadingProduct) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <ProductEditHeader
          productName="불러오는 중..."
          productId={productId}
          isEditComplete={false}
          isLocked={false}
          onToggleEditComplete={() => {}}
          onToggleLocked={() => {}}
          onBack={goBack}
        />
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
        <ProductEditHeader
          productName="오류"
          productId={productId}
          isEditComplete={false}
          isLocked={false}
          onToggleEditComplete={() => {}}
          onToggleLocked={() => {}}
          onBack={goBack}
        />
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

  const nameLength = Array.from(editData.name).length;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <div className="space-y-6 p-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <ThumbnailGrid
                thumbnails={editData.thumbnails}
                onThumbnailsChange={(v) => updateField('thumbnails', v)}
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-gray-700">
                  카테고리
                </label>
                <div className="relative">
                  <select
                    value={editData.category}
                    onChange={(e) =>
                      updateField('category', e.target.value)
                    }
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
                      nameLength > 100
                        ? 'text-red-500'
                        : 'text-gray-400'
                    }`}
                  >
                    {nameLength}/100자
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

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <TagEditor
                tags={editData.tags}
                onTagsChange={(v) => updateField('tags', v)}
              />
            </div>

            {editData.productInfo.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-gray-700">
                      상품정보제공공시
                    </label>
                    <button className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
                      편집
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editData.productInfo.map((item) => (
                      <div
                        key={item.key}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm hover:border-slate-300 transition-colors"
                      >
                        <span className="text-gray-500 font-medium">
                          {item.key}:
                        </span>
                        <span className="text-gray-800">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'options':
        return (
          <div className="p-6">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Settings size={40} className="mb-3 text-gray-300" />
                <p className="text-sm font-medium">
                  옵션 및 판매가 설정
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  준비 중인 기능입니다
                </p>
              </div>
            </div>
          </div>
        );

      case 'detail':
        return (
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

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ height: '80vh' }}>
              <iframe
                srcDoc={detailPreviewHtml}
                className="w-full h-full border-0"
                title="detail-page-preview"
              />
            </div>
          </div>
        );

      case 'raw':
        return <RawDataTab rawData={product?.raw_data ?? null} />;

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ProductEditHeader
        productName={editData.name || '(상품명 없음)'}
        productId={productId}
        isEditComplete={isEditComplete}
        isLocked={isLocked}
        onToggleEditComplete={() => setIsEditComplete((v) => !v)}
        onToggleLocked={() => setIsLocked((v) => !v)}
        onBack={goBack}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[65%] flex flex-col overflow-hidden border-r border-gray-200">
          <ProductEditTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
          <div className="flex-1 overflow-y-auto bg-gray-50">
            {renderTabContent()}
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
