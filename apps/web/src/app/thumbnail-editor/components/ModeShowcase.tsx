'use client';

import { ArrowRight, Scissors, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

type Mode = 'edit' | 'creative';

type ModeBanner = {
  mode: Mode;
  title: string;
  description: string;
  tag: string;
  bg: string;
  tagBg: string;
  icon: typeof Scissors;
  Graphic: React.ComponentType;
};

const BANNERS: ModeBanner[] = [
  {
    mode: 'edit',
    title: '이미지 편집',
    description: '기존 촬영본 보정 · 텍스트 레이아웃 · 배경 정리까지',
    tag: 'ENHANCED',
    bg: 'from-violet-600 via-violet-500 to-indigo-600',
    tagBg: 'bg-white/25 backdrop-blur-md border border-white/40',
    icon: Scissors,
    Graphic: EditGraphic,
  },
  {
    mode: 'creative',
    title: 'AI 연출 생성',
    description: '상품 누끼만으로 고퀄리티 라이프스타일 컷 자동 생성',
    tag: 'AI RENDERED',
    bg: 'from-fuchsia-600 via-pink-500 to-rose-500',
    tagBg: 'bg-white/25 backdrop-blur-md border border-white/40',
    icon: Sparkles,
    Graphic: CreativeGraphic,
  },
];

type Props = {
  onStart?: (mode: Mode) => void;
};

export function ModeShowcase({ onStart }: Props) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {BANNERS.map((b) => (
        <ModeBannerButton key={b.mode} banner={b} onStart={onStart} />
      ))}
    </section>
  );
}

