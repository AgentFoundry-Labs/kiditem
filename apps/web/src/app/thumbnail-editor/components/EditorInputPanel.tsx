'use client';
import { Package } from 'lucide-react';
import { ImageUploader } from './ImageUploader';

type EditorMode = 'edit' | 'creative';

interface EditorInputPanelProps {
  mode: EditorMode;
  productId: string | null;
  productName: string;
  packagingImage: string | null;
  productImage: string | null;
  onPackagingChange: (v: string | null) => void;
  onProductImageChange: (v: string | null) => void;
}

export function EditorInputPanel({
  mode: _mode,
  productId,
  productName,
  packagingImage,
  productImage,
  onPackagingChange,
  onProductImageChange,
}: EditorInputPanelProps) {
  return (
    <div
      className="flex flex-col h-full overflow-y-auto bg-gray-50"
      style={{ borderRight: '1px solid #e5e7eb' }}
    >
      {/* 헤더 */}
      <div
        className="flex-shrink-0 px-4 py-3.5"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
          이미지 입력
        </div>
      </div>

      {/* 연결된 상품 */}
      {productId && productName && (
        <div
          className="flex items-center gap-2 px-4 py-3 bg-white"
          style={{ borderBottom: '1px solid #e5e7eb' }}
        >
          <Package size={14} className="text-gray-400 flex-shrink-0" />
          <span className="text-xs font-medium truncate text-gray-700">
            {productName}
          </span>
        </div>
      )}

      {/* 업로더 */}
      <div className="flex-1 px-4 py-4 space-y-6">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-700">상품 포장 사진</div>
          <div className="text-[11px] text-gray-400">패키지 박스, 포장 상태</div>
          <ImageUploader label="" value={packagingImage} onChange={onPackagingChange} />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-700">상품 사진</div>
          <div className="text-[11px] text-gray-400">실제 상품 모습</div>
          <ImageUploader label="" value={productImage} onChange={onProductImageChange} />
        </div>
      </div>
    </div>
  );
}
