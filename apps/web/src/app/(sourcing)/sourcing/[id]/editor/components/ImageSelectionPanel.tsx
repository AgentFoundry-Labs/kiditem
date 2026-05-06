'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronsUpDown,
  Maximize2,
  Minimize2,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIImageEditPanel } from './AIImageEditPanel';

type ImageAlign = 'left' | 'center' | 'right';

interface ImageSelectionPanelProps {
  component: any;
  editor: any;
  imageUrl: string;
  isBusy: MutableRefObject<boolean>;
  onEditComplete: (newImageUrl: string) => void;
  onReplace: () => void;
  onClose: () => void;
}

const WIDTH_PRESETS = [
  { label: '작게', value: 60 },
  { label: '보통', value: 80 },
  { label: '크게', value: 100 },
] as const;

function readNumericStyle(component: any, key: string, fallback: number): number {
  const style = component?.getStyle?.() ?? {};
  const raw = style[key] ?? style[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
  if (typeof raw !== 'string') return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function inferAlignment(component: any): ImageAlign {
  const style = component?.getStyle?.() ?? {};
  const left = style['margin-left'] ?? style.marginLeft;
  const right = style['margin-right'] ?? style.marginRight;

  if (left === 'auto' && right === '0') return 'right';
  if (left === '0' && right === 'auto') return 'left';
  return 'center';
}

function applyImageWidth(component: any, width: number) {
  component?.addStyle?.({
    display: 'block',
    width: `${width}%`,
    'max-width': 'none',
    height: 'auto',
  });
}

function applyImageAlign(component: any, align: ImageAlign) {
  const margins =
    align === 'left'
      ? { 'margin-left': '0', 'margin-right': 'auto' }
      : align === 'right'
        ? { 'margin-left': 'auto', 'margin-right': '0' }
        : { 'margin-left': 'auto', 'margin-right': 'auto' };

  component?.addStyle?.({
    display: 'block',
    ...margins,
  });
}

function applyImageSpacing(component: any, top: number, bottom: number) {
  component?.addStyle?.({
    'margin-top': `${top}px`,
    'margin-bottom': `${bottom}px`,
  });
}

export function ImageSelectionPanel({
  component,
  editor,
  imageUrl,
  isBusy,
  onEditComplete,
  onReplace,
  onClose,
}: ImageSelectionPanelProps) {
  const [width, setWidth] = useState(100);
  const [align, setAlign] = useState<ImageAlign>('center');
  const [marginTop, setMarginTop] = useState(0);
  const [marginBottom, setMarginBottom] = useState(0);
  const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);

  useEffect(() => {
    setWidth(Math.min(100, Math.max(20, readNumericStyle(component, 'width', 100))));
    setMarginTop(Math.min(160, Math.max(0, readNumericStyle(component, 'margin-top', 0))));
    setMarginBottom(Math.min(160, Math.max(0, readNumericStyle(component, 'margin-bottom', 0))));
    setAlign(inferAlignment(component));
    setCurrentImageUrl(imageUrl);
  }, [component, imageUrl]);

  useEffect(() => {
    setCurrentImageUrl(imageUrl);
  }, [imageUrl]);

  const handleEditComplete = useCallback(
    (newImageUrl: string) => {
      setCurrentImageUrl(newImageUrl);
      onEditComplete(newImageUrl);
    },
    [onEditComplete],
  );

  const commitWidth = useCallback(
    (nextWidth: number) => {
      setWidth(nextWidth);
      applyImageWidth(component, nextWidth);
      applyImageAlign(component, align);
      editor?.trigger?.('component:update', component);
    },
    [align, component, editor],
  );

  const commitAlign = useCallback(
    (nextAlign: ImageAlign) => {
      setAlign(nextAlign);
      applyImageAlign(component, nextAlign);
      editor?.trigger?.('component:update', component);
    },
    [component, editor],
  );

  const commitSpacing = useCallback(
    (top: number, bottom: number) => {
      setMarginTop(top);
      setMarginBottom(bottom);
      applyImageSpacing(component, top, bottom);
      editor?.trigger?.('component:update', component);
    },
    [component, editor],
  );

  const handleDelete = useCallback(() => {
    component?.remove?.();
    onClose();
  }, [component, onClose]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-slate-100 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700">이미지 빠른 편집</p>
            <p className="mt-0.5 text-[10px] text-slate-400">크기, 정렬, 여백을 바로 조절합니다</p>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg p-1.5 text-rose-500 transition-colors hover:bg-rose-50"
            title="이미지 삭제"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <img src={currentImageUrl} alt="선택 이미지" className="h-[128px] w-full object-contain" />
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Maximize2 size={12} />
                크기
              </span>
              <span className="text-xs font-semibold text-emerald-600">{width}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={width}
              onChange={(event) => commitWidth(Number(event.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {WIDTH_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => commitWidth(preset.value)}
                  className={cn(
                    'rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                    width === preset.value
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-600',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-medium text-slate-600">정렬</span>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['left', AlignLeft, '왼쪽'],
                ['center', AlignCenter, '가운데'],
                ['right', AlignRight, '오른쪽'],
              ] as const).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => commitAlign(value)}
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                    align === value
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-600',
                  )}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <ChevronsUpDown size={12} />
              위아래 여백
            </span>
            <SpacingSlider
              label="위"
              value={marginTop}
              onChange={(next) => commitSpacing(next, marginBottom)}
            />
            <SpacingSlider
              label="아래"
              value={marginBottom}
              onChange={(next) => commitSpacing(marginTop, next)}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              commitWidth(100);
              commitAlign('center');
              commitSpacing(0, 0);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-200 hover:text-emerald-600"
          >
            <Minimize2 size={13} />
            기본값으로
          </button>
        </div>
      </div>

      <AIImageEditPanel
        imageUrl={currentImageUrl}
        isBusy={isBusy}
        onEditComplete={handleEditComplete}
        onReplace={onReplace}
        onClose={onClose}
      />
    </div>
  );
}

function SpacingSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mb-2 grid grid-cols-[32px_1fr_42px] items-center gap-2">
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <input
        type="range"
        min={0}
        max={160}
        step={4}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-emerald-500"
      />
      <span className="text-right text-[11px] font-semibold text-slate-500">{value}px</span>
    </div>
  );
}
