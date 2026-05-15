import { AlertTriangle } from 'lucide-react';

interface ComplianceCardProps {
  failCount: number;
  warnCount: number;
  passCount: number;
  onClick: () => void;
}

export function ComplianceCard({ failCount, warnCount, passCount, onClick }: ComplianceCardProps) {
  const checkedTotal = failCount + warnCount + passCount;
  const passRate = checkedTotal > 0 ? Math.round((passCount / checkedTotal) * 100) : 0;
  const hasRisk = failCount > 0;
  const color = hasRisk ? '#f04452' : warnCount > 0 ? '#f59e0b' : '#059669';

  return (
    <div
      className="rounded-2xl px-5 py-5 cursor-pointer hover:shadow-lg transition-shadow flex flex-col"
      style={{
        background: 'var(--thumb-card-bg)',
        boxShadow: 'var(--thumb-shadow-md)',
        border: `1px solid ${hasRisk ? '#f0445233' : 'var(--thumb-border-subtle)'}`,
      }}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={18} style={{ color }} />
        <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color }}>
          가이드라인 준수
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-[40px] font-black tabular-nums leading-none" style={{ color }}>
          {passRate}
        </span>
        <span className="text-[18px] font-bold" style={{ color, opacity: 0.5 }}>
          %
        </span>
        <span className="text-[12px] text-slate-400 ml-1">({checkedTotal}개 검사)</span>
      </div>
      <div className="space-y-2 mt-auto">
        <Row label="FAIL (광고 중단 리스크)" value={failCount} color="#ef4444" />
        <Row label="WARN (주의)" value={warnCount} color="#f59e0b" />
        <Row label="PASS (준수)" value={passCount} color="#059669" />
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-[14px]">
      <span className="font-bold" style={{ color: 'var(--thumb-text-secondary)' }}>
        {label}
      </span>
      <span className="font-black tabular-nums" style={{ color }}>
        {value}개
      </span>
    </div>
  );
}
