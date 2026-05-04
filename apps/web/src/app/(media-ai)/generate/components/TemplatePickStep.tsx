'use client';

// 상세페이지 생성 step 1 — 템플릿 선택. /generate 페이지 진입 직후 보임.
//
// 각 카드:
//   · 좌측 thumbnail (placeholder data 로 렌더된 iframe small)
//   · 메타 (이름, 설명)
//   · 두 버튼: '미리보기' (전체화면 모달) / '이 템플릿으로 →' (form step 진행)
//
// 사용자: "버튼에다가 미리보기도 해놔서 미리보기로 모달 나오게"

import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Sparkles, X, Check, Lock, Megaphone, Crown, type LucideIcon } from 'lucide-react';
import {
  getTemplate,
  placeholderDetailPageData,
} from '@kiditem/templates';
import { cn } from '@/lib/utils';
import { renderTemplateToHtml } from '@/app/(sourcing)/sourcing/lib/template-html';

// 카드 슬롯 정의 — 사용자 요구로 명시적 순서 + 브랜드명 + 일부 슬롯은 placeholder.
//   1) KIDITEM DESIGN (bold-vertical 사용, KIDITEM 브랜드)
//   2) 트렌드 광고형 템플릿 (kids-playful 사용, 광고형 톤)
//   3) Coming Soon (비활성)
interface CardSlot {
  templateId: string | null; // null = coming soon
  brand: string;             // 카드 위 작은 라벨
  displayName: string;       // 큰 글자
  tagline: string;
  suit: string;
  // 그래픽 — iframe 대신 thumbnail-editor 톤의 큰 아이콘 + 그라디언트 배경
  graphic: {
    icon: LucideIcon;
    gradient: string; // tailwind classname 으로 bg-gradient
    iconColor: string; // text-color
  };
}

const CARD_SLOTS: CardSlot[] = [
  {
    templateId: 'bold-vertical',
    brand: 'KIDITEM',
    displayName: 'KIDITEM DESIGN',
    tagline: '키디아이템 자체 시그니처 — 굵직한 헤드라인 + 풀세트 섹션',
    suit: '키디아이템 브랜드 라인 / 식품·완구·키즈',
    graphic: {
      icon: Crown,
      gradient: 'from-violet-100 via-violet-50 to-fuchsia-100',
      iconColor: 'text-violet-600',
    },
  },
  {
    templateId: 'kids-playful',
    brand: 'TREND',
    displayName: '트렌드 광고형 템플릿',
    tagline: '광고 reel 스타일 — 컬러 블록 + 라이프스타일 + 강한 CTA',
    suit: '여름·계절 한정·이벤트성 상품',
    graphic: {
      icon: Megaphone,
      gradient: 'from-rose-100 via-orange-50 to-amber-100',
      iconColor: 'text-rose-600',
    },
  },
  {
    templateId: null,
    brand: 'COMING SOON',
    displayName: '준비 중',
    tagline: '추가 템플릿 작업 중',
    suit: '—',
    graphic: {
      icon: Lock,
      gradient: 'from-slate-100 to-slate-200',
      iconColor: 'text-slate-400',
    },
  },
];

interface Props {
  /** 사용자가 선택한 templateId — confirm 시 form step 으로 전달 */
  onPick: (templateId: string) => void;
  /** 기본값. 시작 시 이 카드가 살짝 강조됨 */
  defaultTemplateId?: string;
}

