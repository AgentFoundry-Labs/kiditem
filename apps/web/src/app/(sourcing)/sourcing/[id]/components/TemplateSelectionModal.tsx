'use client';

// 상세페이지 생성 모달 — 템플릿 + 모드 선택 UI.
//
// 흐름:
//   "상세페이지 생성" 버튼 클릭 → 모달 열림
//   → 템플릿 카드 (bold-vertical / kids-playful) 선택
//   → 모드 선택 (draft / image / full) 선택
//   → 생성 시작 버튼 → onConfirm(templateId, mode) 호출
//   → 부모가 useGenerateDetailPage(productId).mutate({ templateId, mode })
//
// 향후 Python ContentAgent 가 template_id 별로 다른 prompt/조립 로직 분기.
// bold-vertical / kids-playful 모두 media-ai sync generation path 를 사용.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Check, Wand2, Image as ImageIcon, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GenerateMode } from '../hooks/useGenerateDetailPage';

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
    name: 'Bold Vertical',
    description:
      '풀 파이프라인(Step1 → Step2). hero/studio/detail 이미지 다양하게 생성 — 식품·완구·강한 시각 임팩트 필요할 때. 1~3.5분.',
    status: 'ready',
    thumbnailEmoji: '✨',
  },
  {
    id: 'kids-playful',
    name: 'Trend Vertical',
    description:
      '귀엽고 발랄한 톤 — pain-point 핑크 섹션 + 넘버드 포인트 + 라이프스타일 갤러리. 유아·키즈·트렌디 카테고리.',
    status: 'ready',
    thumbnailEmoji: '⚡',
  },
];

interface ModeOption {
  id: GenerateMode;
  name: string;
  description: string;
  duration: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const MODES: ModeOption[] = [
  {
    id: 'draft',
    name: '카피 + 색상',
    description: '제목, 카피, 핵심 포인트, FAQ, 키워드까지 풀세트 텍스트 생성',
    duration: '5~30초',
    icon: Wand2,
  },
  {
    id: 'image',
    name: '이미지만',
    description: 'hero / studio / detail 이미지 4~6장 생성 (카피가 이미 있어야 함)',
    duration: '1~3분',
    icon: ImageIcon,
  },
  {
    id: 'full',
    name: '전체 생성',
    description: '카피 + 이미지 한 번에 (Step1 → Step2 연쇄)',
    duration: '1~3.5분',
    icon: Layers,
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
  const [mode, setMode] = useState<GenerateMode>(defaultMode);

  // ProductCard 등 부모가 transform/filter 를 사용하면 position:fixed 좌표계가 부모 내부로 묶임.
  // → React portal 로 document.body 에 직접 mount → 항상 viewport 기준 fullscreen 오버레이.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleConfirm = () => {
    onConfirm(templateId, mode);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      // 외부 클릭으로 닫히지 않음 — 사용자가 템플릿/모드 고르다가 실수로 백드롭 클릭 → 모달 사라져
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
        <div className="px-6 py-5 space-y-6">
          {/* Template selection — 가로 3개 배열, 세로 긴 직사각형 카드 (버튼식) */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">1. 템플릿 선택</h3>
            <div className="grid grid-cols-3 gap-3">
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

          {/* Mode selection — kids-playful 은 단일 1-call 흐름이라 mode 무관, hide */}
          {templateId !== 'kids-playful' ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">2. 생성 모드</h3>
              <div className="space-y-2">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left transition-all',
                        mode === m.id
                          ? 'border-violet-500 bg-violet-50'
                          : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                          mode === m.id
                            ? 'bg-violet-500 text-white'
                            : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">{m.name}</h4>
                          <span className="text-[10px] font-medium text-slate-400">
                            {m.duration}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-500">
                          {m.description}
                        </p>
                      </div>
                      {mode === m.id && (
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-violet-200 bg-violet-50/50 p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">
                Trend Vertical — 1-call 자동 생성
              </h3>
              <p className="text-[11px] leading-relaxed text-slate-500">
                상품 raw 데이터 + 이미지로 11 섹션 카피와 이미지 매칭을 한 번에 생성합니다.
                별도 모드 선택 없이 바로 "생성 시작" 누르면 5~30초 소요. 결과는 자동으로
                <span className="font-bold"> 상세페이지 생성 이력</span>에 저장돼서
                <span className="font-mono"> /generate</span> 페이지에서 다시 볼 수 있어요.
              </p>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
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
