'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Pencil, Scissors, Sparkles, Wand2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { EditUseCase } from '../control/UseCaseSelection';

type CreativeScene = 'white-studio' | 'lifestyle' | 'outdoor' | 'concept';

export type FeatureSelection =
  | { mode: 'edit'; editCase: EditUseCase }
  | { mode: 'creative'; scene?: CreativeScene; customPrompt?: boolean };

interface Props {
  open: boolean;
  productName?: string;
  onClose: () => void;
  onSelect: (selection: FeatureSelection) => void;
}

type SceneCard = {
  key: CreativeScene;
  title: string;
  Graphic: React.ComponentType;
};

const SCENE_CARDS: SceneCard[] = [
  { key: 'white-studio', title: 'White studio', Graphic: WhiteStudioGraphic },
  { key: 'lifestyle', title: 'Lifestyle', Graphic: LifestyleGraphic },
  { key: 'outdoor', title: 'Outdoor', Graphic: OutdoorGraphic },
  { key: 'concept', title: 'Concept', Graphic: ConceptGraphic },
];

type InternalSelection =
  | { kind: 'edit' }
  | { kind: 'scene'; scene: CreativeScene }
  | { kind: 'prompt' };

export function FeatureSelectionModal({ open, productName, onClose, onSelect }: Props) {
  const [selected, setSelected] = useState<InternalSelection | null>(null);

  // 모달 새로 열릴 때 선택 상태 초기화. (Escape/포커스 트랩은 Radix Dialog 가 처리)
  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  const confirm = () => {
    if (!selected) return;
    if (selected.kind === 'edit') {
      onSelect({ mode: 'edit', editCase: 'single' });
    } else if (selected.kind === 'scene') {
      onSelect({ mode: 'creative', scene: selected.scene });
    } else {
      onSelect({ mode: 'creative', customPrompt: true });
    }
  };

  const isSelectedEdit = selected?.kind === 'edit';
  const isSelectedScene = (k: CreativeScene) =>
    selected?.kind === 'scene' && selected.scene === k;
  const isSelectedPrompt = selected?.kind === 'prompt';

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,56rem)] max-h-[92vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto bg-white rounded-3xl border border-gray-200 shadow-2xl shadow-violet-900/10 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
        <div className="flex items-start justify-between px-8 pt-8 pb-5 border-b border-gray-200">
          <div>
            <Dialog.Title className="text-2xl font-extrabold text-gray-900 tracking-tight">
              어떤 편집이 필요하세요?
            </Dialog.Title>
            <div className="text-sm font-bold text-violet-600 mt-1">
              Thumbnail Architect
              {productName && <span className="text-gray-500 font-medium"> — {productName}</span>}
            </div>
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-900 transition-colors"
              aria-label="닫기"
            >
              <X size={18} />
            </button>
          </Dialog.Close>
        </div>

        <div className="px-8 py-6 space-y-8 flex-1">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Scissors size={16} className="text-violet-700" />
              <h3 className="text-base font-bold text-gray-900">쿠팡 썸네일 자동 정리</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelected({ kind: 'edit' })}
              className={cn(
                'relative w-full rounded-2xl overflow-hidden border-2 bg-white/80 text-left transition-all flex',
                isSelectedEdit
                  ? 'border-violet-500 shadow-lg shadow-violet-300/30 ring-2 ring-violet-200'
                  : 'border-transparent hover:border-violet-200 shadow-sm hover:shadow-md',
              )}
            >
              <div className="w-60 shrink-0 aspect-[4/3]">
                <BackgroundRemoveGraphic />
              </div>
              <div className="flex-1 px-5 py-5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-violet-600" />
                  <div className="text-sm font-bold text-gray-900">흰배경 · 쿠팡 가이드 대표 이미지</div>
                </div>
                <div className="text-[12px] text-gray-600 leading-relaxed">
                  배경 제거 · 톤 보정 · 정책 준수까지 한 번에. 올린 이미지 종류에 맞춰 AI 프롬프트가 자동으로 맞춰집니다.
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] font-bold bg-violet-50 text-violet-700 rounded-md px-2 py-0.5">
                    단일 정리
                  </span>
                  <span className="text-[11px] font-bold bg-violet-50 text-violet-700 rounded-md px-2 py-0.5">
                    박스·패키지 합성
                  </span>
                  <span className="text-[11px] font-bold bg-violet-50 text-violet-700 rounded-md px-2 py-0.5">
                    색상 옵션
                  </span>
                  <span className="text-[11px] font-bold bg-violet-50 text-violet-700 rounded-md px-2 py-0.5">
                    번들 구성
                  </span>
                </div>
              </div>
            </button>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Wand2 size={16} className="text-violet-700" />
              <h3 className="text-base font-bold text-gray-900">AI 연출 생성</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {SCENE_CARDS.map((s) => {
                const active = isSelectedScene(s.key);
                const Graphic = s.Graphic;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSelected({ kind: 'scene', scene: s.key })}
                    className={cn(
                      'rounded-2xl overflow-hidden bg-white/80 border-2 transition-all text-left',
                      active
                        ? 'border-fuchsia-500 shadow-lg shadow-fuchsia-300/30 ring-2 ring-fuchsia-200'
                        : 'border-transparent hover:border-fuchsia-200 shadow-sm hover:shadow-md',
                    )}
                  >
                    <div className="aspect-square w-full">
                      <Graphic />
                    </div>
                    <div className="py-3 text-center text-sm font-semibold text-gray-900">
                      {s.title}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setSelected({ kind: 'prompt' })}
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm font-bold transition-colors',
                  isSelectedPrompt
                    ? 'text-violet-700 underline'
                    : 'text-violet-600 hover:text-violet-700 hover:underline',
                )}
              >
                <Pencil size={14} />
                프롬프트로 직접 입력
              </button>
            </div>
          </section>
        </div>

        <div className="px-8 py-5 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-gray-700 hover:text-gray-900 transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={confirm}
            className={cn(
              'inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-300/40 transition-all',
              selected
                ? 'bg-violet-600 text-white hover:bg-violet-700'
                : 'bg-violet-300 text-white cursor-not-allowed shadow-none',
            )}
          >
            Next
            <ArrowRight size={16} />
          </button>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BackgroundRemoveGraphic() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-teal-400 via-cyan-500 to-sky-500">
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <pattern id="bgremove-checker" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
            <rect width="9" height="9" fill="white" fillOpacity="0.45" />
            <rect x="9" y="9" width="9" height="9" fill="white" fillOpacity="0.45" />
          </pattern>
        </defs>

        <rect x="50" y="40" width="300" height="220" rx="14" fill="url(#bgremove-checker)" stroke="white" strokeOpacity="0.6" strokeWidth="2" />

        <g transform="translate(200 155)">
          <ellipse cx="0" cy="80" rx="58" ry="10" fill="black" opacity="0.18" />
          <rect x="-22" y="-70" width="44" height="22" rx="6" fill="white" />
          <rect x="-38" y="-48" width="76" height="120" rx="14" fill="white" />
          <rect x="-26" y="-20" width="52" height="38" rx="3" fill="#06b6d4" opacity="0.45" />
          <rect x="-26" y="-20" width="52" height="10" rx="3" fill="#22d3ee" opacity="0.6" />
        </g>

        <g transform="translate(200 155)" stroke="white" strokeWidth="2.2" strokeDasharray="5 4" fill="none" opacity="0.9" className="animate-pulse">
          <path d="M-48 -74 L34 -74 L50 -50 L50 80 L-50 80 L-50 -50 Z" />
        </g>

        <g transform="translate(330 72)" opacity="0.95">
          <circle cx="-7" cy="-5" r="6.5" fill="none" stroke="white" strokeWidth="2.5" />
          <circle cx="-7" cy="9" r="6.5" fill="none" stroke="white" strokeWidth="2.5" />
          <path d="M-2 -2 L20 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M-2 6 L20 -16" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        <g fill="white" className="animate-pulse">
          <path d="M75 80 L77 87 L84 89 L77 91 L75 98 L73 91 L66 89 L73 87 Z" />
          <circle cx="360" cy="230" r="3" />
        </g>
      </svg>
    </div>
  );
}

