'use client';
import { Loader2, Wand2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImageUploader } from './ImageUploader';

interface EditorInputPanelProps {
  productId: string | null;
  productName: string;
  originalImageUrl: string | null;
  packagingImage: string | null;
  productImage: string | null;
  composition: string;
  purpose: 'compliance' | 'quality';
  isPending: boolean;
  hasInput: boolean;
  onPackagingChange: (v: string | null) => void;
  onProductImageChange: (v: string | null) => void;
  onCompositionChange: (v: string) => void;
  onPurposeChange: (v: 'compliance' | 'quality') => void;
  onGenerate: () => void;
}

export function EditorInputPanel({
  productId,
  productName,
  originalImageUrl,
  packagingImage,
  productImage,
  composition,
  purpose,
  isPending,
  hasInput,
  onPackagingChange,
  onProductImageChange,
  onCompositionChange,
  onPurposeChange,
  onGenerate,
}: EditorInputPanelProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 sticky top-6">
      {/* 상품 연결 표시 (productId 있을 때) */}
      {productId && productName && (
        <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Package size={16} className="text-purple-400" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider mb-0.5">상품 연결됨</div>
            <div className="text-sm font-medium text-slate-800 truncate">{productName}</div>
          </div>
        </div>
      )}

      {/* 이미지 업로드 */}
      <div>
        <div className="text-sm font-semibold text-slate-700 mb-3">이미지 업로드</div>
        <div className="grid grid-cols-2 gap-4">
          <ImageUploader
            label="상품 포장 사진"
            description="패키지 박스, 포장 상태"
            value={packagingImage}
            onChange={onPackagingChange}
          />
          <ImageUploader
            label="상품 사진"
            description="실제 상품 모습"
            value={productImage}
            onChange={onProductImageChange}
          />
        </div>
      </div>

      {/* 상품 구성 */}
      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-slate-700">상품 구성 <span className="text-slate-400 font-normal">(선택)</span></div>
        <input
          type="text"
          value={composition}
          onChange={(e) => onCompositionChange(e.target.value)}
          placeholder="예: 테트리스 블록 40개 + 나무 프레임 1개"
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
        />
      </div>

      {/* 편집 목적 */}
      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-slate-700">편집 목적</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onPurposeChange('compliance')}
            className={cn(
              'px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-center',
              purpose === 'compliance'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            가이드라인 수정
          </button>
          <button
            onClick={() => onPurposeChange('quality')}
            className={cn(
              'px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-center',
              purpose === 'quality'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            품질 개선
          </button>
        </div>
      </div>

      {/* 편집 시작 버튼 */}
      <button
        onClick={onGenerate}
        disabled={!hasInput || isPending}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? (
          <>
            <Loader2 size={16} className="animate-spin" /> 편집 중...
          </>
        ) : (
          <>
            <Wand2 size={16} /> 편집 시작
          </>
        )}
      </button>

      {!hasInput && (
        <p className="text-center text-xs text-slate-400">상품을 연결하거나 이미지를 업로드하세요</p>
      )}
    </div>
  );
}
