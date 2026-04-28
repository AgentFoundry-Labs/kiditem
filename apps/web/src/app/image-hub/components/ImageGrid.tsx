'use client';

import { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import type { MasterImageItem } from '@kiditem/shared';
import { HUB_ROLE_CONFIG, type HubRoleConfig } from '@/lib/hub-roles';

interface Props {
  images: MasterImageItem[];
  onAdd: (role: string, file: File) => void;
  onRemove: (index: number) => void;
  onLabelChange: (index: number, label: string) => void;
}

type IndexedImage = { image: MasterImageItem; originalIndex: number };

function RoleSection({
  config,
  items,
  onAdd,
  onRemove,
  onLabelChange,
}: {
  config: HubRoleConfig;
  items: IndexedImage[];
  onAdd: (role: string, file: File) => void;
  onRemove: (index: number) => void;
  onLabelChange: (index: number, label: string) => void;
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
        <span className="text-xs text-slate-400">{items.length}장</span>
      </div>
      <div
        className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {items.map((item) => {
          const { image, originalIndex } = item;
          return (
            <div key={`${image.url}-${originalIndex}`} className="group relative space-y-1">
              <div className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <img
                  src={image.url}
                  alt={image.label || ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => onRemove(originalIndex)}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
              <input
                type="text"
                value={image.label || ''}
                onChange={(e) => onLabelChange(originalIndex, e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-purple-200"
                placeholder="라벨 (예: 빨강)"
              />
            </div>
          );
        })}
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
  // Pair every image with its index in the *full* draft array. Filtering
  // role-by-role then yields stable `originalIndex` values that don't shift
  // when other roles are present, which is what the parent's onRemove /
  // onLabelChange callbacks expect.
  const indexed: IndexedImage[] = images.map((image, originalIndex) => ({ image, originalIndex }));
  return (
    <div className="space-y-6">
      {HUB_ROLE_CONFIG.map((config) => {
        const roleItems = indexed.filter((item) => item.image.role === config.role);
        return (
          <RoleSection
            key={config.role}
            config={config}
            items={roleItems}
            onAdd={onAdd}
            onRemove={onRemove}
            onLabelChange={onLabelChange}
          />
        );
      })}
    </div>
  );
}
