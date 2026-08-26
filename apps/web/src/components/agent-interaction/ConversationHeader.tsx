'use client';

import { ArrowLeft, Menu } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function ConversationHeader({
  contextLabel,
  title,
  onOpenFolders,
  folderControl,
}: {
  contextLabel: string;
  title: string | null;
  onOpenFolders(): void;
  folderControl?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <Link
          href="/dashboard"
          aria-label="대시보드로 돌아가기"
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11"
        >
          <ArrowLeft aria-hidden="true" size={18} />
          <span className="hidden sm:inline">대시보드로 돌아가기</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-semibold leading-[26px]">{title ?? contextLabel}</h1>
          <p className="truncate text-xs text-muted-foreground">{contextLabel}</p>
        </div>
        {folderControl ?? (
          <button
            type="button"
            aria-label="대화 목록 열기"
            onClick={onOpenFolders}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-lg:min-w-11 lg:hidden"
          >
            <Menu aria-hidden="true" size={20} />
          </button>
        )}
      </div>
    </header>
  );
}
