'use client';

import { useState } from 'react';
import {
  FileText, CreditCard, ArrowDownRight, ArrowUpRight,
  CheckCircle2, Clock, AlertCircle, Wallet, Receipt,
  RefreshCw, Send,
} from 'lucide-react';
import DataTable, { Column } from '@/shared/components/ui/DataTable';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import MetricCard from '@/shared/components/ui/MetricCard';
import { formatCurrency, formatNumber } from '@/lib/utils';

// 자금일보 mock
const fundDaily = {
  date: '2026-03-18',
  openingBalance: 45678900,
  deposits: [
    { desc: '스마트스토어 정산', amount: 1234500, time: '09:30' },
    { desc: '쿠팡 정산', amount: 2345600, time: '10:15' },
    { desc: '지마켓 정산', amount: 567800, time: '11:00' },
    { desc: '도매처(다온) 입금', amount: 890000, time: '14:20' },
    { desc: '메이크샵 무통장', amount: 156000, time: '15:40' },
  ],
  withdrawals: [
    { desc: '대한통운 택배비', amount: 456000, time: '10:00' },
    { desc: '국내발주(스쿨디포)', amount: 1230000, time: '11:30' },
    { desc: '사무실 임대료', amount: 1500000, time: '13:00' },
    { desc: '퓨전엔터 직송운임', amount: 45000, time: '16:00' },
  ],
};

const totalDeposit = fundDaily.deposits.reduce((s, d) => s + d.amount, 0);
const totalWithdrawal = fundDaily.withdrawals.reduce((s, w) => s + w.amount, 0);
const closingBalance = fundDaily.openingBalance + totalDeposit - totalWithdrawal;

// 세금계산서 발행 현황
const taxInvoices = Array.from({ length: 15 }, (_, i) => {
  const types = ['매출', '매출', '매출', '매입'];
  const companies = ['다온', '브라잇웨이', '예스통상', '스쿨디포', '토단교재', '놀이잼', '모닝글로리', '선우글로벌'];
  const statuses: Array<'issued' | 'pending' | 'failed'> = ['issued', 'issued', 'issued', 'issued', 'pending', 'failed'];
  
  return {
    id: `TI-${20260318000 + i}`,
    type: types[Math.floor(Math.random() * types.length)],
    company: companies[Math.floor(Math.random() * companies.length)],
    amount: Math.floor(Math.random() * 5000000) + 100000,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    issuedAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 10)).toISOString(),
    method: Math.random() > 0.3 ? '자동' : '수동',
  };
});

// 입금 매칭 현황
const paymentMatches = Array.from({ length: 12 }, (_, i) => {
  const companies = ['다온', '브라잇웨이', '예스통상', '놀이잼', '선우글로벌', '주식회사윙윙', '모닝글로리창신점'];
  const matched = Math.random() > 0.15;
  return {
    id: `PM-${i}`,
    company: companies[Math.floor(Math.random() * companies.length)],
    expectedAmount: Math.floor(Math.random() * 3000000) + 100000,
    receivedAmount: matched ? Math.floor(Math.random() * 3000000) + 100000 : 0,
    isMatched: matched,
    matchedAt: matched ? new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString() : undefined,
    dueDate: new Date(Date.now() + Math.floor(Math.random() * 86400000 * 10)).toISOString(),
  };
});

