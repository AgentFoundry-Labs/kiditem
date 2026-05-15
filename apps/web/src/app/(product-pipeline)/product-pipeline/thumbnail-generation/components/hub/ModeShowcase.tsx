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
};

const BANNERS: ModeBanner[] = [
  {
    mode: 'edit',
    title: '이미지 편집',
    description: '이미지를 넣으면 쿠팡용 썸네일 생성 화면으로 바로 이동',
    tag: 'EDIT',
    bg: 'from-violet-600 via-violet-500 to-indigo-600',
    tagBg: 'bg-white/25 backdrop-blur-md border border-white/40',
    icon: Scissors,
  },
  {
    mode: 'creative',
    title: 'AI 연출 생성',
    description: '이미지를 넣으면 연출 생성 화면으로 바로 이동',
    tag: 'CREATE',
    bg: 'from-fuchsia-600 via-pink-500 to-rose-500',
    tagBg: 'bg-white/25 backdrop-blur-md border border-white/40',
    icon: Sparkles,
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
      <div className="absolute right-4 top-1/2 h-32 w-32 -translate-y-1/2 rounded-[2rem] bg-white/15 rotate-12 transition-transform group-hover:rotate-6" />
      <div className="absolute right-20 top-6 h-16 w-16 rounded-2xl bg-white/10 -rotate-12" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

      <div className="absolute top-4 right-4 flex items-center gap-2">
        <span
          className={cn(
            'text-[10px] font-extrabold uppercase tracking-[0.12em] text-white px-2.5 py-1 rounded-full shadow-md',
            banner.tagBg,
          )}
        >
          {banner.tag}
        </span>
        <div className="w-10 h-10 rounded-2xl bg-white/25 backdrop-blur-md border border-white/40 flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
          <Icon size={20} strokeWidth={2.25} className="text-white" />
        </div>
      </div>

      <div className="absolute inset-y-0 left-0 right-40 px-6 flex flex-col justify-center text-white">
        <h3 className="text-xl font-extrabold tracking-tight drop-shadow-md leading-tight">{banner.title}</h3>
        <p className="mt-1 text-[12px] text-white/90 leading-snug drop-shadow line-clamp-2">{banner.description}</p>

        <div className="mt-3 inline-flex w-fit items-center gap-1.5 bg-white/95 text-slate-900 font-bold text-[12px] px-3 py-1.5 rounded-full shadow-lg transition-transform group-hover:translate-x-1">
          이미지 넣기
          <ArrowRight size={14} strokeWidth={2.5} />
        </div>
      </div>
    </button>
  );
}
