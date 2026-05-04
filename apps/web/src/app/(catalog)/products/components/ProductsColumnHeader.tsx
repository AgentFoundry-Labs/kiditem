'use client';

import { cn } from '@/lib/utils';

interface Props {
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onToggleSort: (key: string) => void;
}

function SortButton({
  active,
  dir,
  label,
  onClick,
}: {
  active: boolean;
  dir: 'asc' | 'desc';
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-end gap-1 transition-colors',
        active
          ? 'font-bold text-[var(--primary)]'
          : 'text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]',
      )}
    >
      <span>{label}</span>
      <span className={cn('text-[10px]', active ? 'opacity-100' : 'opacity-30')}>
        {active ? (dir === 'desc' ? '▼' : '▲') : '↕'}
      </span>
    </button>
  );
}

export function ProductsColumnHeader({ sortKey, sortDir, onToggleSort }: Props) {
  return (
    <div
      className="grid grid-cols-[minmax(360px,1.45fr)_92px_1.1fr_1fr_1fr_118px] items-center gap-4 px-4 py-2 text-[12px] font-semibold"
      style={{ color: 'var(--text-quaternary)' }}
    >
      <div>상품</div>
      <SortButton active={sortKey === 'stock'} dir={sortDir} label="재고" onClick={() => onToggleSort('stock')} />
      <div className="grid grid-cols-3 gap-2 text-right">
        <SortButton active={sortKey === 'visitors'} dir={sortDir} label="방문" onClick={() => onToggleSort('visitors')} />
        <SortButton active={sortKey === 'views'} dir={sortDir} label="조회" onClick={() => onToggleSort('views')} />
        <SortButton active={sortKey === 'cartAdds'} dir={sortDir} label="장바구니" onClick={() => onToggleSort('cartAdds')} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-right">
        <SortButton active={sortKey === 'orders'} dir={sortDir} label="주문" onClick={() => onToggleSort('orders')} />
        <SortButton active={sortKey === 'salesQty'} dir={sortDir} label="판매" onClick={() => onToggleSort('salesQty')} />
      </div>
      <SortButton active={sortKey === 'revenue'} dir={sortDir} label="매출" onClick={() => onToggleSort('revenue')} />
      <SortButton active={sortKey === 'adRate'} dir={sortDir} label="광고비율" onClick={() => onToggleSort('adRate')} />
    </div>
  );
}
