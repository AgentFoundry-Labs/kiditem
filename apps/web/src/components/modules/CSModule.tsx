'use client';

import { useState } from 'react';
import { MessageSquare, Bot, User, Clock, CheckCircle2, Send, AlertCircle, Phone } from 'lucide-react';
import DataTable, { Column } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import MetricCard from '@/components/ui/MetricCard';
import { cn, timeAgo } from '@/lib/utils';

const csInquiries = Array.from({ length: 20 }, (_, i) => {
  const platforms = ['스마트스토어', '쿠팡', '지마켓', '11번가', '자사몰'];
  const types = ['배송문의', '교환/반품', '상품문의', '품절문의', '기타'];
  const statuses: Array<'pending' | 'auto_replied' | 'manual_replied' | 'resolved'> = 
    ['pending', 'auto_replied', 'auto_replied', 'manual_replied', 'resolved', 'resolved'];
  const contents = [
    '언제 배송되나요?', '상품 교환하고 싶어요', '이 상품 재입고 되나요?',
    '배송이 너무 늦어요', '사이즈가 어떻게 되나요?', '다른 색상은 없나요?',
    '반품하고 싶습니다', '파손되어 왔어요', '주문 취소 가능한가요?',
  ];

  const status = statuses[Math.floor(Math.random() * statuses.length)];
  return {
    id: `CS-${1000 + i}`,
    platform: platforms[Math.floor(Math.random() * platforms.length)],
    type: types[Math.floor(Math.random() * types.length)],
    customer: `고객${Math.floor(Math.random() * 100)}`,
    content: contents[Math.floor(Math.random() * contents.length)],
    status,
    handler: status === 'auto_replied' ? 'AI' : status === 'manual_replied' ? '이나연' : status === 'resolved' ? '이나연' : '-',
    aiConfidence: status === 'auto_replied' ? Math.floor(Math.random() * 20) + 80 : undefined,
    createdAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 2)).toISOString(),
    responseTime: status !== 'pending' ? Math.floor(Math.random() * 30) + 1 : undefined,
  };
});

const outOfStockNotices = [
  { product: '변색토끼주물럭', sent: 5, pending: 2, platform: '전체', date: '2026-03-18' },
  { product: '논노베이커리말랑이', sent: 3, pending: 0, platform: '전체', date: '2026-03-18' },
  { product: '배틀글라이더2탄', sent: 2, pending: 1, platform: '스마트스토어', date: '2026-03-17' },
  { product: '입체오리청소세트', sent: 4, pending: 0, platform: '전체', date: '2026-03-17' },
];

