'use client';
import type { ProductListItem as Product } from '@kiditem/shared';
import { formatKRW, formatPercent, getProfitColor, getGradeColor } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';

interface Props {
  products: Product[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function CleanupTable({ products, page, pageSize, total, onPageChange }: Props) {
  if (products.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
        정리 대상 상품이 없습니다.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr className="bg-slate-50">
              <th>등급</th>
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
            {products.map((p) => {
              const margin = p.sellPrice > 0 ? ((p.sellPrice - p.costPrice) / p.sellPrice) * 100 : 0;
              let cause = '복합';
              let action = '검토 필요';
              if (p.adRate > 15) { cause = '광고비 과다'; action = '광고 조정'; }
              else if (margin < 30) { cause = '마진 부족'; action = '가격/소싱 재검토'; }
              else if (p.commissionRate > 10) { cause = '수수료 높음'; action = '카테고리 확인'; }
              if (p.profitRate < -5) { action = '즉시 정리(아웃)'; }

              return (
                <tr key={p.id} className={p.sellPrice === 0 && p.revenue === 0 ? 'bg-amber-50/30' : p.profitRate < 0 ? 'bg-red-50/60' : 'bg-orange-50/30'}>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(p.abcGrade ?? '')}`}>{p.abcGrade}</span>
                    {p.sellPrice === 0 && p.revenue === 0 && (
                      <span className="ml-1 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">데이터 불완전</span>
                    )}
                  </td>
                  <td className="font-medium text-slate-900">{p.name}</td>
                  <td className="text-slate-500 text-xs">{p.company}</td>
                  <td className="text-right">{formatKRW(p.sellPrice)}</td>
                  <td className="text-right text-slate-500">{formatKRW(p.costPrice)}</td>
                  <td className="text-right">{formatKRW(p.revenue)}</td>
                  <td className={`text-right font-semibold ${getProfitColor(p.profitRate)}`}>{formatKRW(p.netProfit)}</td>
                  <td className={`text-right font-semibold ${getProfitColor(p.profitRate)}`}>{formatPercent(p.profitRate)}</td>
                  <td className={`text-right ${p.adRate > 15 ? 'text-red-600 font-semibold' : ''}`}>{p.adRate > 0 ? formatPercent(p.adRate) : '-'}</td>
                  <td><span className="text-xs text-slate-600">{cause}</span></td>
                  <td><span className={`px-2 py-0.5 rounded text-xs font-medium ${p.profitRate < -5 ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>{action}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} limit={pageSize} total={total} onPageChange={onPageChange} />
    </div>
  );
}
