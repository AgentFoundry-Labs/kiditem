'use client';
import { Package } from 'lucide-react';
import { ImageUploader } from './ImageUploader';
import { ColorVariantsUploader } from './ColorVariantsUploader';
import { EditCaseBreadcrumb } from './EditCaseBreadcrumb';
import type { EditUseCase } from './UseCaseSelection';

type EditorMode = 'edit' | 'creative';

const SUPPLEMENTARY_LABELS = ['박스', '세트구성', '포장', '부속품', '기타'] as const;
export type SupplementaryLabel = (typeof SUPPLEMENTARY_LABELS)[number];

const CASE_NAMES: Record<EditUseCase, string> = {
  compose: '상품+박스/세트 합성',
  'color-variants': '색상별 상품 배치',
  single: '단일 상품 정리',
};

interface Props {
  mode: EditorMode;
  editCase: EditUseCase | null;
  productId: string | null;
  productName: string;
  productImage: string | null;
  packagingImage: string | null;
  supplementaryLabel: SupplementaryLabel;
  colorImages: string[];
  backgroundReference: string | null;
  sceneType: string;
  onProductImageChange: (v: string | null) => void;
  onPackagingChange: (v: string | null) => void;
  onSupplementaryLabelChange: (v: SupplementaryLabel) => void;
  onColorImagesChange: (v: string[]) => void;
  onBackgroundReferenceChange: (v: string | null) => void;
  onResetEditCase: () => void;
}

export function EditorInputPanel({
  mode,
  editCase,
  productId,
  productName,
  productImage,
  packagingImage,
  supplementaryLabel,
  colorImages,
  backgroundReference,
  sceneType,
  onProductImageChange,
  onPackagingChange,
  onSupplementaryLabelChange,
  onColorImagesChange,
  onBackgroundReferenceChange,
  onResetEditCase,
}: Props) {
  const showBreadcrumb = mode === 'edit' && editCase !== null;

  return (
    <div
      className="flex flex-col h-full overflow-y-auto bg-gray-50"
      style={{ borderRight: '1px solid #e5e7eb' }}
    >
      {showBreadcrumb && editCase && (
        <EditCaseBreadcrumb caseName={CASE_NAMES[editCase]} onChange={onResetEditCase} />
      )}

      <div
        className="flex-shrink-0 px-4 py-3.5"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
          이미지 입력
        </div>
      </div>

      {productId && productName && (
        <div
          className="flex items-center gap-2 px-4 py-3 bg-white"
          style={{ borderBottom: '1px solid #e5e7eb' }}
        >
          <Package size={14} className="text-gray-400 flex-shrink-0" />
          <span className="text-xs font-medium truncate text-gray-700">{productName}</span>
        </div>
      )}

      <div className="flex-1 px-4 py-4 space-y-6">
        {/* 편집 모드 분기 */}
        {mode === 'edit' && editCase === 'compose' && (
          <>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">상품 사진</div>
              <div className="text-[11px] text-gray-400">흰배경 대표 상품 이미지</div>
              <ImageUploader label="" value={productImage} onChange={onProductImageChange} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-700">보조 이미지</div>
                <select
                  value={supplementaryLabel}
                  onChange={(e) => onSupplementaryLabelChange(e.target.value as SupplementaryLabel)}
                  className="text-[11px] text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1"
                >
                  {SUPPLEMENTARY_LABELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="text-[11px] text-gray-400">패키지/세트구성 등 보조 이미지</div>
              <ImageUploader label="" value={packagingImage} onChange={onPackagingChange} />
            </div>
          </>
        )}

        {mode === 'edit' && editCase === 'color-variants' && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">색상별 상품 사진</div>
            <ColorVariantsUploader values={colorImages} onChange={onColorImagesChange} />
          </div>
        )}

        {mode === 'edit' && editCase === 'single' && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">상품 사진</div>
            <div className="text-[11px] text-gray-400">정리할 원본 상품 이미지</div>
            <ImageUploader label="" value={productImage} onChange={onProductImageChange} />
          </div>
        )}

        {mode === 'creative' && (
          <>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">상품 사진</div>
              <div className="text-[11px] text-gray-400">흰배경 상품 이미지</div>
              <ImageUploader label="" value={productImage} onChange={onProductImageChange} />
            </div>
            {sceneType === 'custom-reference' && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">분위기 참고 이미지</div>
                <div className="text-[11px] text-gray-400">mood · 팔레트 · 질감 참고용</div>
                <ImageUploader label="" value={backgroundReference} onChange={onBackgroundReferenceChange} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
