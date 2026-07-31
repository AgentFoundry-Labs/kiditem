'use client';

import { cn } from '@/lib/utils';

export function SellpiaOutOfStockToggle({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
      />
      <span>품절상품 포함</span>
    </label>
  );
}
