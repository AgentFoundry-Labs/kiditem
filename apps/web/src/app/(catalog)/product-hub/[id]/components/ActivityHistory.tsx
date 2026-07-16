import { Activity } from 'lucide-react';

export default function ActivityHistory() {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Activity size={16} className="text-slate-500" aria-hidden="true" /> 분석 기록
      </h2>
      <div className="card p-5">
        <p className="text-sm text-slate-500">분석 기록 데이터가 현재 상품 스냅샷에 포함되지 않습니다.</p>
        <p className="mt-1 text-xs text-slate-400">워크플로우 지원이 연결되면 실행 기록이 이 영역에 표시됩니다.</p>
      </div>
    </section>
  );
}
