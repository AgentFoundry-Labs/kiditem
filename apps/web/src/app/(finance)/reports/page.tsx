'use client';
import { useState } from "react";
import { toast } from 'sonner';
import { FileSpreadsheet } from "lucide-react";
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { fetchAllSellpiaInventorySkus } from '@/app/(inventory)/_shared/inventory-api';
import ReportList from "./components/ReportList";

const REPORT_DATA_KEYS = ['products', 'profitloss', 'inventory', 'ads'] as const;
type ReportDataKey = (typeof REPORT_DATA_KEYS)[number];

export default function ReportsPage() {
  const [generating, setGenerating] = useState<string | null>(null);
  const { period, setPeriod, periodOptions } = usePeriodSelector({ months: 12, defaultTo: 'prev' });

  const generateReport = async (type: string) => {
    setGenerating(type);
    try {
      const XLSX = await import("xlsx");

      const periodParam = period ? `?period=${period}` : '';
      const needed: ReportDataKey[] = type === 'full'
        ? [...REPORT_DATA_KEYS]
        : [type as ReportDataKey];
      const responses = await Promise.all(needed.map(async (key) => {
        if (key === 'inventory') {
          return { key, data: await fetchAllSellpiaInventorySkus() };
        }
        const path = key === 'products'
          ? `/api/products${periodParam}`
          : key === 'profitloss'
            ? `/api/profit-loss${periodParam}`
            : `/api/ads${periodParam}`;
        return { key, data: await apiClient.get<unknown>(path) };
      }));
      const dataMap = Object.fromEntries(
        responses.map(({ key, data }) => [key, data]),
      ) as Partial<Record<ReportDataKey, unknown>>;
      const productsResponse = dataMap.products as { items?: unknown[] } | undefined;
      const products = Array.isArray(productsResponse?.items) ? productsResponse.items : [];
      const profitLoss = Array.isArray(dataMap.profitloss) ? dataMap.profitloss : [];
      const inventory = Array.isArray(dataMap.inventory) ? dataMap.inventory : [];
      const adsData = dataMap.ads as { products?: unknown[] } | undefined;
      const hasData = responses.some(({ data }) => Array.isArray(data)
        ? data.length > 0
        : Boolean(data && typeof data === 'object' && (
            (Array.isArray((data as { items?: unknown[] }).items)
              && (data as { items: unknown[] }).items.length > 0)
            || (Array.isArray((data as { products?: unknown[] }).products)
              && (data as { products: unknown[] }).products.length > 0)
          )));

      if (!hasData) {
        toast.warning('선택 기간의 데이터가 없습니다. 다른 기간을 선택해주세요.');
        return;
      }

      const wb = XLSX.utils.book_new();

      if (type === "full" || type === "products") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws1 = XLSX.utils.json_to_sheet(products.map((p: any) => ({
          등급: p.abcGrade, 상품명: p.name, SKU: p.sku, 카테고리: p.category,
          회사: p.organization, 판매가: p.sellPrice, 매입가: p.costPrice,
          매출: p.revenue, 순이익: p.netProfit, "이익률(%)": p.profitRate,
          "광고비율(%)": p.adRate, 상태: p.status,
        })));
        XLSX.utils.book_append_sheet(wb, ws1, "상품목록");
      }

      if (type === "full" || type === "profitloss") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws2 = XLSX.utils.json_to_sheet(profitLoss.map((d: any) => ({
          등급: d.grade, 상품명: d.productName, 회사: d.organization,
          매출: d.revenue, 매입원가: d.costOfGoods, 수수료: d.commission,
          배송비: d.shippingCost, 광고비: d.adCost, 순이익: d.netProfit,
          "이익률(%)": d.profitRate, 주문수: d.orderCount,
        })));
        XLSX.utils.book_append_sheet(wb, ws2, "손익표");
      }

      if (type === "full" || type === "inventory") {
        const ws3 = XLSX.utils.json_to_sheet(inventory.map((i: any) => ({
          셀피아상품코드: i.code,
          상품명: i.name,
          옵션: i.optionName,
          바코드: i.barcode,
          현재고: i.currentStock,
          매입가: i.purchasePrice,
          판매가: i.salePrice,
          재고자산가치: i.stockValue,
          최근반영: i.lastImportedAt,
        })));
        XLSX.utils.book_append_sheet(wb, ws3, "재고현황");
      }

      if (type === "full" || type === "ads") {
        const adProducts = Array.isArray(adsData?.products) ? adsData.products : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws4 = XLSX.utils.json_to_sheet(adProducts.map((a: any) => ({
          등급: a.grade, 광고등급: a.adTier, 상품명: a.name, 회사: a.organization,
          광고비: a.spend, 광고매출: a.adRevenue, "ROAS(%)": a.roas,
          "CTR(%)": a.ctr, "전환율(%)": a.convRate, "광고비율(%)": a.adRate,
        })));
        XLSX.utils.book_append_sheet(wb, ws4, "광고현황");
      }

      const periodLabel = period || '전체';
      const fileName = type === "full"
        ? `통합리포트_${periodLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`
        : `${type}_리포트_${periodLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;

      XLSX.writeFile(wb, fileName);
    } catch (e) {
      toast.error(isApiError(e) ? e.detail : "리포트 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
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
