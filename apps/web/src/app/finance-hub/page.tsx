'use client';

import dynamic from 'next/dynamic';
import { Wallet, BookOpen, Factory, Calculator, CalendarClock, HandCoins } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';

const ManualLedgerPage = dynamic(() => import('@/app/finance-hub/components/ManualLedger'), { ssr: false });
const ProcessingCostsPage = dynamic(() => import('@/app/finance-hub/components/ProcessingCosts'), { ssr: false });
const ManualSettlementPage = dynamic(() => import('@/app/finance-hub/components/ManualSettlement'), { ssr: false });
const PaymentSchedulePage = dynamic(() => import('@/app/finance-hub/components/PaymentSchedule'), { ssr: false });
const ReceivableSchedulePage = dynamic(() => import('@/app/finance-hub/components/ReceivableSchedule'), { ssr: false });

export default function FinanceHubPage() {
  return (
    <TabLayout
      title="정산 관리"
      titleIcon={Wallet}
      tabs={[
        { id: 'ledger', label: '거래원장', icon: BookOpen, content: <ManualLedgerPage /> },
        { id: 'costs', label: '임가공비', icon: Factory, content: <ProcessingCostsPage /> },
        { id: 'settlement', label: '수기정산', icon: Calculator, content: <ManualSettlementPage /> },
        { id: 'payment', label: '지불예정', icon: CalendarClock, content: <PaymentSchedulePage /> },
        { id: 'receivable', label: '수금예정', icon: HandCoins, content: <ReceivableSchedulePage /> },
      ]}
    />
  );
}
