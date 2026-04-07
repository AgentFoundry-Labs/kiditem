'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2, AlertTriangle, MinusCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatKRW, formatPercent, getProfitColor, getGradeColor } from '@/lib/utils';

interface Product {
  id: string; name: string; sku: string; company: string; abcGrade: string;
  revenue: number; netProfit: number; profitRate: number; adRate: number;
  costPrice: number; sellPrice: number; commissionRate: number; shippingCost: number;
  thumbnailUrl: string | null; imageUrl: string | null;
}

export default function CleanupProducts() {
  const [filter, setFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.products.list({ limit: '200' }),
    queryFn: () =>
      apiClient.get<{ items: Product[]; total: number }>(
        '/api/products?limit=200'
      ),
  });

  const products = data?.items ?? [];

  const minusProducts = products.filter((p) => p.profitRate < 0);
  const lowProducts = products.filter((p) => p.profitRate >= 0 && p.profitRate <= 3);

  const filtered = filter === 'minus' ? minusProducts : filter === 'low' ? lowProducts : products;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <Trash2 size={24} className="inline mr-2 text-red-500" />
          정리 대상 (순이익 3% 이하)
        </h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 rounded-xl p-5 border border-red-200">
          <div className="flex items-center gap-2 text-red-600"><MinusCircle size={18} /> 적자 상품</div>
          <div className="text-3xl font-bold text-red-700 mt-2">{isLoading ? '-' : `${minusProducts.length}개`}</div>
          <div className="text-xs text-red-500 mt-1">즉시 아웃 검토 필요</div>
        </div>
        <div className="bg-orange-50 rounded-xl p-5 border border-orange-200">
          <div className="flex items-center gap-2 text-orange-600"><AlertTriangle size={18} /> 순이익 0~3%</div>
          <div className="text-3xl font-bold text-orange-700 mt-2">{isLoading ? '-' : `${lowProducts.length}개`}</div>
          <div className="text-xs text-orange-500 mt-1">개선 또는 정리 판단 필요</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
          <div className="text-slate-600">전체 정리 대상</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">{isLoading ? '-' : `${products.length}개`}</div>
        </div>
      </div>

      {/* Cleanup Flow */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm text-slate-700 mb-3">정리 판단 플로우</h3>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="px-3 py-1.5 bg-red-100 text-red-800 rounded-lg font-medium">순이익 3% 이하 감지</span>
          <span>→</span>
          <span className="px-3 py-1.5 bg-orange-100 text-orange-800 rounded-lg font-medium">원인 분석 (광고? 가격? 수수료?)</span>
          <span>→</span>
          <span className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg font-medium">판단 (개선 / 정리)</span>
          <span>→</span>
          <span className="px-3 py-1.5 bg-green-100 text-green-800 rounded-lg font-medium">처리</span>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'all' ? 'bg-purple-600 text-white' : 'bg-white border hover:bg-slate-50'}`}>전체 ({products.length})</button>
        <button onClick={() => setFilter('minus')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'minus' ? 'bg-red-600 text-white' : 'bg-white border hover:bg-slate-50 text-red-600'}`}>적자 ({minusProducts.length})</button>
        <button onClick={() => setFilter('low')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'low' ? 'bg-orange-600 text-white' : 'bg-white border hover:bg-slate-50 text-orange-600'}`}>3%이하 ({lowProducts.length})</button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          로딩 중...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          정리 대상 상품이 없습니다.
        </div>
      ) : (
      <div className="table-card">
        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>등급</th>
              <th>이미지</th>
              <th>상품명</th>
              <th>회사</th>
              <th className="text-right">판매가</th>
              <th className="text-right">매입가</th>
              <th className="text-right">매출</th>
              <th className="text-right">순이익</th>
              <th className="text-right">이익률</th>
              <th className="text-right">광고비율</th>
              <th>원인 추정</th>
              <th>권장 액션</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const margin = p.sellPrice > 0 ? ((p.sellPrice - p.costPrice) / p.sellPrice) * 100 : 0;
              let cause = '복합';
              let action = '검토 필요';
              if (p.adRate > 15) { cause = '광고비 과다'; action = '광고 조정'; }
              else if (margin < 30) { cause = '마진 부족'; action = '가격/소싱 재검토'; }
              else if (p.commissionRate > 10) { cause = '수수료 높음'; action = '카테고리 확인'; }
              if (p.profitRate < -5) { action = '즉시 정리(아웃)'; }

              return (
                <tr key={p.id} className={p.profitRate < 0 ? 'bg-red-50/60' : 'bg-orange-50/30'}>
                  <td><span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(p.abcGrade)}`}>{p.abcGrade}</span></td>
                  <td>
                    <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden">
                      {(p.thumbnailUrl || p.imageUrl) ? (
                        <img src={p.thumbnailUrl || p.imageUrl!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">N/A</div>
                      )}
                    </div>
                  </td>
                  <td className="font-medium text-slate-900">{p.name}</td>
                  <td className="text-slate-500 text-xs">{p.company}</td>
                  <td className="text-right tabular-nums">{formatKRW(p.sellPrice)}</td>
                  <td className="text-right tabular-nums text-slate-500">{formatKRW(p.costPrice)}</td>
                  <td className="text-right tabular-nums">{formatKRW(p.revenue)}</td>
                  <td className={`text-right tabular-nums font-semibold ${getProfitColor(p.profitRate)}`}>{formatKRW(p.netProfit)}</td>
                  <td className={`text-right tabular-nums font-semibold ${getProfitColor(p.profitRate)}`}>{formatPercent(p.profitRate)}</td>
                  <td className={`text-right tabular-nums ${p.adRate > 15 ? 'text-red-600 font-semibold' : ''}`}>{p.adRate > 0 ? formatPercent(p.adRate) : '-'}</td>
                  <td><span className="text-xs text-slate-600">{cause}</span></td>
                  <td><span className={`px-2 py-0.5 rounded text-xs font-medium ${p.profitRate < -5 ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>{action}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      )}
    </div>
  );
}
