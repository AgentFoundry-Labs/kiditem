import { Shield } from 'lucide-react';

export default function HealthDiagnosis() {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Shield size={16} className="text-slate-500" aria-hidden="true" /> 상품 진단
      </h2>
      <div className="rounded-lg bg-slate-50 px-4 py-5 text-center">
        <p className="text-sm text-slate-500">진단 데이터가 현재 상품 스냅샷에 포함되지 않습니다.</p>
        <p className="mt-1 text-xs text-slate-400">Sellpia 재고 정보는 위 재고 현황에서 계속 확인할 수 있습니다.</p>
      </div>
    </section>
  );
}
