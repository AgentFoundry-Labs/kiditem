'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Scissors, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EditUseCase } from './UseCaseSelection';
import type { EditorMode } from '../../edit/page';

interface Props {
  open: boolean;
  onClose: () => void;
  mode: EditorMode;
  editCase: EditUseCase | null;
  onSelect: (mode: EditorMode, editCase: EditUseCase | null) => void;
}

/**
 * 모드 전환 모달.
 *
 * 진입 후 사용자가 "편집 ↔ 연출" 트랙만 바꿀 수 있게 한다. 세부 editCase
 * (compose/color-variants/single/bundle) 는 슬롯 구성으로 자동 분류 (`pickCaseFromSlots`)
 * 되므로 사용자에게 다시 묻지 않는다 — 박스 슬롯 추가하면 compose, 색상 슬롯 추가하면
 * color-variants 식. UseCaseSelection 의 2 트랙 의도와 일관.
 *
 * editCase 인자는 호출부 호환을 위해 그대로 받지만 모달 내부에서는 "편집 모드면
 * 기본값 single 유지" 정도로만 쓴다. 정확한 케이스는 generate 직전에 `pickCaseFromSlots`
 * 가 다시 결정.
 *
 * Radix Dialog 기반 — focus trap, Escape 닫기, role="dialog"/aria-modal 자동 제공.
 */
export function ModeCaseModal({ open, onClose, mode, editCase, onSelect }: Props) {
  const choose = (nextMode: EditorMode) => {
    if (nextMode === 'creative') {
      onSelect('creative', null);
    } else {
      // 편집 모드는 항상 'single' 시작점. 슬롯에 박스/색상/번들 추가하면 자동 승격.
      onSelect('edit', editCase ?? 'single');
    }
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
                Workflow
              </div>
              <Dialog.Title className="text-[15px] font-bold text-gray-900 mt-0.5">
                모드 변경
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="닫기"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </Dialog.Close>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => choose('edit')}
                className={cn(
                  'flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all',
                  mode === 'edit'
                    ? 'bg-violet-50 border border-violet-200 ring-1 ring-violet-100'
                    : 'bg-white border border-gray-200 hover:border-gray-300',
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                    mode === 'edit' ? 'bg-violet-100' : 'bg-gray-100',
                  )}
                >
                  <Scissors size={16} className={mode === 'edit' ? 'text-violet-600' : 'text-gray-500'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn('text-sm font-bold', mode === 'edit' ? 'text-violet-900' : 'text-gray-800')}>
                    쿠팡 썸네일 자동 정리
                  </div>
                  <div className="text-[11px] text-gray-500 leading-snug mt-0.5">
                    흰배경 · 가이드라인 준수 — 박스·색상·번들 이미지 추가하면 자동 구성
                  </div>
                </div>
                {mode === 'edit' && <Check size={14} className="text-violet-600 flex-shrink-0" />}
              </button>

              <button
                type="button"
                onClick={() => choose('creative')}
                className={cn(
                  'flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all',
                  mode === 'creative'
                    ? 'bg-fuchsia-50 border border-fuchsia-200 ring-1 ring-fuchsia-100'
                    : 'bg-white border border-gray-200 hover:border-gray-300',
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                    mode === 'creative' ? 'bg-fuchsia-100' : 'bg-gray-100',
                  )}
                >
                  <Sparkles size={16} className={mode === 'creative' ? 'text-fuchsia-600' : 'text-gray-500'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn('text-sm font-bold', mode === 'creative' ? 'text-fuchsia-900' : 'text-gray-800')}>
                    AI 연출 생성
                  </div>
                  <div className="text-[11px] text-gray-500 leading-snug mt-0.5">
                    라이프스타일 · 아웃도어 · 컨셉 배경
                  </div>
                </div>
                {mode === 'creative' && <Check size={14} className="text-fuchsia-600 flex-shrink-0" />}
              </button>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed pt-1 px-1">
              세부 케이스(단품·박스·색상·번들)는 추가하는 이미지 종류에 따라 자동 분류됩니다.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
