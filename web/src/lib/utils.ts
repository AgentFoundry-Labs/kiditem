import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}분`;
  if (mins === 0) return `${hours}시간`;
  return `${hours}시간 ${mins}분`;
}

export function formatNumber(num: number): string {
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

export function getModuleGradient(module: string): string {
  const gradients: Record<string, string> = {
    order: 'from-blue-500/20 to-blue-600/5',
    accounting: 'from-emerald-500/20 to-emerald-600/5',
    inventory: 'from-amber-500/20 to-amber-600/5',
    cs: 'from-red-500/20 to-red-600/5',
    report: 'from-violet-500/20 to-violet-600/5',
    product: 'from-pink-500/20 to-pink-600/5',
    marketing: 'from-cyan-500/20 to-cyan-600/5',
  };
  return gradients[module] || 'from-gray-500/20 to-gray-600/5';
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'success': return 'text-emerald-400';
    case 'error': return 'text-red-400';
    case 'running': return 'text-blue-400';
    case 'idle': return 'text-gray-500';
    case 'disabled': return 'text-gray-600';
    default: return 'text-gray-500';
  }
}

export function getStatusBg(status: string): string {
  switch (status) {
    case 'success': return 'bg-emerald-400/10 border-emerald-400/30';
    case 'error': return 'bg-red-400/10 border-red-400/30';
    case 'running': return 'bg-blue-400/10 border-blue-400/30';
    default: return 'bg-gray-400/10 border-gray-400/30';
  }
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
