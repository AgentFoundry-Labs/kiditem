'use client';

import { useState } from 'react';
import {
  Play, RefreshCw, Package, Truck, AlertCircle,
  CheckCircle2, Clock, ShoppingCart, ArrowUpRight,
  Download, Upload, BarChart3,
} from 'lucide-react';
import DataTable, { Column } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import MetricCard from '@/components/ui/MetricCard';
import { formatNumber, formatCurrency } from '@/lib/utils';

// Mock order data based on actual business
const mockOrders = Array.from({ length: 35 }, (_, i) => {
  const platforms = ['자사몰', '스마트스토어', '쿠팡', '지마켓', '11번가', '키드키즈', '아이스크림', '원폴라리스', '해법몰', '보리보리'];
  const products = [
    '감정잔디인형키우기', 'LCD전자메모보드(8.5)', '해피원목테트리스', '콩나물키우기세트',
    '문구세트 12종', '비눗방울 대형', '캐치볼(소)', '말랑이 스퀴시', 'LED빅라켓',
    '포켓몬메타몽샤프', '리얼에그스트레스볼', '마리모키우기', 'RC카 무선조종',
  ];
  const statuses: Array<'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'> = 
    ['pending', 'processing', 'shipped', 'shipped', 'shipped', 'delivered', 'delivered', 'delivered', 'cancelled'];
  
  const status = statuses[Math.floor(Math.random() * statuses.length)];
  const platform = platforms[Math.floor(Math.random() * platforms.length)];
  const product = products[Math.floor(Math.random() * products.length)];
  const qty = Math.floor(Math.random() * 5) + 1;
  const price = [3000, 5000, 8000, 10000, 12000, 15000, 18000, 20000, 25000][Math.floor(Math.random() * 9)];

  return {
    id: `ORD-${(20260318000 + i).toString()}`,
    platform,
    orderNumber: `${platform.substring(0, 2)}-${Math.floor(Math.random() * 9000000 + 1000000)}`,
    customerName: `고객${i + 1}`,
    productName: product,
    quantity: qty,
    amount: price * qty,
    status,
    trackingNumber: status === 'shipped' || status === 'delivered' ? `CJ${Math.floor(Math.random() * 9000000000 + 1000000000)}` : undefined,
    orderedAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 3)).toISOString(),
    shippedAt: status === 'shipped' || status === 'delivered' ? new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString() : undefined,
    isMatched: Math.random() > 0.1,
  };
});

const platformStats = [
  { name: '자사몰', orders: 8, revenue: 156000, color: '#3B82F6' },
  { name: '스마트스토어', orders: 6, revenue: 234000, color: '#10B981' },
  { name: '쿠팡', orders: 5, revenue: 189000, color: '#F59E0B' },
  { name: '지마켓', orders: 4, revenue: 112000, color: '#EF4444' },
  { name: '11번가', orders: 3, revenue: 87000, color: '#8B5CF6' },
  { name: '키드키즈', orders: 3, revenue: 156000, color: '#EC4899' },
  { name: '아이스크림', orders: 2, revenue: 45000, color: '#06B6D4' },
  { name: '기타', orders: 4, revenue: 98000, color: '#6B7280' },
];

const statusMap = {
  pending: { label: '주문접수', variant: 'warning' as const },
  processing: { label: '처리중', variant: 'info' as const },
  shipped: { label: '배송중', variant: 'processing' as const },
  delivered: { label: '배송완료', variant: 'success' as const },
  cancelled: { label: '취소', variant: 'error' as const },
};

