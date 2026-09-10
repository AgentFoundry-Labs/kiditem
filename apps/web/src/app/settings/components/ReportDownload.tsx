'use client';

import { useState } from 'react';
import { FileSpreadsheet, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import {
  downloadFinanceReport,
  type FinanceReportType,
} from '@/lib/finance-report-export';

const REPORTS = [
  { type: 'full', title: '통합 리포트', desc: '상품 + 손익 + 재고 + 광고 전체', icon: '📊', color: 'bg-purple-600 hover:bg-purple-700' },
  { type: 'products', title: '상품 리포트', desc: '전체 상품 목록, 등급, 손익 요약', icon: '📦', color: 'bg-slate-600 hover:bg-slate-700' },
  { type: 'profitloss', title: '손익 리포트', desc: '상품별 손익 상세 (매출~순이익)', icon: '💰', color: 'bg-green-600 hover:bg-green-700' },
  { type: 'inventory', title: '재고 리포트', desc: '셀피아 재고 스냅샷과 재고 자산', icon: '🏭', color: 'bg-orange-600 hover:bg-orange-700' },
  { type: 'ads', title: '광고 리포트', desc: '광고 효율, ROAS, 비용 분석', icon: '📢', color: 'bg-purple-600 hover:bg-purple-700' },
] as const;

export default function ReportDownload() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async (type: FinanceReportType) => {
    setGenerating(type);
    setError(null);
    try {
      const fileName = await downloadFinanceReport({ type, surface: 'settings' });
      toast.success(`${fileName} 다운로드 완료`);
    } catch (err) {
      const msg = isApiError(err) ? err.detail : '리포트 생성 중 오류가 발생했습니다.';
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200">
      <h2 className="font-semibold text-lg text-slate-900 mb-2 flex items-center gap-2">
        <FileSpreadsheet size={20} className="text-green-600" />
        보고서 다운로드 (엑셀)
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        현재 DB 데이터를 기반으로 엑셀 보고서를 생성합니다.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <XCircle size={14} /> {error}
        </div>
      )}

      <div className="space-y-2">
        {REPORTS.map((r) => (
          <div
            key={r.type}
            className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{r.icon}</span>
              <div>
                <div className="font-medium text-sm text-slate-900">{r.title}</div>
                <div className="text-xs text-slate-500">{r.desc}</div>
              </div>
            </div>
            <button
              onClick={() => handleDownload(r.type)}
              disabled={generating !== null}
              className={cn('flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors', r.color)}
            >
              {generating === r.type ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> 생성 중...
                </>
              ) : (
                <>
                  <FileSpreadsheet size={14} /> 다운로드
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
