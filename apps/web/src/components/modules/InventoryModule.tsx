'use client';

import { useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, Package, ArrowLeftRight, Search } from 'lucide-react';
import DataTable, { Column } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import MetricCard from '@/components/ui/MetricCard';
import { formatNumber } from '@/lib/utils';

const mockInventory = Array.from({ length: 40 }, (_, i) => {
  const products = [
    { name: '감정잔디인형키우기', sku: 'KI-001' },
    { name: 'LCD전자메모보드(8.5)', sku: 'KI-002' },
    { name: '해피원목테트리스', sku: 'KI-003' },
    { name: '콩나물키우기세트', sku: 'KI-004' },
    { name: '문구세트 12종', sku: 'KI-005' },
    { name: '비눗방울 대형', sku: 'KI-006' },
    { name: '캐치볼(소)', sku: 'KI-007' },
    { name: '말랑이 스퀴시', sku: 'KI-008' },
    { name: 'LED빅라켓(2탄)', sku: 'KI-009' },
    { name: '포켓몬메타몽샤프', sku: 'KI-010' },
    { name: '리얼에그스트레스볼', sku: 'KI-011' },
    { name: '마리모키우기', sku: 'KI-012' },
    { name: 'RC카 무선조종', sku: 'KI-013' },
    { name: '애니멀청소세트', sku: 'KI-014' },
    { name: '원목칠교(대)', sku: 'KI-015' },
    { name: '변색토끼주물럭', sku: 'KI-016' },
    { name: '배틀글라이더2탄', sku: 'KI-017' },
    { name: '큐브팝말랑이', sku: 'KI-018' },
    { name: '러브오리비눗방울', sku: 'KI-019' },
    { name: '카피바라필통', sku: 'KI-020' },
  ];
  const p = products[i % products.length];
  const selpiaStock = Math.floor(Math.random() * 200);
  const symphonyStock = selpiaStock + Math.floor(Math.random() * 10) - 5;
  const diff = Math.abs(selpiaStock - symphonyStock);

  return {
    id: `inv-${i}`,
    sku: `${p.sku}-${Math.floor(i / products.length)}`,
    productName: p.name,
    selpiaStock,
    symphonyStock: Math.max(0, symphonyStock),
    sabangnetStock: selpiaStock,
    diff,
    status: selpiaStock === 0 ? 'out_of_stock' as const : selpiaStock < 10 ? 'low_stock' as const : 'in_stock' as const,
    lastSynced: new Date(Date.now() - Math.floor(Math.random() * 900000)).toISOString(),
    isMismatch: diff > 0,
  };
});

export default function InventoryModule() {
  const [syncing, setSyncing] = useState(false);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 2500);
  };

  const totalItems = mockInventory.length;
  const outOfStock = mockInventory.filter((i) => i.status === 'out_of_stock').length;
  const lowStock = mockInventory.filter((i) => i.status === 'low_stock').length;
  const mismatches = mockInventory.filter((i) => i.isMismatch).length;

  const columns: Column<typeof mockInventory[0]>[] = [
    {
      key: 'sku',
      header: 'SKU',
      render: (item) => <span className="font-mono text-[11px] text-blue-600">{item.sku}</span>,
    },
    {
      key: 'productName',
      header: '상품명',
      render: (item) => <span className="text-gray-700">{item.productName}</span>,
    },
    {
      key: 'selpiaStock',
      header: '셀피아',
      align: 'center',
      render: (item) => (
        <span className={item.selpiaStock === 0 ? 'text-red-400 font-bold' : item.selpiaStock < 10 ? 'text-amber-400' : 'text-gray-700'}>
          {item.selpiaStock}
        </span>
      ),
    },
    {
      key: 'symphonyStock',
      header: '심포니',
      align: 'center',
      render: (item) => (
        <span className={item.isMismatch ? 'text-amber-400' : 'text-gray-700'}>
          {item.symphonyStock}
        </span>
      ),
    },
    {
      key: 'diff',
      header: '차이',
      align: 'center',
      render: (item) => (
        item.diff > 0
          ? <span className="text-red-400 font-bold">+{item.diff}</span>
          : <span className="text-gray-700">0</span>
      ),
    },
    {
      key: 'status',
      header: '상태',
      align: 'center',
      render: (item) => {
        if (item.status === 'out_of_stock') return <StatusBadge variant="error" dot>품절</StatusBadge>;
        if (item.status === 'low_stock') return <StatusBadge variant="warning" dot>부족</StatusBadge>;
        return <StatusBadge variant="success" dot>정상</StatusBadge>;
      },
    },
    {
      key: 'isMismatch',
      header: '동기화',
      align: 'center',
      render: (item) =>
        item.isMismatch ? (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mx-auto" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Sync Control */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArrowLeftRight className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-gray-900">재고 동기화</h3>
            <span className="text-[10px] text-gray-600">셀피아 ↔ 심포니 ↔ 사방넷</span>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '동기화중...' : '수동 동기화'}
          </button>
        </div>
        {syncing && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              셀피아/심포니/사방넷 재고 대조 중...
            </div>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="전체 SKU" value={totalItems} icon={<Package className="w-4 h-4" />} color="text-gray-900" />
        <MetricCard label="품절 상품" value={outOfStock} color={outOfStock > 0 ? 'text-red-400' : 'text-gray-500'} subValue="즉시 확인 필요" />
        <MetricCard label="재고 부족" value={lowStock} color={lowStock > 0 ? 'text-amber-400' : 'text-gray-500'} subValue="10개 미만" />
        <MetricCard label="불일치" value={mismatches} color={mismatches > 0 ? 'text-red-400' : 'text-green-600'} subValue="셀피아 ↔ 심포니" />
      </div>

      {/* Mismatch Alert */}
      {mismatches > 0 && (
        <div className="glass-card p-4 border-amber-500/20">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-amber-400">재고 불일치 {mismatches}건 감지</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {mockInventory.filter((i) => i.isMismatch).slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-700 truncate">{item.productName}</p>
                  <p className="text-[9px] text-gray-600">셀피아:{item.selpiaStock} / 심포니:{item.symphonyStock}</p>
                </div>
                <button className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-1 rounded bg-amber-500/10">
                  조정
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <DataTable
        title="재고 현황"
        columns={columns}
        data={mockInventory}
        pageSize={12}
        searchable
        searchPlaceholder="SKU, 상품명 검색..."
      />
    </div>
  );
}
