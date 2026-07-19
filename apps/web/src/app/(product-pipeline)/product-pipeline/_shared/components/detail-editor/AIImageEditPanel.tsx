'use client';

import type { PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Crop,
  Eraser,
  Loader2,
  Paintbrush,
  RefreshCw,
  Replace,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import {
  cancelImageEditTaskAndRecoverResult,
  isImageEditPollingCancelled,
  pollImageEditTaskResult,
  submitImageCrop,
  submitImageEdit,
} from './lib/image-edit-task';

interface AIImageEditPanelProps {
  imageUrl: string;
  productId?: string;
  contentGenerationId?: string;
  isBusy: React.MutableRefObject<boolean>;
  onEditComplete: (newImageUrl: string) => void;
  onReplace: () => void;
  onGeneratingChange?: (v: boolean) => void;
  onClose: () => void;
}

type PresetType =
  | 'remove_background'
  | 'remove_text'
  | 'replace_background'
  | 'enhance'
  | 'full_regenerate'
  | 'custom';

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

type CropDragState = {
  handle: CropHandle;
  pointerId: number;
  startX: number;
  startY: number;
  startRect: CropRect;
};

interface PresetItem {
  id: PresetType;
  label: string;
  icon: ReactNode;
  needsInput?: boolean;
  inputPlaceholder?: string;
}

const PRESETS: PresetItem[] = [
  { id: 'remove_background', label: '배경 제거', icon: <Eraser size={13} /> },
  { id: 'remove_text', label: '텍스트 제거', icon: <Type size={13} /> },
  {
    id: 'replace_background',
    label: '배경 교체',
    icon: <Paintbrush size={13} />,
    needsInput: true,
    inputPlaceholder: '배경 스타일 (예: 깔끔한 흰색 스튜디오)',
  },
  { id: 'enhance', label: '화질 개선', icon: <Sparkles size={13} /> },
  { id: 'full_regenerate', label: '재생성', icon: <RefreshCw size={13} /> },
];

const DEFAULT_CROP_RECT: CropRect = { x: 0, y: 0, width: 100, height: 100 };

const CROP_HANDLES: Array<{
  id: Exclude<CropHandle, 'move'>;
  className: string;
  cursor: string;
}> = [
  { id: 'nw', className: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
  { id: 'n', className: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'ns-resize' },
  { id: 'ne', className: 'right-0 top-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
  { id: 'e', className: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { id: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
  { id: 's', className: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2', cursor: 'ns-resize' },
  { id: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
  { id: 'w', className: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeCropRect(rect: CropRect): CropRect {
  const x = clamp(rect.x, 0, 99);
  const y = clamp(rect.y, 0, 99);
  return {
    x,
    y,
    width: clamp(rect.width, 1, 100 - x),
    height: clamp(rect.height, 1, 100 - y),
  };
}

function getCropPoint(event: PointerEvent<HTMLElement>, surface: HTMLElement): { x: number; y: number } {
  const rect = surface.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100),
  };
}

function resizeCropRect(drag: CropDragState, x: number, y: number): CropRect {
  const dx = x - drag.startX;
  const dy = y - drag.startY;
  const source = drag.startRect;
  const sourceRight = source.x + source.width;
  const sourceBottom = source.y + source.height;

  if (drag.handle === 'move') {
    return normalizeCropRect({
      ...source,
      x: clamp(source.x + dx, 0, 100 - source.width),
      y: clamp(source.y + dy, 0, 100 - source.height),
    });
  }

  let left = source.x;
  let top = source.y;
  let right = sourceRight;
  let bottom = sourceBottom;

  if (drag.handle.includes('w')) left = clamp(source.x + dx, 0, right - 1);
  if (drag.handle.includes('e')) right = clamp(sourceRight + dx, left + 1, 100);
  if (drag.handle.includes('n')) top = clamp(source.y + dy, 0, bottom - 1);
  if (drag.handle.includes('s')) bottom = clamp(sourceBottom + dy, top + 1, 100);

  return normalizeCropRect({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

function isFullCrop(rect: CropRect): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === 100 && rect.height === 100;
}

export function AIImageEditPanel({
  imageUrl,
  productId,
  contentGenerationId,
  isBusy,
  onEditComplete,
  onReplace,
  onGeneratingChange,
  onClose,
}: AIImageEditPanelProps) {
  const [loading, setLoading] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [presetInput, setPresetInput] = useState<Record<string, string>>({});
  const [cropOpen, setCropOpen] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect>(DEFAULT_CROP_RECT);
  const [cropping, setCropping] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cropSurfaceRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<CropDragState | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      pollAbortRef.current?.abort();
    };
  }, []);

  const resolveImageUrlForEdit = useCallback(async () => {
    if (!cropOpen || isFullCrop(cropRect)) return imageUrl;
    const cropped = await submitImageCrop({ imageUrl, crop: cropRect });
    return cropped.imageUrl;
  }, [cropOpen, cropRect, imageUrl]);

  const startCropDrag = useCallback((event: PointerEvent<HTMLElement>, handle: CropHandle) => {
    if (!cropOpen || cropping || loading) return;
    const surface = cropSurfaceRef.current;
    if (!surface) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getCropPoint(event, surface);
    cropDragRef.current = {
      handle,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      startRect: cropRect,
    };
    surface.setPointerCapture?.(event.pointerId);
  }, [cropOpen, cropRect, cropping, loading]);

  const handleCropPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    const surface = cropSurfaceRef.current;
    if (!drag || !surface || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = getCropPoint(event, surface);
    setCropRect(resizeCropRect(drag, point.x, point.y));
  }, []);

  const handleCropPointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    cropDragRef.current = null;
    cropSurfaceRef.current?.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleApplyCrop = useCallback(async () => {
    if (isBusy.current) return;

    isBusy.current = true;
    setCropping(true);
    setLoadingPreset('crop');
    setError(null);
    try {
      const cropped = await submitImageCrop({ imageUrl, crop: cropRect });
      onEditComplete(cropped.imageUrl);
      setCropOpen(false);
      setCropRect(DEFAULT_CROP_RECT);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 자르기에 실패했습니다');
    } finally {
      isBusy.current = false;
      setCropping(false);
      setLoadingPreset(null);
    }
  }, [cropRect, imageUrl, isBusy, onEditComplete]);

  const runImageEdit = useCallback(
    async (input: { preset: string; userPrompt: string }) => {
      if (isBusy.current) return;

      const abortController = new AbortController();
      isBusy.current = true;
      setLoading(true);
      onGeneratingChange?.(true);
      setLoadingPreset(input.preset);
      setError(null);
      setCancelling(false);
      cancelRequestedRef.current = false;
      activeTaskIdRef.current = null;
      pollAbortRef.current = abortController;
      try {
        const editImageUrl = await resolveImageUrlForEdit();
        const { taskId } = await submitImageEdit({
          image_url: editImageUrl,
          preset: input.preset,
          user_prompt: input.userPrompt,
          productId,
          contentGenerationId,
        });
        activeTaskIdRef.current = taskId;
        if (cancelRequestedRef.current) {
          const preservedResult = await cancelImageEditTaskAndRecoverResult(taskId);
          if (preservedResult && mountedRef.current) {
            onEditComplete(preservedResult.image_url);
          }
          return;
        }
        const result = await pollImageEditTaskResult(taskId, {
          signal: abortController.signal,
        });
        if (cancelRequestedRef.current || abortController.signal.aborted) return;
        onEditComplete(result.image_url);
      } catch (err) {
        if (!isImageEditPollingCancelled(err) && !cancelRequestedRef.current) {
          setError(err instanceof Error ? err.message : '편집에 실패했습니다');
        }
      } finally {
        if (pollAbortRef.current === abortController) pollAbortRef.current = null;
        activeTaskIdRef.current = null;
        if (mountedRef.current) {
          isBusy.current = false;
          setLoading(false);
          onGeneratingChange?.(false);
          setLoadingPreset(null);
          setCancelling(false);
        }
      }
    },
    [
      contentGenerationId,
      isBusy,
      onEditComplete,
      onGeneratingChange,
      productId,
      resolveImageUrlForEdit,
    ],
  );

  const handlePresetClick = useCallback(
    async (preset: PresetItem) => {
      if (preset.needsInput && !presetInput[preset.id]) return;
      await runImageEdit({
        preset: preset.id,
        userPrompt: presetInput[preset.id] || '',
      });
    },
    [presetInput, runImageEdit],
  );

  const handleCustomSubmit = useCallback(async () => {
    if (!customPrompt.trim()) return;
    await runImageEdit({
      preset: 'custom',
      userPrompt: customPrompt.trim(),
    });
  }, [customPrompt, runImageEdit]);

  const handleCancelImageEdit = useCallback(async () => {
    cancelRequestedRef.current = true;
    pollAbortRef.current?.abort();
    const taskId = activeTaskIdRef.current;
    setCancelling(true);
    if (!taskId) {
      if (mountedRef.current) {
        isBusy.current = false;
        setLoading(false);
        onGeneratingChange?.(false);
        setLoadingPreset(null);
        setCancelling(false);
      }
      return;
    }
    try {
      const preservedResult = await cancelImageEditTaskAndRecoverResult(taskId);
      if (preservedResult && mountedRef.current) {
        onEditComplete(preservedResult.image_url);
      }
      setError(null);
    } catch (err) {
      cancelRequestedRef.current = false;
      setError(err instanceof Error ? err.message : '이미지 편집 중단 요청에 실패했습니다');
    } finally {
      if (mountedRef.current) {
        isBusy.current = false;
        setLoading(false);
        onGeneratingChange?.(false);
        setLoadingPreset(null);
        setCancelling(false);
      }
    }
  }, [isBusy, onEditComplete, onGeneratingChange]);

  const busy = loading || cropping || cancelling;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700">AI 이미지 처리 중...</span>
            </span>
            <button
              type="button"
              onClick={handleCancelImageEdit}
              disabled={cancelling}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelling ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              중단
            </button>
          </div>
        )}

        {cropping && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
            <Loader2 size={14} className="animate-spin text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">이미지 자르는 중...</span>
          </div>
        )}

        <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 p-2">
          <div className="flex justify-center">
            <div
              ref={cropSurfaceRef}
              className="relative max-w-full touch-none select-none"
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerEnd}
              onPointerCancel={handleCropPointerEnd}
            >
              <img
                src={imageUrl}
                alt="편집 대상"
                draggable={false}
                className="block max-h-[220px] max-w-full object-contain"
              />
              {cropOpen && (
                <div className="absolute inset-0">
                  <div className="absolute inset-0 bg-slate-950/35" />
                  <div
                    className="absolute border-2 border-emerald-400 bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.42)]"
                    style={{
                      left: `${cropRect.x}%`,
                      top: `${cropRect.y}%`,
                      width: `${cropRect.width}%`,
                      height: `${cropRect.height}%`,
                      cursor: 'move',
                    }}
                    onPointerDown={(event) => startCropDrag(event, 'move')}
                  >
                    {CROP_HANDLES.map((handle) => (
                      <button
                        key={handle.id}
                        type="button"
                        aria-label={`crop-${handle.id}`}
                        className={`absolute h-2.5 w-2.5 rounded-[2px] border border-blue-600 bg-white shadow-sm ${handle.className}`}
                        style={{ cursor: handle.cursor }}
                        onPointerDown={(event) => startCropDrag(event, handle.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <button
            type="button"
            onClick={() => setCropOpen((open) => !open)}
            disabled={busy}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="flex items-center gap-2">
              <Crop size={13} />
              이미지 자르기
            </span>
            <span className="text-[11px] text-slate-400">{cropOpen ? '영역 조절 중' : '열기'}</span>
          </button>

          {cropOpen && (
            <div className="space-y-2">
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setCropRect(DEFAULT_CROP_RECT)}
                  disabled={busy}
                  className="flex-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg disabled:opacity-50"
                >
                  초기화
                </button>
                <button
                  type="button"
                  onClick={handleApplyCrop}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingPreset === 'crop' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  자르기 적용
                </button>
              </div>
              <p className="text-[11px] leading-4 text-slate-500">
                이미지 위 네모 핸들을 드래그해서 영역을 잡으세요. 영역을 잡아둔 상태에서 아래 AI 편집을 누르면 잘린 이미지 기준으로 편집됩니다.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          {PRESETS.map((preset) => (
            <div key={preset.id}>
              <button
                type="button"
                onClick={() => !preset.needsInput && handlePresetClick(preset)}
                disabled={busy}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingPreset === preset.id ? <Loader2 size={13} className="animate-spin" /> : preset.icon}
                {preset.label}
              </button>
              {preset.needsInput && (
                <div className="flex gap-1.5 mt-1.5">
                  <input
                    type="text"
                    value={presetInput[preset.id] || ''}
                    onChange={(e) => setPresetInput((p) => ({ ...p, [preset.id]: e.target.value }))}
                    placeholder={preset.inputPlaceholder}
                    disabled={busy}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    onKeyDown={(e) => e.key === 'Enter' && handlePresetClick(preset)}
                  />
                  <button
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    disabled={busy || !presetInput[preset.id]}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    적용
                  </button>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={onReplace}
            disabled={busy}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <Replace size={13} />
            이미지 교체
          </button>
        </div>

        <div>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCustomSubmit();
              }
            }}
            placeholder="원하는 편집 내용을 입력하세요..."
            disabled={busy}
            rows={2}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={handleCustomSubmit}
            disabled={busy || !customPrompt.trim()}
            className="w-full mt-1.5 py-2 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingPreset === 'custom' ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'AI 편집 적용'}
          </button>
        </div>

        {error && (
          <div className="px-3 py-2 text-xs text-red-600 bg-red-50 rounded-lg border border-red-100">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