export default function CSModule() {
  const pending = csInquiries.filter((c) => c.status === 'pending').length;
  const autoReplied = csInquiries.filter((c) => c.status === 'auto_replied').length;
  const avgResponseTime = Math.round(
    csInquiries.filter((c) => c.responseTime).reduce((s, c) => s + (c.responseTime || 0), 0) /
    csInquiries.filter((c) => c.responseTime).length
  );

  const columns: Column<typeof csInquiries[0]>[] = [
    {
      key: 'id',
      header: 'ID',
      render: (item) => <span className="font-mono text-[11px] text-gray-500">{item.id}</span>,
    },
    {
      key: 'platform',
      header: '플랫폼',
      render: (item) => <span className="text-xs">{item.platform}</span>,
    },
    {
      key: 'type',
      header: '유형',
      render: (item) => {
        const v = item.type === '교환/반품' ? 'warning' as const : item.type === '품절문의' ? 'error' as const : 'default' as const;
        return <StatusBadge variant={v}>{item.type}</StatusBadge>;
      },
    },
    {
      key: 'content',
      header: '내용',
      render: (item) => <span className="text-gray-700 truncate max-w-[200px] block">{item.content}</span>,
    },
    {
      key: 'status',
      header: '상태',
      align: 'center',
      render: (item) => {
        if (item.status === 'pending') return <StatusBadge variant="warning" dot>대기중</StatusBadge>;
        if (item.status === 'auto_replied') return <StatusBadge variant="info" dot>AI답변</StatusBadge>;
        if (item.status === 'manual_replied') return <StatusBadge variant="processing" dot>수동답변</StatusBadge>;
        return <StatusBadge variant="success" dot>완료</StatusBadge>;
      },
    },
    {
      key: 'handler',
      header: '처리자',
      align: 'center',
      render: (item) => (
        <div className="flex items-center gap-1 justify-center">
          {item.handler === 'AI' ? (
            <Bot className="w-3 h-3 text-blue-600" />
          ) : item.handler !== '-' ? (
            <User className="w-3 h-3 text-gray-500" />
          ) : null}
          <span className={cn('text-[11px]', item.handler === 'AI' ? 'text-blue-600' : 'text-gray-500')}>
            {item.handler}
          </span>
        </div>
      ),
    },
    {
      key: 'aiConfidence',
      header: 'AI신뢰도',
      align: 'center',
      render: (item) =>
        item.aiConfidence ? (
          <span className={cn('text-[11px] font-medium', item.aiConfidence >= 90 ? 'text-green-600' : 'text-amber-400')}>
            {item.aiConfidence}%
          </span>
        ) : <span className="text-gray-700">-</span>,
    },
    {
      key: 'responseTime',
      header: '응답시간',
      align: 'right',
      render: (item) =>
        item.responseTime ? (
          <span className="text-[11px] text-gray-500">{item.responseTime}분</span>
        ) : <span className="text-amber-400 text-[11px]">대기중</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="대기중 문의" value={pending} color={pending > 0 ? 'text-amber-400' : 'text-gray-500'} icon={<Clock className="w-4 h-4" />} />
        <MetricCard label="AI 자동답변" value={autoReplied} subValue={`${Math.round(autoReplied / csInquiries.length * 100)}% 자동처리율`} color="text-blue-600" icon={<Bot className="w-4 h-4" />} />
        <MetricCard label="평균 응답시간" value={`${avgResponseTime}분`} subValue="목표: 30분 이내" color="text-green-600" icon={<MessageSquare className="w-4 h-4" />} />
        <MetricCard label="오늘 총 처리" value={csInquiries.filter((c) => c.status !== 'pending').length} color="text-violet-400" icon={<CheckCircle2 className="w-4 h-4" />} />
      </div>

      {/* AI Auto-reply Preview */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">AI 자동답변 미리보기</h3>
        </div>
        <div className="space-y-3">
          {csInquiries.filter((c) => c.status === 'auto_replied').slice(0, 3).map((inquiry) => (
            <div key={inquiry.id} className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500">{inquiry.platform}</span>
                  <span className="text-[10px] text-gray-700">|</span>
                  <span className="text-[10px] text-gray-500">{inquiry.customer}</span>
                </div>
                <StatusBadge variant="info">AI {inquiry.aiConfidence}%</StatusBadge>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 p-2 rounded bg-gray-50 border border-gray-200">
                  <p className="text-[10px] text-gray-600 mb-1">고객 문의</p>
                  <p className="text-xs text-gray-500">{inquiry.content}</p>
                </div>
                <div className="flex-1 p-2 rounded bg-blue-500/5 border border-blue-500/10">
                  <p className="text-[10px] text-blue-600 mb-1">AI 답변</p>
                  <p className="text-xs text-gray-500">
                    안녕하세요, 키드아이템입니다. {inquiry.type === '배송문의' 
                      ? '주문해주신 상품은 현재 출고 준비중이며, 1-2일 내 배송될 예정입니다.'
                      : '확인 후 빠르게 처리해드리겠습니다. 감사합니다.'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Out of Stock Notices */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-semibold text-gray-900">품절 안내 발송 현황</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {outOfStockNotices.map((notice, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/10">
              <div>
                <p className="text-xs text-gray-700 font-medium">{notice.product}</p>
                <p className="text-[10px] text-gray-600">{notice.platform} | {notice.date}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-green-600">{notice.sent}건 발송</p>
                  {notice.pending > 0 && (
                    <p className="text-[10px] text-amber-400">{notice.pending}건 대기</p>
                  )}
                </div>
                {notice.pending > 0 && (
                  <button className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                    <Send className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CS Table */}
      <DataTable
        title="CS 문의 목록"
        columns={columns}
        data={csInquiries}
        pageSize={10}
        searchable
        searchPlaceholder="플랫폼, 유형, 내용 검색..."
      />
    </div>
  );
}
