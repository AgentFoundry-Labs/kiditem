'use client';

import Link from 'next/link';
import { formatKRW, formatNumber } from '@/lib/utils';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';

interface SellpiaOptionTableProps {
  items: InventorySkuSnapshotItem[];
  isLoading: boolean;
}

export default function SellpiaOptionTable({
  items,
  isLoading,
}: SellpiaOptionTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Sellpia SKU ID</th>
              <th className="px-4 py-3 text-left">Sellpia 코드</th>
              <th className="px-4 py-3 text-left">상품명</th>
              <th className="px-4 py-3 text-left">옵션명</th>
              <th className="px-4 py-3 text-left">바코드</th>
              <th className="px-4 py-3 text-right">매입가</th>
              <th className="px-4 py-3 text-right">판매가</th>
              <th className="px-4 py-3 text-right">현재고</th>
              <th className="px-4 py-3 text-center">상태</th>
              <th className="px-4 py-3 text-left">연결 대상</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400">
                  로딩 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400">
                  조건에 맞는 옵션이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.sellpiaInventorySkuId}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="max-w-[190px] px-4 py-3">
                    <code
                      className="block select-all truncate text-[11px] text-slate-500"
                      title={item.sellpiaInventorySkuId}
                    >
                      {item.sellpiaInventorySkuId}
                    </code>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {item.code}
                  </td>
                  <td className="min-w-[180px] max-w-[280px] px-4 py-3">
                    <span
                      className="block truncate font-medium text-slate-700"
                      title={item.name}
                    >
                      {item.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {item.optionName ?? '-'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {item.barcode ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.purchasePrice === null ? '-' : `${formatKRW(item.purchasePrice)}원`}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.salePrice === null ? '-' : `${formatKRW(item.salePrice)}원`}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${
                    item.currentStock > 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {formatNumber(item.currentStock)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      item.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {item.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.linkStatus === 'linked' ? (
                      <div className="min-w-[220px] space-y-2">
                        <p className="text-[11px] font-bold text-purple-700">
                          상품 {item.linkedProductCount} · 옵션 {item.linkedVariantCount}
                        </p>
                        <div className="space-y-1">
                          {item.linkedProducts.map((product) => (
                            <Link
                              key={product.id}
                              href={`/product-hub/${product.id}`}
                              className="block truncate text-xs font-semibold text-purple-700 hover:underline"
                            >
                              {product.code} · {product.name}
                            </Link>
                          ))}
                        </div>
                        <div className="space-y-1 border-t border-slate-100 pt-1">
                          {item.linkedVariants.map((variant) => (
                            <Link
                              key={variant.id}
                              href={`/product-hub/${variant.masterProductId}#variant-${variant.id}`}
                              className="block truncate text-[11px] text-slate-600 hover:text-purple-700 hover:underline"
                            >
                              {variant.code} · {variant.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="rounded bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">미연결</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
