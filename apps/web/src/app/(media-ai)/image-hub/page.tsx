'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { FolderOpen, Save, Loader2, Wand2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useProductImages } from '../_shared/hooks/useProductImages';
import { ProductSelector } from '@/components/product/ProductSelector';
import { ImageGrid } from './components/ImageGrid';
import {
  MasterImageRoleSchema,
  MasterSchema,
  type MasterImageItem,
  type MasterImageRole,
} from '@kiditem/shared/product';

interface SelectedProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  // Representative sku coming from the catalog selector. The URL-initial
  // fetch route only has `master.code` (no sku without an option lookup),
  // so this can be null even when a product is selected.
  sku: string | null;
}

export default function ImageHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ImageHubContent />
    </Suspense>
  );
}

function ImageHubContent() {
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get('productId');

  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(
    initialProductId ? { id: initialProductId, name: '', imageUrl: null, sku: null } : null,
  );
  const [isDirty, setIsDirty] = useState(false);
  const [draft, setDraft] = useState<MasterImageItem[]>([]);

  // URL 진입 시 master 상세 fetch (name/imageUrl 채우기). ADR-0020 successor:
  // canonical `/api/products/masters/:id`, not the legacy `/api/products/:id` alias.
  useEffect(() => {
    if (!initialProductId) return;
    apiClient
      .getParsed(`/api/products/masters/${initialProductId}`, MasterSchema)
      .then((master) =>
        setSelectedProduct((prev) => {
          if (prev?.id !== initialProductId) return prev;
          return {
            id: master.id,
            name: master.name,
            imageUrl: master.imageUrl,
            sku: null,
          };
        }),
      )
      .catch(() => toast.error('상품 정보를 불러오지 못했습니다'));
  }, [initialProductId]);

  const { images, loading, saving, uploadFile, saveImages, error } = useProductImages(
    selectedProduct?.id ?? null,
  );

  // Surface query failure explicitly so the user sees "load failed" instead
  // of the ambiguous empty grid (Codex review M2 — exposed error fields were
  // previously not consumed).
  useEffect(() => {
    if (error) toast.error('이미지 목록을 불러오지 못했습니다');
  }, [error]);

  // Sync server-truth images into the local draft whenever the query cache
  // changes (product switch, save success, background refetch) — but only if
  // the user has no unsaved edits, so in-progress labels don't get clobbered.
  useEffect(() => {
    if (isDirty) return;
    setDraft(images);
  }, [images, isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleProductSelect = (product: SelectedProduct) => {
    setSelectedProduct(product);
    setIsDirty(false);
  };

  const handleAddImage = async (role: string, file: File) => {
    if (!selectedProduct) return;
    const roleParse = MasterImageRoleSchema.safeParse(role);
    if (!roleParse.success) {
      toast.error('알 수 없는 이미지 역할');
      return;
    }
    const resolvedRole: MasterImageRole = roleParse.data;
    try {
      const uploaded = await uploadFile(file);
      const newImage: MasterImageItem = {
        ...uploaded,
        role: resolvedRole,
        sortOrder: draft.filter((img) => img.role === resolvedRole).length,
      };
      setDraft((prev) => [...prev, newImage]);
      setIsDirty(true);
      toast.success('이미지 업로드 완료');
    } catch {
      toast.error('이미지 업로드 실패');
    }
  };

  const handleRemoveImage = (index: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleLabelChange = (index: number, label: string) => {
    setDraft((prev) => prev.map((img, i) => (i === index ? { ...img, label } : img)));
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await saveImages(draft);
      setIsDirty(false);
      toast.success('이미지가 저장되었습니다');
    } catch {
      toast.error('이미지 저장에 실패했습니다');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
            <FolderOpen size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">이미지 관리</h1>
            <p className="text-xs text-slate-400">
              상품별 이미지를 역할별로 분류하고 관리합니다
            </p>
          </div>
        </div>
        {selectedProduct && draft.length > 0 && (
          <div className="flex items-center gap-2">
            <Link
              href={`/thumbnail-editor/edit?productId=${selectedProduct.id}`}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              <Wand2 size={14} /> 썸네일 편집
            </Link>
            <Link
              href={`/generate?productId=${selectedProduct.id}`}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Sparkles size={14} /> 콘텐츠 생성
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> 저장 중...
                </>
              ) : (
                <>
                  <Save size={14} /> 저장
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 상품 선택 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="text-sm font-semibold text-slate-700">상품 선택</div>
        <ProductSelector
          selectedId={selectedProduct?.id ?? null}
          onSelect={handleProductSelect}
        />
        {selectedProduct && selectedProduct.name && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            {selectedProduct.imageUrl ? (
              <img
                src={selectedProduct.imageUrl}
                alt=""
                className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 text-xs">
                없음
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-slate-900">{selectedProduct.name}</div>
              {selectedProduct.sku && (
                <div className="text-xs text-[var(--text-tertiary)]">SKU: {selectedProduct.sku}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 이미지 그리드 */}
      {selectedProduct && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              이미지 로딩 중...
            </div>
          ) : (
            <ImageGrid
              images={draft}
              onAdd={handleAddImage}
              onRemove={handleRemoveImage}
              onLabelChange={handleLabelChange}
            />
          )}
        </div>
      )}

      {/* 빈 상태 */}
      {!selectedProduct && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <FolderOpen size={40} className="mx-auto text-slate-300 mb-3" />
          <div className="text-sm text-slate-500">상품을 검색하여 선택하면 이미지를 관리할 수 있습니다</div>
        </div>
      )}
    </div>
  );
}
