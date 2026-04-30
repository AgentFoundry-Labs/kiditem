'use client';

import { ArrowLeft, ChevronRight, Scissors, Sparkles } from 'lucide-react';
import type { EditUseCase } from '../../components/UseCaseSelection';
import { EDIT_CASE_LABEL, type EditorMode } from '../lib/edit-page-types';

interface Props {
  productName: string;
  mode: EditorMode;
  editCase: EditUseCase | null;
  onBack: () => void;
  onOpenModeModal: () => void;
}

export function EditorPageHeader({ productName, mode, editCase, onBack, onOpenModeModal }: Props) {
  return (
    <div
      className="flex-shrink-0 bg-white/80 backdrop-blur-sm"
      style={{ borderBottom: '1px solid rgba(229,231,235,0.6)' }}
    >
      <div className="flex items-center px-4 py-3 gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors px-2 py-1 rounded-md hover:bg-gray-100"
          aria-label="허브로 돌아가기"
        >
          <ArrowLeft size={14} />
          <span>허브</span>
        </button>
        <div className="w-px h-4 bg-gray-200" />
        {productName && (
          <h1 className="text-base font-extrabold text-gray-900 tracking-tight truncate min-w-0">
            {productName}
          </h1>
        )}

        <button
          type="button"
          onClick={onOpenModeModal}
          className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/50 transition-all group"
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              background: mode === 'edit' ? 'rgba(139,92,246,0.12)' : 'rgba(217,70,239,0.12)',
            }}
          >
            {mode === 'edit'
              ? <Scissors size={12} className="text-violet-600" />
              : <Sparkles size={12} className="text-fuchsia-600" />}
          </div>
          <span className="text-xs font-semibold text-gray-700">
            {mode === 'edit' ? '이미지 편집' : 'AI 연출 생성'}
          </span>
          {mode === 'edit' && editCase && (
            <>
              <ChevronRight size={12} className="text-gray-300" />
              <span className="text-xs font-semibold text-gray-900">
                {EDIT_CASE_LABEL[editCase]}
              </span>
            </>
          )}
          <ChevronRight
            size={12}
            className="text-gray-400 group-hover:text-violet-500 transition-colors ml-1"
          />
        </button>
      </div>
    </div>
  );
}
