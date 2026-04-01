'use client';

interface Kpi {
  label: string;
  value: number;
  dot: string;
}

export function PurchaseOrderKpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${kpi.dot}`} />
            <span className="text-sm text-gray-500">{kpi.label}</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
        </div>
      ))}
    </div>
  );
}