function WhiteStudioGraphic() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-slate-100 via-white to-slate-200">
      <svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="ws-light" cx="0.5" cy="0.25" r="0.7">
            <stop offset="0" stopColor="white" stopOpacity="0.95" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ws-bottle" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#e2e8f0" />
            <stop offset="0.5" stopColor="white" />
            <stop offset="1" stopColor="#cbd5e1" />
          </linearGradient>
        </defs>

        <rect width="300" height="300" fill="url(#ws-light)" />
        <path d="M0 190 Q150 150 300 190 L300 300 L0 300 Z" fill="white" opacity="0.95" />
        <ellipse cx="150" cy="240" rx="72" ry="10" fill="black" opacity="0.12" />

        <g transform="translate(150 120)">
          <path d="M-22 -50 L22 -50 L22 -35 Q32 -25 32 10 Q32 60 22 95 L-22 95 Q-32 60 -32 10 Q-32 -25 -22 -35 Z" fill="url(#ws-bottle)" stroke="#cbd5e1" strokeWidth="1" />
          <rect x="-18" y="-48" width="36" height="14" rx="3" fill="#94a3b8" />
          <rect x="-20" y="15" width="40" height="48" rx="3" fill="#64748b" opacity="0.85" />
          <rect x="-15" y="20" width="30" height="3" rx="1.5" fill="white" opacity="0.8" />
          <rect x="-12" y="28" width="24" height="2.5" rx="1" fill="white" opacity="0.6" />
          <rect x="-15" y="45" width="22" height="3" rx="1.5" fill="white" opacity="0.8" />
        </g>

        <circle cx="150" cy="100" r="100" fill="none" stroke="white" strokeWidth="1.5" opacity="0.5" />
      </svg>
    </div>
  );
}