export default function OrderModule() {
  const [isCollecting, setIsCollecting] = useState(false);
  const [lastCollected, setLastCollected] = useState<string | null>(null);

  const handleCollect = () => {
    setIsCollecting(true);
    setTimeout(() => {
      setIsCollecting(false);
      setLastCollected(new Date().toISOString());
    }, 3000);
  };

  const totalOrders = mockOrders.length;
  const totalRevenue = mockOrders.reduce((s, o) => s + o.amount, 0);
  const pendingOrders = mockOrders.filter((o) => o.status === 'pending').length;
  const unmatchedOrders = mockOrders.filter((o) => !o.isMatched).length;

  const columns: Column<typeof mockOrders[0]>[] = [
    {
      key: 'orderNumber',
      header: '주문번호',
      render: (item) => (
        <span className="text-blue-600 font-mono text-[11px]">{item.orderNumber}</span>
      ),
    },
    {
      key: 'platform',
      header: '플랫폼',
      render: (item) => {
        const stat = platformStats.find((p) => p.name === item.platform);
        return (
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: stat?.color || '#6B7280' }}
            />
            <span className="text-xs">{item.platform}</span>
          </div>
        );
      },
    },
    {
      key: 'productName',
      header: '상품명',
      render: (item) => (
        <span className="text-gray-700 truncate max-w-[180px] block">{item.productName}</span>
      ),
    },
    {
      key: 'quantity',
      header: '수량',
      align: 'center',
      render: (item) => <span>{item.quantity}개</span>,
    },
    {
      key: 'amount',
      header: '금액',
      align: 'right',
      render: (item) => (
        <span className="text-gray-700 font-medium">{formatCurrency(item.amount)}</span>
      ),
    },
    {
      key: 'status',
      header: '상태',
      align: 'center',
      render: (item) => {
        const s = statusMap[item.status];
        return <StatusBadge variant={s.variant} dot>{s.label}</StatusBadge>;
      },
    },
    {
      key: 'trackingNumber',
      header: '송장번호',
      render: (item) => (
        item.trackingNumber
          ? <span className="font-mono text-[10px] text-gray-500">{item.trackingNumber}</span>
          : <span className="text-gray-700">-</span>
      ),
    },
    {
      key: 'isMatched',
      header: '재고매칭',
      align: 'center',
      render: (item) =>
        item.isMatched ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
        ) : (
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 mx-auto" />
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900">주문수집 제어</h3>
            {lastCollected && (
              <span className="text-[10px] text-gray-600">
                마지막 수집: {new Date(lastCollected).toLocaleTimeString('ko-KR')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCollect}
              disabled={isCollecting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white text-xs font-medium transition-colors"
            >
              {isCollecting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {isCollecting ? '수집중...' : '수동 주문수집'}
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 border border-emerald-500/20 text-green-600 text-xs font-medium hover:bg-emerald-500/20 transition-colors">
              <Upload className="w-3.5 h-3.5" />
              송장 일괄전송
            </button>
          </div>
        </div>

        {/* Collection Status */}
        {isCollecting && (
          <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-blue-600">셀피아 + 사방넷 주문수집 중...</span>
                  <span className="text-[10px] text-gray-600">6/8 채널</span>
                </div>
                <div className="h-1 bg-white rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '75%' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-5 gap-3">
        <MetricCard
          label="오늘 총 주문"
          value={formatNumber(totalOrders)}
          subValue="전일 대비"
          icon={<ShoppingCart className="w-4 h-4" />}
          trend={{ value: 12, label: '전일비' }}
          color="text-gray-900"
        />
        <MetricCard
          label="오늘 매출"
          value={formatCurrency(totalRevenue)}
          icon={<BarChart3 className="w-4 h-4" />}
          trend={{ value: 8, label: '전일비' }}
          color="text-green-600"
        />
        <MetricCard
          label="미처리 주문"
          value={pendingOrders}
          subValue="즉시 처리 필요"
          icon={<Clock className="w-4 h-4" />}
          color={pendingOrders > 0 ? 'text-amber-400' : 'text-gray-500'}
        />
        <MetricCard
          label="재고 미매칭"
          value={unmatchedOrders}
          subValue="재고 확인 필요"
          icon={<AlertCircle className="w-4 h-4" />}
          color={unmatchedOrders > 0 ? 'text-red-400' : 'text-gray-500'}
        />
        <MetricCard
          label="배송중"
          value={mockOrders.filter((o) => o.status === 'shipped').length}
          icon={<Truck className="w-4 h-4" />}
          color="text-violet-400"
        />
      </div>

      {/* Platform Breakdown */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">플랫폼별 현황</h3>
        <div className="grid grid-cols-4 gap-3">
          {platformStats.map((p) => (
            <div key={p.name} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${p.color}15` }}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700">{p.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-gray-600">{p.orders}건</span>
                  <span className="text-[10px] text-gray-700">|</span>
                  <span className="text-[10px] text-gray-500">{formatCurrency(p.revenue)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Order Table */}
      <DataTable
        title="주문 목록"
        columns={columns}
        data={mockOrders}
        pageSize={10}
        searchable
        searchPlaceholder="주문번호, 상품명, 플랫폼 검색..."
        actions={
          <div className="flex items-center gap-2">
            <select className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-500 focus:outline-none">
              <option value="">전체 상태</option>
              <option value="pending">주문접수</option>
              <option value="processing">처리중</option>
              <option value="shipped">배송중</option>
              <option value="delivered">배송완료</option>
              <option value="cancelled">취소</option>
            </select>
            <select className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-500 focus:outline-none">
              <option value="">전체 플랫폼</option>
              {platformStats.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
        }
      />
    </div>
  );
}