function ModeBannerButton({ banner, onStart }: { banner: ModeBanner; onStart?: (mode: Mode) => void }) {
  const Icon = banner.icon;
  const Graphic = banner.Graphic;

  return (
    <button
      type="button"
      onClick={() => onStart?.(banner.mode)}
      className={cn(
        'group relative overflow-hidden rounded-3xl aspect-[15/5] text-left transition-all duration-300',
        'bg-gradient-to-br',
        banner.bg,
        'ring-1 ring-white/40 shadow-[0_12px_40px_rgba(99,102,241,0.25)]',
        'hover:ring-2 hover:ring-white/80 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(99,102,241,0.4)]',
      )}
    >
      {/* Decorative graphic */}
      <div className="absolute inset-0 opacity-90 pointer-events-none">
        <Graphic />
      </div>

      {/* Soft vignette for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

      {/* Top-right tag + icon */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <span
          className={cn(
            'text-[10px] font-extrabold uppercase tracking-[0.12em] text-white px-2.5 py-1 rounded-full shadow-md',
            banner.tagBg,
          )}
        >
          {banner.tag}
        </span>
        <div className="w-10 h-10 rounded-2xl bg-white/25 backdrop-blur-md border border-white/40 flex items-center justify-center shadow-lg">
          <Icon size={20} strokeWidth={2.25} className="text-white" />
        </div>
      </div>

      {/* Left: title + description + CTA (vertically centered) */}
      <div className="absolute inset-y-0 left-0 right-40 px-6 flex flex-col justify-center text-white">
        <h3 className="text-xl font-extrabold tracking-tight drop-shadow-md leading-tight">{banner.title}</h3>
        <p className="mt-1 text-[12px] text-white/90 leading-snug drop-shadow line-clamp-2">{banner.description}</p>

        <div className="mt-3 inline-flex w-fit items-center gap-1.5 bg-white/95 text-slate-900 font-bold text-[12px] px-3 py-1.5 rounded-full shadow-lg transition-transform group-hover:translate-x-1">
          이 모드로 시작
          <ArrowRight size={14} strokeWidth={2.5} />
        </div>
      </div>
    </button>
  );
}

function EditGraphic() {
  return (
    <svg
      viewBox="0 0 600 250"
      preserveAspectRatio="xMaxYMid slice"
      className="absolute inset-0 w-full h-full"
    >
      <defs>
        <linearGradient id="edit-card-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="edit-card-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef3c7" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fbcfe8" stopOpacity="0.75" />
        </linearGradient>
        <pattern id="edit-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.1" fill="#ffffff" fillOpacity="0.18" />
        </pattern>
      </defs>

      {/* Dot grid background on right side */}
      <rect x="320" y="0" width="280" height="250" fill="url(#edit-dots)" />

      {/* Back card (tilted) */}
      <g transform="translate(355 35) rotate(-10)">
        <rect width="150" height="170" rx="14" fill="url(#edit-card-a)" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" />
        <rect x="12" y="12" width="126" height="110" rx="8" fill="#ffffff" fillOpacity="0.15" />
        <rect x="12" y="132" width="90" height="8" rx="4" fill="#ffffff" fillOpacity="0.5" />
        <rect x="12" y="146" width="60" height="6" rx="3" fill="#ffffff" fillOpacity="0.3" />
      </g>

      {/* Front card with photo-style content */}
      <g transform="translate(410 55) rotate(6)">
        <rect width="150" height="170" rx="14" fill="url(#edit-card-b)" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="2" />
        {/* Mock photo content: mountain + sun */}
        <circle cx="115" cy="40" r="16" fill="#fde68a" />
        <path d="M10 110 L50 60 L85 95 L110 70 L140 110 Z" fill="#a78bfa" opacity="0.85" />
        <path d="M10 110 L140 110 L140 125 L10 125 Z" fill="#7c3aed" opacity="0.9" />
        {/* Crop handles */}
        <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M4 20 L4 4 L20 4" />
          <path d="M146 4 L146 20" />
          <path d="M4 130 L4 146 L20 146" />
          <path d="M146 130 L146 146 L130 146" />
        </g>
        {/* Text lines below */}
        <rect x="12" y="140" width="80" height="6" rx="3" fill="#ffffff" fillOpacity="0.6" />
      </g>

      {/* Floating sliders */}
      <g transform="translate(280 150)">
        <rect x="0" y="0" width="90" height="6" rx="3" fill="#ffffff" fillOpacity="0.3" />
        <circle cx="55" cy="3" r="7" fill="#ffffff" stroke="#a78bfa" strokeWidth="2" />
      </g>
      <g transform="translate(280 175)">
        <rect x="0" y="0" width="70" height="6" rx="3" fill="#ffffff" fillOpacity="0.3" />
        <circle cx="30" cy="3" r="7" fill="#ffffff" stroke="#a78bfa" strokeWidth="2" />
      </g>
    </svg>
  );
}

function CreativeGraphic() {
  return (
    <svg
      viewBox="0 0 600 250"
      preserveAspectRatio="xMaxYMid slice"
      className="absolute inset-0 w-full h-full"
    >
      <defs>
        <radialGradient id="creative-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff1f2" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#fbcfe8" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ec4899" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="creative-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fbcfe8" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Ambient glow */}
      <circle cx="460" cy="125" r="160" fill="url(#creative-glow)" />

      {/* Scene frame (right) */}
      <g transform="translate(380 40)">
        <rect width="180" height="175" rx="16" fill="url(#creative-frame)" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="2" />
        {/* Room: floor + wall */}
        <rect x="6" y="6" width="168" height="100" rx="10" fill="#fce7f3" />
        <rect x="6" y="106" width="168" height="63" rx="0" fill="#fbcfe8" />
        {/* Product silhouette (teddy-like) */}
        <g transform="translate(60 55)">
          <circle cx="30" cy="20" r="18" fill="#be185d" />
          <circle cx="18" cy="8" r="8" fill="#be185d" />
          <circle cx="42" cy="8" r="8" fill="#be185d" />
          <ellipse cx="30" cy="55" rx="26" ry="22" fill="#be185d" />
          <circle cx="24" cy="18" r="2.5" fill="#fff" />
          <circle cx="36" cy="18" r="2.5" fill="#fff" />
        </g>
        {/* Sparkle accents inside frame */}
        <g fill="#ffffff">
          <path d="M30 28 L32 34 L38 36 L32 38 L30 44 L28 38 L22 36 L28 34 Z" />
          <path d="M150 130 L151.5 134 L155.5 135.5 L151.5 137 L150 141 L148.5 137 L144.5 135.5 L148.5 134 Z" />
        </g>
      </g>

      {/* Floating sparkles on left */}
      <g fill="#ffffff" opacity="0.95">
        <path d="M80 70 L84 82 L96 86 L84 90 L80 102 L76 90 L64 86 L76 82 Z" />
        <path d="M140 140 L142.5 147 L150 149.5 L142.5 152 L140 159 L137.5 152 L130 149.5 L137.5 147 Z" />
        <path d="M210 60 L211.5 64 L215.5 65.5 L211.5 67 L210 71 L208.5 67 L204.5 65.5 L208.5 64 Z" />
        <circle cx="260" cy="180" r="3" />
        <circle cx="60" cy="160" r="2" />
        <circle cx="300" cy="90" r="2.5" />
      </g>

      {/* AI wand trail */}
      <g transform="translate(220 120)" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7">
        <path d="M0 60 Q 40 20 80 40 T 160 20" strokeDasharray="2 6" />
      </g>
    </svg>
  );
}
