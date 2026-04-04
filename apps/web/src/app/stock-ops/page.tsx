'use client';

import TabLayout from '@/components/ui/TabLayout';
import {
  Boxes,
  AlertOctagon,
  Ban,
  ArrowLeftRight,
  StickyNote,
  RotateCcw,
  Clock,
  BarChart3,
  PackageX,
} from 'lucide-react';
import DeadStock from './components/DeadStock';
import ZeroItems from './components/ZeroItems';
import OutOfStock from './components/OutOfStock';
import PendingDelivery from './components/PendingDelivery';
import StockRetention from './components/StockRetention';
import StockTransfers from './components/StockTransfers';
import ProductMemos from './components/ProductMemos';
import ReturnTransfers from './components/ReturnTransfers';

export default function StockOpsPage() {
  return (
    <TabLayout
      title="재고 분석"
      titleIcon={Boxes}
      tabs={[
        {
          id: 'dead',
          label: '악성재고',
          icon: AlertOctagon,
          content: <DeadStock />,
        },
        {
          id: 'zero',
          label: '판매0/재고0',
          icon: Ban,
          content: <ZeroItems />,
        },
        {
          id: 'oos',
          label: '품절',
          icon: PackageX,
          content: <OutOfStock />,
        },
        {
          id: 'pending',
          label: '미송수량',
          icon: Clock,
          content: <PendingDelivery />,
        },
        {
          id: 'retention',
          label: '잔존재고',
          icon: BarChart3,
          content: <StockRetention />,
        },
        {
          id: 'transfer',
          label: '창고 이관',
          icon: ArrowLeftRight,
          content: <StockTransfers />,
        },
        {
          id: 'memo',
          label: '상품 메모',
          icon: StickyNote,
          content: <ProductMemos />,
        },
        {
          id: 'rt',
          label: 'R/T 반품',
          icon: RotateCcw,
          content: <ReturnTransfers />,
        },
      ]}
    />
  );
}
