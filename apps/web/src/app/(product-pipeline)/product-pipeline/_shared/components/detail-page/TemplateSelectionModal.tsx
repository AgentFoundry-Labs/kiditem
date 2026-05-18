'use client';

// 상세페이지 생성 모달 — 템플릿 선택 UI.
//
// 흐름:
//   "상세페이지 생성" 버튼 클릭 → 모달 열림
//   → 템플릿 카드 (bold-vertical / kids-playful) 선택
//   → 생성 시작 버튼 → onConfirm(templateId, mode) 호출
//   → 부모가 useGenerateDetailPage(productId).mutate({ templateId, mode })
//
// 향후 Python ContentAgent 가 template_id 별로 다른 prompt/조립 로직 분기.
// bold-vertical / kids-playful 모두 media-ai sync generation path 를 사용.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GenerateMode } from '../../hooks/useGenerateDetailPage';

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  status: 'ready' | 'preview';
  thumbnailEmoji: string;
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'bold-vertical',
    name: 'KIDITEM DESIGN',
    description:
      '키디아이템 자체 시그니처 — 굵직한 헤드라인 + 풀세트 섹션. 키디아이템 브랜드 라인 / 식품·완구·키즈.',
    status: 'ready',
    thumbnailEmoji: '👑',
  },
  {
    id: 'kids-playful',
    name: '트렌드 광고형 템플릿',
    description:
      '광고 reel 스타일 — 컬러 블록 + 라이프스타일 + 강한 CTA. 여름·계절 한정·이벤트성 상품.',
    status: 'ready',
    thumbnailEmoji: '📣',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (templateId: string, mode: GenerateMode) => void;
  defaultTemplateId?: string;
  defaultMode?: GenerateMode;
}

export default function TemplateSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  defaultTemplateId = 'bold-vertical',
  defaultMode = 'draft',
}: Props) {
  const [templateId, setTemplateId] = useState<string>(defaultTemplateId);

  // ProductCard 등 부모가 transform/filter 를 사용하면 position:fixed 좌표계가 부모 내부로 묶임.
  // → React portal 로 document.body 에 직접 mount → 항상 viewport 기준 fullscreen 오버레이.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleConfirm = () => {
    onConfirm(templateId, defaultMode);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      // 외부 클릭으로 닫히지 않음 — 사용자가 템플릿 고르다가 실수로 백드롭 클릭 → 모달 사라져
      // "생성 시작" 못 누른 채 끝나는 케이스 방지. 명시적 X / 취소 버튼 / Escape 로만 닫힘.
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-600" />
            <h2 className="text-base font-bold text-slate-900">상세페이지 생성</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Template selection — 현재 템플릿 수에 맞춰 카드가 모달 폭을 채우도록 배치 */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">템플릿 선택</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={cn(
                    'group relative flex flex-col items-center rounded-xl border-2 px-4 py-6 text-center transition-all',
                    templateId === t.id
                      ? 'border-violet-500 bg-violet-50 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 bg-white',
                  )}
                  style={{ minHeight: '260px' }}
                >
                  {templateId === t.id && (
                    <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white shadow">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                  <div className="text-5xl mb-4 mt-3">{t.thumbnailEmoji}</div>
                  <div className="mb-2 flex flex-col items-center gap-1">
                    <h4 className="text-sm font-bold text-slate-900">{t.name}</h4>
                    {t.status === 'preview' && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                        Preview
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500 px-1">
                    {t.description}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-center border-t border-slate-200 bg-white px-6 py-4">
          <button
            onClick={handleConfirm}
            className="inline-flex h-11 min-w-40 items-center justify-center gap-2 rounded-md bg-violet-600 px-6 text-center text-sm font-semibold leading-none text-white transition-colors hover:bg-violet-700"
          >
            <Sparkles size={14} />
            생성 시작
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
