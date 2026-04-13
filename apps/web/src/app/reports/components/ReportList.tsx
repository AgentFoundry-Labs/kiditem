'use client';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportItem {
  type: string;
  title: string;
  desc: string;
  color: string;
}

interface Props {
  reports: ReportItem[];
  generating: string | null;
  onGenerate: (type: string) => void;
}

export default function ReportList({ reports, generating, onGenerate }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {reports.map((r) => (
        <div key={r.type} className="bg-white rounded-xl p-5 border border-slate-200 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <h3 className="font-semibold text-slate-900">{r.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{r.desc}</p>
          </div>
          <button
            onClick={() => onGenerate(r.type)}
            disabled={generating !== null}
            className={cn('flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50', r.color)}
          >
            <Download size={16} />
            {generating === r.type ? '생성 중...' : '다운로드'}
          </button>
        </div>
      ))}
    </div>
  );
}