export default function TemplatePickStep({
  onPick,
  defaultTemplateId = 'simple-vertical',
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <div className="flex flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-8 py-6">
        <h1 className="text-xl font-bold text-slate-900">상세페이지 템플릿 선택</h1>
        <p className="mt-1 text-sm text-slate-500">
          마음에 드는 템플릿을 고르고 진행해주세요. '미리보기' 로 전체 모양 확인 가능합니다.
        </p>
      </div>

      <div className="flex-1 px-8 py-10">
        {/* 전체 너비 그리드 — 사용자 요구로 max-w / mx-auto 제거. */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 xl:grid-cols-3">
          {CARD_SLOTS.map((slot, idx) =>
            slot.templateId ? (
              <TemplateCard
                key={slot.templateId}
                slot={slot}
                isDefault={slot.templateId === defaultTemplateId}
                isHovered={hoveredId === slot.templateId}
                onHover={() => setHoveredId(slot.templateId)}
                onLeave={() => setHoveredId(null)}
                onPreview={() => setPreviewId(slot.templateId)}
                onPick={() => onPick(slot.templateId!)}
              />
            ) : (
              <ComingSoonCard key={`coming-${idx}`} slot={slot} />
            ),
          )}
        </div>
      </div>

      {previewId && (
        <PreviewModal templateId={previewId} onClose={() => setPreviewId(null)} />
      )}
    </div>
  );
}

interface CardProps {
  slot: CardSlot;
  isDefault: boolean;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onPreview: () => void;
  onPick: () => void;
}

function TemplateCard({
  slot,
  isDefault,
  isHovered,
  onHover,
  onLeave,
  onPreview,
  onPick,
}: CardProps) {
  const templateId = slot.templateId!;
  const config = useMemo(() => {
    try {
      return getTemplate(templateId);
    } catch {
      return null;
    }
  }, [templateId]);

  if (!config) return null;
  const Icon = slot.graphic.icon;

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        'flex w-full flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition',
        isDefault && !isHovered ? 'border-violet-300' : 'border-slate-200',
        isHovered && 'border-violet-500 shadow-lg',
      )}
    >
      {/* 카드 상단 brand 띠 */}
      <div className="flex items-center justify-between bg-slate-900 px-5 py-2.5 text-[11px] font-bold tracking-[0.2em] text-white">
        <span>{slot.brand}</span>
        <span className="font-mono text-[10px] text-slate-400">{templateId}</span>
      </div>

      {/* 그래픽 영역 — iframe 대신 그라디언트 + 큰 아이콘 (thumbnail-editor 톤). */}
      <div
        className={cn(
          'relative flex h-56 items-center justify-center bg-gradient-to-br',
          slot.graphic.gradient,
        )}
      >
        <Icon
          size={88}
          strokeWidth={1.4}
          className={cn('drop-shadow-sm', slot.graphic.iconColor)}
        />
        {isDefault && (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-bold text-white shadow">
            <Check size={10} strokeWidth={3} />
            기본 추천
          </div>
        )}
      </div>

      {/* 메타 — 가운데 정렬 + 충분한 padding */}
      <div className="px-6 py-5 text-center">
        <h3 className="mb-1.5 text-xl font-extrabold text-slate-900">{slot.displayName}</h3>
        <p className="text-sm leading-relaxed text-slate-600">{slot.tagline}</p>
        <p className="mt-1 text-xs text-slate-400">추천: {slot.suit}</p>
      </div>

      {/* 두 버튼 — 미리보기 (모달) + 이 템플릿으로 */}
      <div className="flex border-t border-slate-100">
        <button
          type="button"
          onClick={onPreview}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Eye size={14} />
          미리보기
        </button>
        <div className="w-px bg-slate-100" />
        <button
          type="button"
          onClick={onPick}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
        >
          <Sparkles size={14} />이 템플릿으로 →
        </button>
      </div>
    </div>
  );
}

