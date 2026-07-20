import { formatKRW } from '@/lib/utils';

export function DashboardExpenseAmount({ amount }: { amount: number }) {
  return (
    <span className="font-bold tabular-nums text-red-600">
      -{formatKRW(Math.abs(amount))}원
    </span>
  );
}
