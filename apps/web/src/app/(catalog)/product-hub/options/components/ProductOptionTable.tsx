'use client';

import { Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import type { ProductOptionListItem } from '@kiditem/shared/product';

interface Props {
  items: ProductOptionListItem[];
  isLoading: boolean;
  onEdit: (item: ProductOptionListItem) => void;
  onSoftDelete: (item: ProductOptionListItem) => void;
  onRestore: (item: ProductOptionListItem) => void;
}

export default function ProductOptionTable({
  items,
  isLoading,
  onEdit,
  onSoftDelete,
  onRestore,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">SKU</th>
              <th className="text-left px-4 py-3">상품명</th>
              <th className="text-left px-4 py-3">옵션명</th>
              <th className="text-left px-4 py-3">판매자 상품코드</th>
              <th className="text-right px-4 py-3">매입가</th>
              <th className="text-right px-4 py-3">판매가</th>
              <th className="text-center px-4 py-3">번들</th>
              <th className="text-center px-4 py-3">상태</th>
              <th className="text-right px-4 py-3">액션</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  로딩 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  조건에 맞는 옵션이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const deleted = item.isDeleted;
                return (
                  <tr
                    key={item.id}
                    className={cn(
                      'border-t border-slate-100 hover:bg-slate-50',
                      deleted && 'bg-slate-50/60 text-slate-400',
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
                    <td className="px-4 py-3 min-w-[180px] max-w-[280px]">
                      <span className="block truncate font-medium text-slate-700" title={item.masterName}>
                        {item.masterName}
                      </span>
                    </td>
                    <td className="px-4 py-3">{item.optionName ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.legacyCode ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.costPrice == null ? '-' : `${formatKRW(item.costPrice)}원`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.sellPrice == null ? '-' : `${formatKRW(item.sellPrice)}원`}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {item.isBundle ? (
                        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                          BUNDLE
                        </span>
                      ) : (
                        <span className="text-slate-400">SIMPLE</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {deleted && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-600">
                            삭제됨
                          </span>
                        )}
                        {!deleted && !item.isActive && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                            비활성
                          </span>
                        )}
                        {!deleted && item.isActive && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            활성
                          </span>
                        )}
                        {item.isTemporary && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            임시
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {deleted ? (
                          <button
                            type="button"
                            onClick={() => onRestore(item)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-emerald-50 text-emerald-700"
                          >
                            <RotateCcw size={12} /> 복원
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onEdit(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-slate-100 text-slate-700"
                            >
                              <Pencil size={12} /> 수정
                            </button>
                            <button
                              type="button"
                              onClick={() => onSoftDelete(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-red-50 text-red-600"
                            >
                              <Trash2 size={12} /> 삭제
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