function LifestyleGraphic() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-amber-200 via-orange-300 to-rose-300">
      <svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <rect x="180" y="35" width="95" height="130" rx="4" fill="#fef3c7" opacity="0.95" />
        <rect x="180" y="35" width="95" height="130" rx="4" fill="none" stroke="#78350f" strokeWidth="3" opacity="0.55" />
        <path d="M227.5 35 L227.5 165 M180 100 L275 100" stroke="#78350f" strokeWidth="2" opacity="0.4" />

        <path d="M180 40 L0 170 L0 230 Z" fill="#fef3c7" opacity="0.55" />

        <rect x="15" y="230" width="270" height="13" rx="4" fill="#92400e" />
        <rect x="35" y="243" width="10" height="55" fill="#78350f" />
        <rect x="255" y="243" width="10" height="55" fill="#78350f" />

        <g transform="translate(50 180)">
          <rect x="0" y="30" width="34" height="28" rx="3" fill="#7c2d12" />
          <rect x="-2" y="28" width="38" height="6" rx="2" fill="#92400e" />
          <path d="M17 30 Q-5 8 6 -12 Q17 2 17 30" fill="#16a34a" />
          <path d="M17 30 Q40 8 28 -12 Q17 2 17 30" fill="#16a34a" />
          <path d="M17 30 Q17 10 17 -8" stroke="#14532d" strokeWidth="1.5" fill="none" opacity="0.4" />
        </g>

        <g transform="translate(170 188)">
          <ellipse cx="22" cy="46" rx="28" ry="4" fill="black" opacity="0.15" />
          <path d="M0 8 L0 38 Q0 44 6 44 L38 44 Q44 44 44 38 L44 8 Z" fill="white" />
          <ellipse cx="22" cy="8" rx="22" ry="4" fill="#f5f5f4" />
          <ellipse cx="22" cy="8" rx="18" ry="3" fill="#78350f" opacity="0.35" />
          <path d="M44 14 Q58 18 58 28 Q58 38 44 35" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" />
        </g>

        <g fill="#fde68a" className="animate-pulse" opacity="0.9">
          <circle cx="100" cy="80" r="3" />
          <circle cx="140" cy="50" r="2" />
          <circle cx="80" cy="140" r="2.5" />
        </g>
      </svg>
    </div>
  );
}