export default function AccountingModule() {
  const [generatingReport, setGeneratingReport] = useState(false);

  const invoiceColumns: Column<typeof taxInvoices[0]>[] = [
    {
      key: 'id',
      header: '번호',
      render: (item) => <span className="font-mono text-[11px] text-gray-500">{item.id}</span>,
    },
    {
      key: 'type',
      header: '구분',
      render: (item) => (
        <StatusBadge variant={item.type === '매출' ? 'info' : 'warning'}>
          {item.type}
        </StatusBadge>
      ),
    },
    {
      key: 'company',
      header: '거래처',
      render: (item) => <span className="text-gray-300">{item.company}</span>,
    },
    {
      key: 'amount',
      header: '금액',
      align: 'right',
      render: (item) => <span className="text-gray-300 font-medium">{formatCurrency(item.amount)}</span>,
    },
    {
      key: 'status',
      header: '상태',
      align: 'center',
      render: (item) => {
        if (item.status === 'issued') return <StatusBadge variant="success" dot>발행완료</StatusBadge>;
        if (item.status === 'pending') return <StatusBadge variant="warning" dot>대기</StatusBadge>;
        return <StatusBadge variant="error" dot>실패</StatusBadge>;
      },
    },
    {
      key: 'method',
      header: '방식',
      align: 'center',
      render: (item) => (
        <span className={`text-[10px] ${item.method === '자동' ? 'text-blue-400' : 'text-gray-500'}`}>
          {item.method}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Fund Daily Report */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">자금일보</h3>
            <span className="text-[10px] text-gray-600">{fundDaily.date}</span>
          </div>
          <button
            onClick={() => { setGeneratingReport(true); setTimeout(() => setGeneratingReport(false), 2000); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/20 transition-colors"
          >
            {generatingReport ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            {generatingReport ? '생성중...' : '자금일보 생성'}
          </button>
        </div>

        {/* Balance Summary */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <MetricCard label="전일잔액" value={formatCurrency(fundDaily.openingBalance)} color="text-gray-300" />
          <MetricCard label="입금합계" value={formatCurrency(totalDeposit)} color="text-emerald-400" icon={<ArrowDownRight className="w-4 h-4 text-emerald-400" />} />
          <MetricCard label="출금합계" value={formatCurrency(totalWithdrawal)} color="text-red-400" icon={<ArrowUpRight className="w-4 h-4 text-red-400" />} />
          <MetricCard label="당일잔액" value={formatCurrency(closingBalance)} color="text-blue-400" />
        </div>

        {/* Transaction Lists */}
        <div className="grid grid-cols-2 gap-4">
          {/* Deposits */}
          <div className="rounded-xl bg-black/20 border border-[#1e2028] p-3">
            <p className="text-[10px] text-emerald-400 font-semibold mb-2 uppercase tracking-wider">입금 내역</p>
            <div className="space-y-1.5">
              {fundDaily.deposits.map((d, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="w-3 h-3 text-emerald-500" />
                    <span className="text-[11px] text-gray-400">{d.desc}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-emerald-400 font-medium">+{formatCurrency(d.amount)}</span>
                    <span className="text-[9px] text-gray-700">{d.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Withdrawals */}
          <div className="rounded-xl bg-black/20 border border-[#1e2028] p-3">
            <p className="text-[10px] text-red-400 font-semibold mb-2 uppercase tracking-wider">출금 내역</p>
            <div className="space-y-1.5">
              {fundDaily.withdrawals.map((w, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-3 h-3 text-red-500" />
                    <span className="text-[11px] text-gray-400">{w.desc}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-red-400 font-medium">-{formatCurrency(w.amount)}</span>
                    <span className="text-[9px] text-gray-700">{w.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tax Invoice Table */}
      <DataTable
        title="세금계산서 발행 현황"
        columns={invoiceColumns}
        data={taxInvoices}
        pageSize={8}
        searchable
        searchPlaceholder="거래처 검색..."
        actions={
          <StatusBadge variant="info">
            자동발행: {taxInvoices.filter((t) => t.method === '자동').length}건
          </StatusBadge>
        }
      />

      {/* Payment Matching */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">입금 매칭 현황</h3>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge variant="success">{paymentMatches.filter((p) => p.isMatched).length}건 매칭</StatusBadge>
            <StatusBadge variant="warning">{paymentMatches.filter((p) => !p.isMatched).length}건 미매칭</StatusBadge>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {paymentMatches.map((pm) => (
            <div
              key={pm.id}
              className={`p-3 rounded-lg border ${pm.isMatched ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-amber-500/5 border-amber-500/10'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-300 font-medium">{pm.company}</span>
                {pm.isMatched ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <p className="text-sm font-bold text-gray-200">{formatCurrency(pm.expectedAmount)}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">
                {pm.isMatched ? '매칭 완료' : `마감일: ${new Date(pm.dueDate).toLocaleDateString('ko-KR')}`}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
