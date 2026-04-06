'use client';

const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  urgent: { bg: 'bg-red-100', text: 'text-red-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  medium: { bg: 'bg-blue-100', text: 'text-blue-700' },
  low: { bg: 'bg-slate-100', text: 'text-slate-700' },
};

interface RecommendCardData {
  title: string;
  icon: string;
  color: string;
  items: Array<{ text: string; productName?: string; value?: string; priority: string }>;
}

export function RecommendCards({ cards }: { cards: RecommendCardData[] }) {
  if (cards.length === 0) return null;

  return (
    <div>
      <h3 className="font-semibold text-slate-900 mb-4">AI 전략 추천</h3>
      <div className="overflow-x-auto">
        <div className="flex gap-4 pb-2" style={{ minWidth: 'max-content' }}>
          {cards.map((card, i) => (
            <div key={i} className={`rounded-xl border p-4 w-[300px] flex-shrink-0 bg-gradient-to-br ${card.color}`}>
              <div className="font-semibold text-sm text-slate-900 mb-3">{card.title}</div>
              <div className="space-y-2">
                {card.items.map((item, j) => (
                  <div key={j} className="bg-white/80 rounded-lg px-3 py-2">
                    {item.productName && (
                      <div className="text-xs font-bold text-slate-800 truncate mb-0.5">{item.productName}</div>
                    )}
                    <div className="text-xs text-slate-600">{item.text}</div>
                    {item.value && (
                      <div className="text-xs text-slate-400 mt-0.5">{item.value}</div>
                    )}
                    <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORITY_STYLE[item.priority]?.bg ?? 'bg-slate-100'} ${PRIORITY_STYLE[item.priority]?.text ?? 'text-slate-700'}`}>
                      {item.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