function OutdoorGraphic() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-b from-sky-400 via-cyan-300 to-emerald-400">
      <svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <circle cx="230" cy="65" r="28" fill="#fde047" opacity="0.95" />
        <circle cx="230" cy="65" r="44" fill="#fde047" opacity="0.3" className="animate-pulse" />

        <g fill="white" opacity="0.9">
          <ellipse cx="70" cy="55" rx="26" ry="9" />
          <ellipse cx="88" cy="50" rx="16" ry="7" />
          <ellipse cx="160" cy="85" rx="22" ry="7" />
        </g>

        <path d="M0 200 L60 125 L110 170 L170 115 L220 160 L300 138 L300 200 Z" fill="#059669" opacity="0.85" />
        <path d="M0 212 L50 170 L100 200 L160 155 L220 195 L300 172 L300 212 Z" fill="#047857" opacity="0.9" />

        <path d="M0 232 Q150 212 300 232 L300 300 L0 300 Z" fill="#22c55e" />
        <path d="M0 262 Q150 240 300 262 L300 300 L0 300 Z" fill="#16a34a" />

        <g transform="translate(35 195)">
          <rect x="8" y="30" width="6" height="22" fill="#78350f" />
          <polygon points="11,-2 24,32 -2,32" fill="#15803d" />
          <polygon points="11,8 20,32 2,32" fill="#166534" />
        </g>
        <g transform="translate(250 205)">
          <rect x="6" y="22" width="5" height="16" fill="#78350f" />
          <polygon points="8,0 18,24 -2,24" fill="#15803d" />
        </g>

        <g transform="translate(125 218)">
          <ellipse cx="25" cy="66" rx="24" ry="4" fill="black" opacity="0.22" />
          <rect x="15" y="-22" width="20" height="12" rx="3" fill="#0c4a6e" />
          <rect x="10" y="-10" width="30" height="76" rx="6" fill="#0284c7" />
          <rect x="10" y="8" width="30" height="22" rx="2" fill="white" opacity="0.75" />
          <rect x="14" y="14" width="22" height="3" rx="1.5" fill="#0284c7" opacity="0.8" />
        </g>
      </svg>
    </div>
  );
}

function ConceptGraphic() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-fuchsia-500 via-purple-600 to-indigo-700">
      <svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <circle cx="75" cy="75" r="48" fill="#f472b6" opacity="0.75" />
        <circle cx="225" cy="95" r="32" fill="#fbbf24" opacity="0.88" />
        <rect x="185" y="180" width="68" height="68" rx="12" fill="#22d3ee" opacity="0.82" transform="rotate(15 219 214)" />
        <polygon points="45,250 95,180 135,250" fill="#a3e635" opacity="0.85" />

        <circle cx="150" cy="150" r="92" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="4 6" opacity="0.55" className="animate-pulse" />
        <circle cx="150" cy="150" r="60" fill="none" stroke="white" strokeWidth="1" opacity="0.45" />

        <g transform="translate(150 150)">
          <ellipse cx="0" cy="32" rx="30" ry="6" fill="black" opacity="0.3" />
          <rect x="-27" y="-38" width="54" height="66" rx="10" fill="white" />
          <rect x="-27" y="-38" width="54" height="22" rx="10" fill="white" opacity="0.6" />
          <rect x="-20" y="-10" width="40" height="3" rx="1.5" fill="#a78bfa" opacity="0.7" />
          <rect x="-16" y="-2" width="32" height="2.5" rx="1" fill="#c4b5fd" opacity="0.6" />
        </g>

        <g fill="white" className="animate-pulse">
          <path d="M250 55 L253 66 L264 69 L253 72 L250 83 L247 72 L236 69 L247 66 Z" />
          <path d="M55 220 L57 227 L64 229 L57 231 L55 238 L53 231 L46 229 L53 227 Z" />
          <circle cx="270" cy="250" r="3" />
          <circle cx="30" cy="160" r="2" />
        </g>
      </svg>
    </div>
  );
}
