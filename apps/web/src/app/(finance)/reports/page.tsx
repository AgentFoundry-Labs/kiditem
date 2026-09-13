'use client';
import { useState } from "react";
import { toast } from 'sonner';
import { FileSpreadsheet } from "lucide-react";
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { isApiError } from "@/lib/api-error";
import {
  downloadFinanceReport,
  isFinanceReportType,
} from '@/lib/finance-report-export';
import ReportList from "./components/ReportList";

export default function ReportsPage() {
  const [generating, setGenerating] = useState<string | null>(null);
  const { period, setPeriod, periodOptions } = usePeriodSelector({ months: 12, defaultTo: 'prev' });

  const generateReport = async (type: string) => {
    if (!isFinanceReportType(type)) return;
    setGenerating(type);
    try {
      await downloadFinanceReport({
        type,
        surface: 'reports',
        period: period || undefined,
      });
    } catch (e) {
      const detail = isApiError(e)
        ? e.detail
        : "리포트 생성 중 오류가 발생했습니다. 다시 시도해주세요.";
      if (detail === '다운로드할 데이터가 없습니다.') {
        toast.warning('선택 기간의 데이터가 없습니다. 다른 기간을 선택해주세요.');
      } else {
        toast.error(detail);
      }
    } finally {
      setGenerating(null);
    }
  };

  const reports = [
    { type: "full", title: "통합 리포트", desc: "상품 + 손익 + 재고 + 광고 전체", color: "bg-purple-600 hover:bg-purple-700" },
    { type: "products", title: "상품 리포트", desc: "전체 상품 목록, 등급, 손익 요약", color: "bg-slate-600 hover:bg-slate-700" },
    { type: "profitloss", title: "손익 리포트", desc: "상품별 손익 상세 (매출~순이익)", color: "bg-green-600 hover:bg-green-700" },
    { type: "inventory", title: "재고 리포트", desc: "셀피아 재고 스냅샷과 재고 자산", color: "bg-orange-600 hover:bg-orange-700" },
    { type: "ads", title: "광고 리포트", desc: "광고 효율, ROAS, 비용 분석", color: "bg-purple-600 hover:bg-purple-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <FileSpreadsheet size={24} className="inline mr-2 text-green-600" />
          리포트 / 엑셀 출력
        </h1>
        <PeriodSelector value={period} onChange={setPeriod} options={periodOptions} />
      </div>

      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm text-blue-800">
        회사별(거영/해피프렌즈) 분리 출력은 각 페이지에서 회사 필터 적용 후 다운로드하세요.
        {period && <span className="ml-2 font-medium">선택 기간: {period}</span>}
      </div>

      <ReportList reports={reports} generating={generating} onGenerate={generateReport} />

      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-sm text-slate-600">
        <strong>자동 리포트:</strong> 매월 1일, 전월 통합 리포트가 자동 생성됩니다. (서버 배포 후 활성화)
      </div>
    </div>
  );
}
