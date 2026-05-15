'use client';
import {
  Archive,
  Box,
  Boxes,
  Camera,
  Grid3x3,
  Layers,
  Lightbulb,
  Package,
  PackageOpen,
  Shapes,
  Sparkles,
  Type,
} from 'lucide-react';
import type {
  RecomposeKind,
  RecomposeVariantClassification,
  RecomposeVariantKey,
} from '@kiditem/shared/ai';
import { cn } from '@/lib/utils';

interface RecomposeVariantPickerProps {
  classification: RecomposeVariantClassification;
  loading?: boolean;
  /**
   * 사용자가 변형을 선택했을 때 호출.
   * - `auto` 또는 `requiresChoice=false` 케이스에서는 `undefined` 가 넘어옴 (서버 기본값 사용).
   * - `with-box` / `no-box` 는 사용자가 명시적으로 고른 prompt override.
   */
  onSelect: (variantKey: RecomposeVariantKey | undefined) => void;
  /**
   * 표시 모드.
   * - `card`: AiEdit 탭의 PendingCard 같이 좁은 인라인 영역 (작은 뱃지 + 한 줄 버튼)
   * - `detail`: DetailModal 같이 분석 결과 하단 (큰 뱃지 + 옵션 카드 그리드)
   */
  layout?: 'card' | 'detail';
}

const KIND_LABELS: Record<RecomposeKind, string> = {
  'single-product': '단일 상품',
  'single-with-accessories': '상품+부속품',
  'multi-pack-loose': '멀티팩',
  'multi-variant-loose': '세트/번들',
  'mixed-item-set': '믹스 세트',
  'lighting-lifestyle': '조명 무드',
  'box-with-loose-same': '박스+상품(중복)',
  'box-with-loose-diff': '박스+상품',
  'box-only-window': '박스만 (투명창)',
  'box-only-opaque': '박스만',
  'lifestyle-context': '라이프스타일',
  'text-heavy': '텍스트 위주',
};

const KIND_TONE: Record<RecomposeKind, { bg: string; text: string; iconBg: string }> = {
  'single-product': {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    iconBg: 'bg-blue-100',
  },
  'single-with-accessories': {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    iconBg: 'bg-sky-100',
  },
  'multi-pack-loose': {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    iconBg: 'bg-emerald-100',
  },
  'multi-variant-loose': {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    iconBg: 'bg-teal-100',
  },
  'mixed-item-set': {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    iconBg: 'bg-cyan-100',
  },
  'lighting-lifestyle': {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    iconBg: 'bg-yellow-100',
  },
  'box-with-loose-same': {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    iconBg: 'bg-purple-100',
  },
  'box-with-loose-diff': {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    iconBg: 'bg-indigo-100',
  },
  'box-only-window': {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    iconBg: 'bg-amber-100',
  },
  'box-only-opaque': {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    iconBg: 'bg-orange-100',
  },
  'lifestyle-context': {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    iconBg: 'bg-rose-100',
  },
  'text-heavy': {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    iconBg: 'bg-slate-200',
  },
};

const KIND_ICON: Record<RecomposeKind, typeof Package> = {
  'single-product': Package,
  'single-with-accessories': PackageOpen,
  'multi-pack-loose': Layers,
  'multi-variant-loose': Grid3x3,
  'mixed-item-set': Shapes,
  'lighting-lifestyle': Lightbulb,
  'box-with-loose-same': Boxes,
  'box-with-loose-diff': Box,
  'box-only-window': Box,
  'box-only-opaque': Archive,
  'lifestyle-context': Camera,
  'text-heavy': Type,
};

// 옛날 (legacy 4-kind) DB 에 저장된 kind 값 fallback — 새 12-kind 매핑에 없을 때 안전한 default.
const FALLBACK_TONE = { bg: 'bg-slate-100', text: 'text-slate-700', iconBg: 'bg-slate-200' };

export function RecomposeVariantPicker({
  classification,
  loading = false,
  onSelect,
  layout = 'card',
}: RecomposeVariantPickerProps) {
  const tone = KIND_TONE[classification.kind] ?? FALLBACK_TONE;
  const Icon = KIND_ICON[classification.kind] ?? Package;
  const kindLabel = KIND_LABELS[classification.kind] ?? '미분류';

  // requiresChoice=false → 분류 뱃지만 노출 (정보성). 편집은 카드/모달 외부 다른 버튼으로.
  if (!classification.requiresChoice || classification.options.length === 0) {
    if (layout === 'card') {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold',
            tone.bg,
            tone.text,
          )}
        >
          <Icon size={10} />
          {kindLabel}
        </span>
      );
    }
    // detail layout — 정보 뱃지 + 추론 reasoning
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            썸네일 분류
          </p>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold',
              tone.bg,
              tone.text,
            )}
          >
            <Icon size={11} />
            {kindLabel}
          </span>
        </div>
        {classification.reasoning && (
          <p className="text-[11px] leading-relaxed text-slate-500">{classification.reasoning}</p>
        )}
      </div>
    );
  }

  // requiresChoice=true → variant 옵션 버튼 노출.
  if (layout === 'card') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold',
              tone.bg,
              tone.text,
            )}
          >
            <Icon size={10} />
            {kindLabel}
          </span>
          <span className="text-[10px] text-slate-400">레이아웃 선택</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {classification.options.map((option) => {
            const isRecommended = option.recommended === true;
            return (
              <button
                key={option.key}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(option.key);
                }}
                disabled={loading}
                title={option.description}
                className={cn(
                  'inline-flex items-center justify-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50',
                  isRecommended
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                )}
              >
                {isRecommended && <Sparkles size={9} />}
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // detail layout
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          썸네일 분류
        </p>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold',
            tone.bg,
            tone.text,
          )}
        >
          <Icon size={11} />
          {kindLabel}
        </span>
        <span className="text-[11px] text-slate-500">박스 안에 흩어진 상품과 동일한 상품이 보입니다 — 어떤 레이아웃으로 재구성할까요?</span>
      </div>
      {classification.reasoning && (
        <p className="text-[11px] leading-relaxed text-slate-500">{classification.reasoning}</p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {classification.options.map((option) => {
          const isRecommended = option.recommended === true;
          return (
            <button
              key={option.key}
              onClick={() => onSelect(option.key)}
              disabled={loading}
              className={cn(
                'group relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all disabled:opacity-50',
                isRecommended
                  ? 'border-purple-400 bg-purple-50 hover:bg-purple-100'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              {isRecommended && (
                <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-md bg-purple-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  <Sparkles size={9} />
                  추천
                </span>
              )}
              <span className="text-[13px] font-bold text-slate-900">{option.label}</span>
              <span className="text-[11px] leading-relaxed text-slate-500">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
