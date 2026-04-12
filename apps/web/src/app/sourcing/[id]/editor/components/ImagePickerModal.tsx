'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Upload, X } from 'lucide-react';

type TabType = 'raw' | 'processed' | 'upload';

interface ImagePickerModalProps {
  open: boolean;
  onSelect: (imageUrl: string) => void;
  onClose: () => void;
  rawImages: string[];
  processedImages: string[];
}

const TABS: { id: TabType; label: string }[] = [
  { id: 'raw', label: '원본 이미지' },
  { id: 'processed', label: '생성 이미지' },
  { id: 'upload', label: '업로드' },
];

export function ImagePickerModal({ open, onSelect, onClose, rawImages, processedImages }: ImagePickerModalProps) {
  const [tab, setTab] = useState<TabType>('raw');
  const [selected, setSelected] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setUploadPreview(null);
      setTab(rawImages.length > 0 ? 'raw' : processedImages.length > 0 ? 'processed' : 'upload');
    }
  }, [open, rawImages.length, processedImages.length]);

  const handleFileChange = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadPreview(dataUrl);
      setSelected(dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileChange(file);
    },
    [handleFileChange],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) handleFileChange(file);
    },
    [handleFileChange],
  );

  if (!open) return null;

  const images = tab === 'raw' ? rawImages : tab === 'processed' ? processedImages : [];

  return (
    <div className="modal-overlay z-[100]" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[640px] max-w-[90vw] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
            <ImagePlus size={16} />
            이미지 선택
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                if (t.id !== 'upload') setUploadPreview(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                tab === t.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3" style={{ maxHeight: '60vh' }}>
          {tab === 'upload' ? (
            <div className="space-y-3">
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-slate-300 hover:border-emerald-300 hover:bg-slate-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                <p className="text-sm font-medium text-slate-600">클릭하거나 파일을 드래그하세요</p>
                <p className="text-xs text-slate-400 mt-1">PNG, JPG, WebP</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />
              {uploadPreview && (
                <div className="flex justify-center">
                  <img
                    src={uploadPreview}
                    alt="업로드 미리보기"
                    className="max-h-[200px] rounded-lg object-contain border border-slate-200"
                  />
                </div>
              )}
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <ImagePlus size={32} className="mb-2" />
              <p className="text-sm">이미지가 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {images.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setSelected(url)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    selected === url
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                      : 'border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {selected === url && (
                    <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                      <Check size={24} className="text-white drop-shadow-md" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            선택
          </button>
        </div>
      </div>
    </div>
  );
}
