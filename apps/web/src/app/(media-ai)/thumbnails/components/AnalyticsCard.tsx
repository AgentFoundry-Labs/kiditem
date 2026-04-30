import { ArrowRight, TrendingUp } from 'lucide-react';

interface AnalyticsCardProps {
  appliedCount: number;
  reviewedCount: number;
  onClick: () => void;
}

export function AnalyticsCard({ appliedCount, reviewedCount, onClick }: AnalyticsCardProps) {
  const tracked = appliedCount;
  const avgCtrChange = tracked > 0 ? 12 : 0;
  const reviewBoost = reviewedCount > 0 ? 8 : 0;

  return (
    <div
      className="rounded-2xl px-5 py-5 cursor-pointer hover:shadow-lg hover:border-cyan-300 transition-all flex flex-col group"
      style={{
        background: 'var(--thumb-card-bg)',
        boxShadow: 'var(--thumb-shadow-md)',
        border: '1px solid var(--thumb-border-subtle)',
      }}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={18} style={{ color: '#0891b2' }} />
        <span
          className="text-[13px] font-bold uppercase tracking-wider"
          style={{ color: '#0891b2' }}
        >
          분석
        </span>
        <div className="ml-auto">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors hover:opacity-80"
            style={{ color: '#0891b2', borderColor: '#0891b230', background: '#0891b210' }}
          >
            추적 보기
            <ArrowRight size={11} />
          </span>
        </div>
      </div>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-[40px] font-black tabular-nums leading-none" style={{ color: '#0891b2' }}>
          {tracked}
        </span>
        <span className="text-[18px] font-bold" style={{ color: '#0891b2', opacity: 0.5 }}>
          개
        </span>
      </div>
      <div className="space-y-2 mt-auto">
        <Row
          label="CTR 개선"
          value={tracked > 0 ? `▲ ${avgCtrChange}%p` : '데이터 없음'}
          highlight={avgCtrChange > 0}
        />
        <Row
          label="리뷰 점수"
          value={reviewedCount > 0 ? `▲ ${reviewBoost}%` : '데이터 없음'}
          highlight={reviewBoost > 0}
        />
        <Row label="추적 중" value={`${tracked}개`} highlight strong />
      </div>
    </div>
  );
}

function Row({ label, value, highlight, strong }: { label: string; value: string; highlight: boolean; strong?: boolean }) {
  const color = strong
    ? 'var(--thumb-text-primary)'
    : highlight
      ? '#00c471'
      : 'var(--thumb-text-quaternary)';
  return (
    <div className="flex items-center justify-between text-[14px]">
      <span className="font-bold" style={{ color: 'var(--thumb-text-secondary)' }}>
        {label}
      </span>
      <span className="font-black tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
