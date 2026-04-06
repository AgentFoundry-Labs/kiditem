'use client';

interface ProductPipelineProps {
  total: number;
  aCount: number;
  bCount: number;
  cCount: number;
  minusCount: number;
  lowCount: number;
  gradeChangeA: number;
  gradeChangeB: number;
  gradeChangeC: number;
  onGradeClick: (grade: string) => void;
}

export default function ProductPipeline({ total, aCount, bCount, cCount, minusCount, lowCount, gradeChangeA, gradeChangeB, gradeChangeC, onGradeClick }: ProductPipelineProps) {
  const nw = 120, nh = 65;
  const gradeChanges: Record<string, number> = { A: gradeChangeA, B: gradeChangeB, C: gradeChangeC };
  const nodes = [
    { id: "minus", label: "적자", value: minusCount, color: "#dc2626", x: 20, y: 40 },
    { id: "low", label: "3%이하", value: lowCount, color: "#d97706", x: 20, y: 170 },
    { id: "total", label: "전체", value: total, color: "#6366f1", x: 290, y: 105 },
    { id: "A", label: "A등급", value: aCount, color: "#22c55e", x: 560, y: 15 },
    { id: "B", label: "B등급", value: bCount, color: "#3b82f6", x: 560, y: 105 },
    { id: "C", label: "C등급", value: cCount, color: "#f97316", x: 560, y: 195 },
  ];
  const edges: [number, number][] = [
    [2, 0], [2, 1], [2, 3], [2, 4], [2, 5],
  ];

  return (
    <div className="table-card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Product Pipeline</h3>
        <span className="text-xs text-emerald-600 font-mono flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
        </span>
      </div>
      <div className="overflow-x-auto bg-slate-50/50 py-5 px-3">
        <svg width="100%" height={280} viewBox="0 0 720 280" preserveAspectRatio="xMidYMid meet" style={{ minWidth: 500 }}>
          <defs>
            <pattern id="pdots" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="7" cy="7" r="0.4" fill="#dde0e5" />
            </pattern>
          </defs>
          <rect width="720" height="280" fill="url(#pdots)" rx="6" />

          {edges.map(([fi, ti], i) => {
            const f = nodes[fi], t = nodes[ti];
            const goLeft = t.x < f.x;
            const x1 = goLeft ? f.x : f.x + nw;
            const x2 = goLeft ? t.x + nw : t.x;
            return (
              <line key={`pe-${i}`} x1={x1} y1={f.y + nh / 2} x2={x2} y2={t.y + nh / 2}
                stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="5 4" />
            );
          })}

          {nodes.map((n) => (
            <g key={n.id}
              onClick={() => {
                if (n.id === "A" || n.id === "B" || n.id === "C") onGradeClick(n.id);
                else if (n.id === "total") onGradeClick("all");
              }}
              className="cursor-pointer"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.05))" }}
            >
              <rect x={n.x} y={n.y} width={nw} height={nh} rx="10" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
              <rect x={n.x} y={n.y} width={nw} height={nh} rx="10" fill={n.color} opacity="0.06" />
              <text x={n.x + nw / 2} y={n.y + 26} textAnchor="middle" fontSize="24" fontWeight="800"
                fontFamily="ui-monospace, monospace" fill={n.color}>
                {n.value}
              </text>
              <text x={n.x + nw / 2} y={n.y + 44} textAnchor="middle" fontSize="13" fontWeight="600" fill="#374151">
                {n.label}
              </text>
              {n.value > 0 && (
                <circle cx={n.x + nw - 8} cy={n.y + 8} r="3" fill={n.color} className="animate-pulse" />
              )}
              {gradeChanges[n.id] !== undefined && gradeChanges[n.id] !== 0 && (
                <text x={n.x + nw / 2} y={n.y + nh + 16} textAnchor="middle" fontSize="11" fontWeight="600"
                  fill={gradeChanges[n.id] > 0 ? "#16a34a" : "#dc2626"}>
                  {gradeChanges[n.id] > 0 ? `▲ +${gradeChanges[n.id]}` : `▼ ${gradeChanges[n.id]}`}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