// ─── Coming Soon 카드 — 비활성, 가운데 정렬 ────────────────────────────────
function ComingSoonCard({ slot }: { slot: CardSlot }) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 opacity-90">
      <div className="flex items-center justify-between bg-slate-400 px-5 py-2.5 text-[11px] font-bold tracking-[0.2em] text-white">
        <span>{slot.brand}</span>
        <Lock size={12} />
      </div>
      <div className={cn('flex h-56 items-center justify-center bg-gradient-to-br', slot.graphic.gradient)}>
        <Lock size={88} strokeWidth={1.4} className={cn('drop-shadow-sm', slot.graphic.iconColor)} />
      </div>
      <div className="px-6 py-5 text-center">
        <h3 className="mb-1.5 text-xl font-extrabold text-slate-400">{slot.displayName}</h3>
        <p className="text-sm leading-relaxed text-slate-400">{slot.tagline}</p>
      </div>
      <div className="border-t border-slate-200 bg-slate-100 px-4 py-3.5 text-center text-sm font-medium text-slate-400">
        준비 중
      </div>
    </div>
  );
}

// ─── Preview modal — 클릭 시 전체화면에 가까운 큰 iframe ──────────────────
interface PreviewModalProps {
  templateId: string;
  onClose: () => void;
}

function PreviewModal({ templateId, onClose }: PreviewModalProps) {
  const config = useMemo(() => {
    try {
      return getTemplate(templateId);
    } catch {
      return null;
    }
  }, [templateId]);

  const html = useMemo(() => {
    if (!config) return '';
    const raw = renderTemplateToHtml(
      config.component as React.ComponentType<unknown>,
      placeholderDetailPageData,
      config,
      '',
    );
    // iframe 안에 Tailwind CSS 가 없으면 utility class 가 작동 안 함 (사용자 reference 와
    // 다르게 보이던 원인). Tailwind v4 browser CDN 을 head 에 주입 → 1:1 매칭 렌더.
    return raw.replace(
      '</head>',
      `<script src="https://cdn.tailwindcss.com"></script></head>`,
    );
  }, [config]);

  // iframe 실제 콘텐츠 높이 측정 → iframe 자체를 그 만큼 크게 만들어 모달 wrapper 가 스크롤.
  // 이렇게 해야 사용자가 모달을 풀-스크롤하면서 전체 템플릿 한눈에 봄.
  // 이전엔 iframe 이 고정 높이 + 자체 스크롤 → 일부만 보이고 미리보기 헤더가 따라다녀 답답.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(2400);

  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    const measure = () => {
      let doc: Document | null = null;
      try {
        doc = el.contentDocument;
      } catch {
        doc = null;
      }
      if (!doc) return;
      const h = Math.max(
        doc.documentElement.scrollHeight,
        doc.body.scrollHeight,
      );
      if (h > 0) setIframeHeight(h);
    };
    el.addEventListener('load', measure);
    // Tailwind CDN 비동기 로드 후 layout 변할 수 있어 1초/3초 후 재측정
    const t1 = setTimeout(measure, 1500);
    const t2 = setTimeout(measure, 3500);
    return () => {
      el.removeEventListener('load', measure);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [html]);

  if (!config) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2"
      onClick={onClose}
    >
      {/* 풀에 가까운 미리보기 — 사용자: "너비 넓히고 스크롤 없이 높이 키우고".
          h-[98vh] + max-w-7xl 로 가능한 한 화면 채움. 템플릿 자체가 길어 외부 페이지 스크롤
          은 없애지만 iframe 안 콘텐츠 스크롤은 유지 (불가피). */}
      <div
        className="relative flex h-[98vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{config.name}</h3>
            <p className="text-sm text-slate-500">{config.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>
        {/* 모달 body — overflow-y-auto. iframe 은 자체 콘텐츠 높이만큼 늘려 자체 스크롤 X.
            사용자가 모달을 위→아래로 스크롤하면 전체 템플릿이 한눈에 펼쳐짐. */}
        <div className="flex-1 overflow-y-auto bg-white">
          <iframe
            ref={iframeRef}
            srcDoc={html}
            className="block w-full border-0 bg-white"
            style={{ height: `${iframeHeight}px` }}
            title={`${templateId}-preview-modal`}
            sandbox="allow-scripts"
          />
        </div>
      </div>
    </div>
  );
}
