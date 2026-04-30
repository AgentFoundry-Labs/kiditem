'use client';

import dynamic from 'next/dynamic';
import { Handshake, History, TrendingUp, ShoppingBag, Receipt, CreditCard, FileText } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';

const SupplierHistoryPage = dynamic(() => import('@/app/(finance)/supplier-hub/components/SupplierHistory'), { ssr: false });
const SupplierSalesPage = dynamic(() => import('@/app/(finance)/supplier-hub/components/SupplierSales'), { ssr: false });
const SupplierProductSalesPage = dynamic(() => import('@/app/(finance)/supplier-hub/components/SupplierProductSales'), { ssr: false });
const SupplierSettlementPage = dynamic(() => import('@/app/(finance)/supplier-hub/components/SupplierSettlement'), { ssr: false });
const SupplierPaymentsPage = dynamic(() => import('@/app/(finance)/supplier-hub/components/SupplierPayments'), { ssr: false });
const SupplierPurchasesPage = dynamic(() => import('@/app/(finance)/supplier-hub/components/SupplierPurchases'), { ssr: false });

export default function SupplierHubPage() {
  return (
    <TabLayout
      title="거래처 관리"
      titleIcon={Handshake}
      tabs={[
        { id: 'history', label: '거래 현황', icon: History, content: <SupplierHistoryPage /> },
        { id: 'sales', label: '매입처 판매', icon: TrendingUp, content: <SupplierSalesPage /> },
        { id: 'productSales', label: '상품별 판매', icon: ShoppingBag, content: <SupplierProductSalesPage /> },
        { id: 'settlement', label: '구매 정산', icon: Receipt, content: <SupplierSettlementPage /> },
        { id: 'payments', label: '지불 현황', icon: CreditCard, content: <SupplierPaymentsPage /> },
        { id: 'purchases', label: '상세 구매', icon: FileText, content: <SupplierPurchasesPage /> },
      ]}
    />
  );
}
