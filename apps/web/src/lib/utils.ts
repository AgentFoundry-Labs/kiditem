import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}분`;
  if (mins === 0) return `${hours}시간`;
  return `${hours}시간 ${mins}분`;
}

type DateInput = string | Date | number | null | undefined;

const DEFAULT_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

const DEFAULT_TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

export function formatDateTime(date: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  if (date == null) return '-';
  return new Intl.DateTimeFormat('ko-KR', opts ?? DEFAULT_DATETIME_OPTS).format(new Date(date));
}

export function formatDate(date: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  if (date == null) return '-';
  return new Intl.DateTimeFormat('ko-KR', opts ?? DEFAULT_DATE_OPTS).format(new Date(date));
}

export function formatTime(date: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  if (date == null) return '-';
  return new Intl.DateTimeFormat('ko-KR', opts ?? DEFAULT_TIME_OPTS).format(new Date(date));
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return '-';
  return new Intl.NumberFormat('ko-KR').format(num);
}

export function formatCurrency(num: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num);
}

export function getModuleColor(module: string): string {
  const colors: Record<string, string> = {
    order: '#3B82F6',
    accounting: '#10B981',
    inventory: '#F59E0B',
    cs: '#EF4444',
    report: '#8B5CF6',
    product: '#EC4899',
    marketing: '#06B6D4',
  };
  return colors[module] || '#6B7280';
}

export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString('ko-KR');
}

export function formatKRW(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('ko-KR').format(Math.round(amount));
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${value.toFixed(1)}%`;
}

export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-green-100 text-green-700';
    case 'B': return 'bg-yellow-100 text-yellow-700';
    case 'C': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export function getProfitColor(rate: number | null | undefined): string {
  if (rate == null) return 'text-slate-400';
  if (rate < 0) return 'text-red-600 font-bold';
  if (rate <= 3) return 'text-orange-500 font-semibold';
  return 'text-green-600';
}

export function getProductStatusBadge(status: string): { label: string; color: string } {
  switch (status) {
    case 'active': return { label: '판매중', color: 'bg-green-100 text-green-800' };
    case 'inactive': return { label: '중지', color: 'bg-gray-100 text-gray-800' };
    case 'discontinued': return { label: '정리', color: 'bg-red-100 text-red-800' };
    default: return { label: status, color: 'bg-gray-100 text-gray-800' };
  }
}
