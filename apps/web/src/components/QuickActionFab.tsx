'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Image as ImageIcon, Package, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickAction {
  label: string;
  href: string;
  Icon: typeof Package;
  angle: number;
}

const FAN_RADIUS = 92;

const ACTIONS: QuickAction[] = [
  { label: '상품 생성', href: '/product-pipeline/productgenerate', Icon: Package, angle: 135 },
  {
    label: '상세페이지 생성',
    href: '/product-pipeline/detail-template-generation',
    Icon: FileText,
    angle: 180,
  },
  {
    label: '썸네일 생성',
    href: '/product-pipeline/thumbnail-generation',
    Icon: ImageIcon,
    angle: 225,
  },
];

export default function QuickActionFab() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="퀵 메뉴 닫기"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-transparent"
        />
      ) : null}
      <div
        data-testid="quick-action-fab"
        className="fixed right-5 top-1/2 z-50 -translate-y-1/2"
      >
        {open ? ACTIONS.map(({ label, href, Icon, angle }) => {
          const rad = (angle * Math.PI) / 180;
          const x = Math.cos(rad) * FAN_RADIUS;
          const y = -Math.sin(rad) * FAN_RADIUS;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={label}
              onClick={() => setOpen(false)}
              style={{
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              }}
              className={cn(
                'absolute left-1/2 top-1/2 inline-flex h-12 w-12 items-center justify-center',
                'rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/30',
                'transition-all duration-300 ease-out hover:shadow-xl hover:shadow-blue-500/40 hover:brightness-110',
                'opacity-100',
              )}
            >
              <Icon size={20} />
            </Link>
          );
        }) : null}

        <button
          type="button"
          aria-label={open ? '퀵 메뉴 닫기' : '퀵 메뉴 열기'}
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'relative inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl',
            'transition-all duration-300 ease-out',
            open
              ? 'bg-slate-900'
              : 'bg-gradient-to-br from-blue-600 to-purple-600 shadow-blue-500/30 hover:scale-105 hover:shadow-blue-500/40',
          )}
        >
          {open ? <X size={24} /> : <Sparkles size={24} />}
        </button>
      </div>
    </>
  );
}
