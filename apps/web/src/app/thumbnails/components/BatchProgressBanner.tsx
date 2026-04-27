import { Loader2, XCircle } from 'lucide-react';
import { formatElapsed } from '../lib/format-elapsed';

interface BatchProgressBannerProps {
  done: number;
  total: number;
  elapsed: number;
  onCancel: () => void;
}

export function BatchProgressBanner({ done, total, elapsed, onCancel }: BatchProgressBannerProps) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const perItem = done > 0 ? elapsed / done : 2.5;
  const remaining = Math.max(0, Math.round((total - done) * perItem));

  return (
    <div
      className="px-5 py-4 rounded-2xl flex items-center gap-4"
      style={{ background: '#3182f618', border: '2px solid #3182f640' }}
    >
      <Loader2 size={18} className="animate-spin flex-shrink-0" style={{ color: '#3182f6' }} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold" style={{ color: '#3182f6' }}>
            AI 분류 중 — {done} / {total}개 완료
          </span>
          <span className="text-[14px] font-black tabular-nums" style={{ color: '#3182f6' }}>
            {pct}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#3182f620' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: '#3182f6' }}
          />
        </div>
        <div className="text-[12px]" style={{ color: '#3182f690' }}>
          경과 {formatElapsed(elapsed)}
          {remaining > 0 ? ` · 예상 잔여 ${formatElapsed(remaining)}` : ''}
        </div>
      </div>
      <button
        onClick={onCancel}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex-shrink-0"
        style={{ background: '#ef4444', color: '#fff' }}
      >
        <XCircle size={15} /> 중단
      </button>
    </div>
  );
}
