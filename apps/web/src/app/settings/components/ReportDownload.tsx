'use client';

import { useState } from 'react';
import { FileSpreadsheet, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';

const REPORTS = [
  { type: 'full', title: '통합 리포트', desc: '상품 + 손익 + 재고 + 광고 전체', icon: '📊', color: 'bg-blue-600 hover:bg-blue-700' },
  { type: 'products', title: '상품 리포트', desc: '전체 상품 목록, 등급, 손익 요약', icon: '📦', color: 'bg-slate-600 hover:bg-slate-700' },
  { type: 'profitloss', title: '손익 리포트', desc: '상품별 손익 상세 (매출~순이익)', icon: '💰', color: 'bg-green-600 hover:bg-green-700' },
  { type: 'inventory', title: '재고 리포트', desc: '재고 현황, 발주 추천, 적정 재고', icon: '🏭', color: 'bg-orange-600 hover:bg-orange-700' },
  { type: 'ads', title: '광고 리포트', desc: '광고 효율, ROAS, 비용 분석', icon: '📢', color: 'bg-purple-600 hover:bg-purple-700' },
] as const;

const API_PATHS: Record<string, string> = {
  products: '/api/products',
  profitloss: '/api/profit-loss',
  inventory: '/api/inventory',
  ads: '/api/ads',
};

export default function ReportDownload() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async (type: string) => {
    setGenerating(type);
    setError(null);
    try {
      const XLSX = await import('xlsx');

      const needed = type === 'full' ? Object.keys(API_PATHS) : [type];
      const responses = await Promise.all(
        needed.map(async (k) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = await apiClient.get<any>(API_PATHS[k]);
          return { key: k, data };
        })
      );

      const dataMap: Record<string, unknown> = {};
      for (const r of responses) dataMap[r.key] = r.data;

      const wb = XLSX.utils.book_new();

      if (dataMap.products) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = dataMap.products as any;
        const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws = XLSX.utils.json_to_sheet(arr.map((p: any) => ({
          등급: p.abcGrade, 상품명: p.name, SKU: p.sku, 카테고리: p.category,
          회사: p.company, 판매가: p.sellPrice, 매입가: p.costPrice,
          매출: p.revenue, 순이익: p.netProfit, '이익률(%)': p.profitRate,
          '광고비율(%)': p.adRate, 재고: p.currentStock, 상태: p.status,
        })));
        XLSX.utils.book_append_sheet(wb, ws, '상품목록');
      }

      if (dataMap.profitloss) {
        const arr = Array.isArray(dataMap.profitloss) ? dataMap.profitloss : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws = XLSX.utils.json_to_sheet(arr.map((d: any) => ({
          등급: d.grade, 상품명: d.productName, 회사: d.company,
          매출: d.revenue, 매입원가: d.costOfGoods, 수수료: d.commission,
          배송비: d.shippingCost, 광고비: d.adCost, 순이익: d.netProfit,
          '이익률(%)': d.profitRate, 주문수: d.orderCount,
        })));
        XLSX.utils.book_append_sheet(wb, ws, '손익표');
      }

      if (dataMap.inventory) {
        const arr = Array.isArray(dataMap.inventory) ? dataMap.inventory : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws = XLSX.utils.json_to_sheet(arr.map((i: any) => ({
          상품명: i.productName, SKU: i.sku, 회사: i.company,
          현재고: i.currentStock, 적정재고: i.optimalStock, 발주점: i.reorderPoint,
          일평균판매: i.avgDailySales, 남은일수: i.daysRemaining,
          추천발주량: i.recommendedOrder, 상태: i.status,
        })));
        XLSX.utils.book_append_sheet(wb, ws, '재고현황');
      }

      if (dataMap.ads) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adsData = dataMap.ads as any;
        const arr = Array.isArray(adsData?.products) ? adsData.products : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws = XLSX.utils.json_to_sheet(arr.map((a: any) => ({
          등급: a.grade, 광고등급: a.adTier, 상품명: a.name, 회사: a.company,
          광고비: a.spend, 광고매출: a.adRevenue, 'ROAS(%)': a.roas,
          'CTR(%)': a.ctr, '전환율(%)': a.convRate, '광고비율(%)': a.adRate,
        })));
        XLSX.utils.book_append_sheet(wb, ws, '광고현황');
      }

      if (wb.SheetNames.length === 0) {
        const msg = '다운로드할 데이터가 없습니다.';
        setError(msg);
        toast.error(msg);
        return;
      }

      const fileName =
        type === 'full'
          ? `KIDITEM_통합리포트_${new Date().toISOString().slice(0, 10)}.xlsx`
          : `KIDITEM_${type}_리포트_${new Date().toISOString().slice(0, 10)}.xlsx`;

      XLSX.writeFile(wb, fileName);
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
              className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium ${r.color} disabled:opacity-50 transition-colors`}
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
