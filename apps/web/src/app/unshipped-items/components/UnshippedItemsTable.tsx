'use client';

import { Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnshippedItem } from '../page';

interface Props {
  items: UnshippedItem[];
}

export default function UnshippedItemsTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Truck size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-500">미배송 건이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="table-card">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>지연일수</th>
              <th>주문번호</th>
              <th>상품명</th>
              <th className="text-right">수량</th>
              <th>주문일</th>
              <th>사유</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={
                  item.delayDays >= 3
                    ? "bg-red-50/50"
                    : item.delayDays >= 1
                      ? "bg-orange-50/30"
                      : ""
                }
              >
                <td
                  className={cn('text-center font-bold tabular-nums', item.delayDays >= 3 ? 'text-red-600' : item.delayDays >= 1 ? 'text-orange-500' : 'text-slate-400')}
                >
                  {item.delayDays}일
                </td>
                <td className="text-sm text-slate-500 font-mono">
                  {item.orderId}
                </td>
                <td className="font-medium text-slate-900 max-w-[250px] truncate">
                  {item.productName}
                </td>
                <td className="text-right tabular-nums">
                  {item.quantity}
                </td>
                <td className="text-sm text-slate-400 tabular-nums">
                  {new Date(item.orderDate).toLocaleDateString("ko-KR")}
                </td>
                <td className="text-sm text-slate-500">
                  {item.reason || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
