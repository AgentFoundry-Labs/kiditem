'use client';

import { useEffect } from 'react';
import { X, ScanSearch } from 'lucide-react';
import { UploadAnalyzer } from './UploadAnalyzer';
import type { ThumbnailAnalysisResult } from '@kiditem/shared';

interface InspectionDrawerProps {
  open: boolean;
  onClose: () => void;
  onAnalyzed?: (result: ThumbnailAnalysisResult) => void;
}

export function InspectionDrawer({ open, onClose, onAnalyzed }: InspectionDrawerProps) {
  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,0.35)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-out"
        style={{
          width: 700,
          background: 'var(--thumb-page-bg, #f8fafc)',
          borderLeft: '1px solid var(--thumb-border-subtle, #e2e8f0)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--thumb-border-subtle, #e2e8f0)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--thumb-primary-subtle, #ede9fe)' }}
            >
              <ScanSearch size={16} style={{ color: 'var(--thumb-primary, #7c3aed)' }} />
            </div>
            <div>
              <div className="text-[15px] font-bold" style={{ color: 'var(--thumb-text-primary, #0f172a)' }}>
                등록 전 이미지 검수
              </div>
              <div className="text-[12px]" style={{ color: 'var(--thumb-text-tertiary, #94a3b8)' }}>
                쿠팡 가이드라인 기준 썸네일 분석
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
            style={{ color: 'var(--thumb-text-quaternary, #cbd5e1)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <UploadAnalyzer onAnalyzed={onAnalyzed} />
        </div>
      </div>
    </>
  );
}
