'use client';

import { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import type { ProductImageItem } from '@kiditem/shared';

const ROLE_CONFIG = [
  { role: 'box', label: '📦 포장 사진', description: '패키지 박스, 포장 상태' },
  { role: 'product', label: '🛍️ 상품 사진', description: '실제 상품 모습' },
  { role: 'color_variant', label: '🎨 색상별 사진', description: '색상/옵션별 상품' },
  { role: 'size_chart', label: '📐 사이즈 차트', description: '사이즈 가이드' },
  { role: 'detail', label: '📄 상세 이미지', description: '상세 설명 이미지' },
] as const;

interface Props {
  images: ProductImageItem[];
  onAdd: (role: string, file: File) => void;
  onRemove: (index: number) => void;
  onLabelChange: (index: number, label: string) => void;
}

function RoleSection({
  config,
  images,
  onAdd,
  onRemove,
  onLabelChange,
  startIndex,
}: {
  config: (typeof ROLE_CONFIG)[number];
  images: ProductImageItem[];
  onAdd: (role: string, file: File) => void;
  onRemove: (index: number) => void;
  onLabelChange: (index: number, label: string) => void;
  startIndex: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    files.forEach((file) => onAdd(config.role, file));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-700">{config.label}</div>
          <div className="text-xs text-slate-400">{config.description}</div>
        </div>
        <span className="text-xs text-slate-400">{images.length}장</span>
      </div>
      <div
        className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {images.map((img, i) => {
          const globalIndex = startIndex + i;
          return (
            <div key={`${img.url}-${i}`} className="group relative space-y-1">
              <div className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <img
                  src={img.url}
                  alt={img.label || ''}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => onRemove(globalIndex)}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
              <input
                type="text"
                value={img.label || ''}
                onChange={(e) => onLabelChange(globalIndex, e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-purple-200"
                placeholder="라벨 (예: 빨강)"
              />
            </div>
          );
        })}
        {/* 추가 버튼 */}
        <button
          onClick={() => fileRef.current?.click()}
          className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-purple-300 hover:text-purple-500 transition-colors"
        >
          <Plus size={20} />
          <span className="text-xs">추가</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            files.forEach((file) => onAdd(config.role, file));
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

export function ImageGrid({ images, onAdd, onRemove, onLabelChange }: Props) {
  let offset = 0;

  return (
    <div className="space-y-6">
      {ROLE_CONFIG.map((config) => {
        const roleImages = images.filter((img) => img.role === config.role);
        const startIndex = images.findIndex((img) => img.role === config.role);
        const section = (
          <RoleSection
            key={config.role}
            config={config}
            images={roleImages}
            onAdd={onAdd}
            onRemove={onRemove}
            onLabelChange={onLabelChange}
            startIndex={startIndex >= 0 ? startIndex : offset}
          />
        );
        offset += roleImages.length;
        return section;
      })}
    </div>
  );
}
