'use client';

import { GripVertical, Plus } from 'lucide-react';

interface ThumbnailGridProps {
  thumbnails: string[];
  onThumbnailsChange: (thumbnails: string[]) => void;
}

export default function ThumbnailGrid({
  thumbnails,
  onThumbnailsChange,
}: ThumbnailGridProps) {
  const handleRemove = (index: number) => {
    onThumbnailsChange(thumbnails.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700">
          썸네일 이미지
        </label>
        <span className="text-xs text-gray-400">
          {thumbnails.length}/10장
        </span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {thumbnails.map((url, index) => (
          <div
            key={`thumb-${index}`}
            className="relative group w-[88px] h-[88px] rounded-lg overflow-hidden border-2 border-gray-200 hover:border-emerald-400 transition-colors cursor-grab"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
              onClick={() => handleRemove(index)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/50 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all"
              title="삭제"
            >
              ×
            </button>
          </div>
        ))}

        <button
          onClick={() =>
            onThumbnailsChange([
              ...thumbnails,
              `https://placehold.co/400x400/e2e8f0/64748b?text=상품+${thumbnails.length + 1}`,
            ])
          }
          className="w-[88px] h-[88px] rounded-lg border-2 border-dashed border-gray-300 hover:border-emerald-400 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-emerald-500 transition-colors"
        >
          <Plus size={20} />
          <span className="text-[10px] font-medium">이미지 추가</span>
        </button>
      </div>
    </div>
  );
}
