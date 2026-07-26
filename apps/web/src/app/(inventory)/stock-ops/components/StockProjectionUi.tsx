'use client';

import type { LucideIcon } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';

export function ProjectionCard({ title, description, icon: Icon, children }: {
  title: string;
  description: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return <section className="space-y-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5" aria-hidden="true" /> {title}</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p></div>{children}</section>;
}

export function SimpleTable({ headings, rows, empty, pagination }: {
  headings: string[];
  rows: string[][];
  empty: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}) {
  return <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"><div className="overflow-x-auto"><table className="w-full min-w-[680px]"><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`} className={cellIndex === 0 ? 'font-mono text-xs' : ''}>{cell}</td>)}</tr>) : <tr><td colSpan={headings.length} className="py-12 text-center text-[var(--text-secondary)]">{empty}</td></tr>}</tbody></table></div>{pagination ? <Pagination {...pagination} /> : null}</div>;
}

export function LoadingState() {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center text-[var(--text-secondary)]">불러오는 중...</div>;
}

export function ErrorState() {
  return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">데이터를 불러오지 못했습니다.</div>;
}
