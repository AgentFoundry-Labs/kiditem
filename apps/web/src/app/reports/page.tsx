"use client";
import { API_BASE } from "@/lib/api";

import { useState } from "react";
import { FileSpreadsheet, Download } from "lucide-react";

export default function ReportsPage() {
  const [generating, setGenerating] = useState<string | null>(null);

  const generateReport = async (type: string) => {
    setGenerating(type);
    try {
      const XLSX = await import("xlsx");

      const [productsRes, plRes, inventoryRes, adsRes] = await Promise.all([
        fetch(`${API_BASE}/api/products`),
        fetch(`${API_BASE}/api/profit-loss`),
        fetch(`${API_BASE}/api/inventory`),
        fetch(`${API_BASE}/api/ads`),
      ]);

      const products = await productsRes.json();
      const profitLoss = await plRes.json();
      const inventory = await inventoryRes.json();
      const adsData = await adsRes.json();

      const wb = XLSX.utils.book_new();

      if (type === "full" || type === "products") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws1 = XLSX.utils.json_to_sheet(products.map((p: any) => ({
          등급: p.abcGrade, 상품명: p.name, SKU: p.sku, 카테고리: p.category,
          회사: p.company, 판매가: p.sellPrice, 매입가: p.costPrice,
          매출: p.revenue, 순이익: p.netProfit, "이익률(%)": p.profitRate,
          "광고비율(%)": p.adRate, 재고: p.currentStock, 상태: p.status,
        })));
        XLSX.utils.book_append_sheet(wb, ws1, "상품목록");
      }

      if (type === "full" || type === "profitloss") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws2 = XLSX.utils.json_to_sheet(profitLoss.map((d: any) => ({
          등급: d.grade, 상품명: d.productName, 회사: d.company,
          매출: d.revenue, 매입원가: d.costOfGoods, 수수료: d.commission,
          배송비: d.shippingCost, 광고비: d.adCost, 순이익: d.netProfit,
          "이익률(%)": d.profitRate, 주문수: d.orderCount,
        })));
        XLSX.utils.book_append_sheet(wb, ws2, "손익표");
      }

      if (type === "full" || type === "inventory") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws3 = XLSX.utils.json_to_sheet(inventory.map((i: any) => ({
          상품명: i.productName, SKU: i.sku, 회사: i.company,
          현재고: i.currentStock, 적정재고: i.optimalStock, 발주점: i.reorderPoint,
          일평균판매: i.avgDailySales, 남은일수: i.daysRemaining,
          추천발주량: i.recommendedOrder, 상태: i.status,
        })));
        XLSX.utils.book_append_sheet(wb, ws3, "재고현황");
      }

      if (type === "full" || type === "ads") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws4 = XLSX.utils.json_to_sheet(adsData.products.map((a: any) => ({
          등급: a.grade, 광고등급: a.adTier, 상품명: a.name, 회사: a.company,
          광고비: a.spend, 광고매출: a.adRevenue, "ROAS(%)": a.roas,
          "CTR(%)": a.ctr, "전환율(%)": a.convRate, "광고비율(%)": a.adRate,
        })));
        XLSX.utils.book_append_sheet(wb, ws4, "광고현황");
      }

      const fileName = type === "full"
        ? `통합리포트_${new Date().toISOString().slice(0, 10)}.xlsx`
        : `${type}_리포트_${new Date().toISOString().slice(0, 10)}.xlsx`;

      XLSX.writeFile(wb, fileName);
    } catch (e) {
      console.error(e);
      alert("리포트 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setGenerating(null);
    }
  };

  const reports = [
    { type: "full", title: "통합 리포트", desc: "상품 + 손익 + 재고 + 광고 전체", color: "bg-blue-600 hover:bg-blue-700" },
    { type: "products", title: "상품 리포트", desc: "전체 상품 목록, 등급, 손익 요약", color: "bg-slate-600 hover:bg-slate-700" },
    { type: "profitloss", title: "손익 리포트", desc: "상품별 손익 상세 (매출~순이익)", color: "bg-green-600 hover:bg-green-700" },
    { type: "inventory", title: "재고 리포트", desc: "재고 현황, 발주 추천, 적정 재고", color: "bg-orange-600 hover:bg-orange-700" },
    { type: "ads", title: "광고 리포트", desc: "광고 효율, ROAS, 비용 분석", color: "bg-purple-600 hover:bg-purple-700" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">
        <FileSpreadsheet size={24} className="inline mr-2 text-green-600" />
        리포트 / 엑셀 출력
      </h1>

      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm text-blue-800">
        회사별(거영/해피프렌즈) 분리 출력은 각 페이지에서 회사 필터 적용 후 다운로드하세요.
      </div>

      <div className="grid grid-cols-1 gap-4">
        {reports.map((r) => (
          <div key={r.type} className="bg-white rounded-xl p-5 border border-slate-200 flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
              <h3 className="font-semibold text-slate-900">{r.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{r.desc}</p>
            </div>
            <button
              onClick={() => generateReport(r.type)}
              disabled={generating !== null}
              className={`flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-medium ${r.color} disabled:opacity-50`}
            >
              <Download size={16} />
              {generating === r.type ? "생성 중..." : "다운로드"}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-sm text-slate-600">
        <strong>자동 리포트:</strong> 매월 1일, 전월 통합 리포트가 자동 생성됩니다. (서버 배포 후 활성화)
      </div>
    </div>
  );
}
