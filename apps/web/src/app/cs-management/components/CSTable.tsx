'use client';

import { MessageSquare, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { CS_TYPE_LABELS } from './CreateCSModal';

interface CSRecord {
  id: string;
  orderId: string | null;
  productId: string | null;
  csType: string;
  csStatus: string;
  priority: string;
  assignee: string | null;
  content: string;
  resolution: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface Props {
  records: CSRecord[];
  onRegisterClick: () => void;
}

export function CSTable({ records, onRegisterClick }: Props) {
  if (records.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <MessageSquare size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500 mb-4">CS 데이터가 없습니다</p>
        <button
          onClick={onRegisterClick}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          CS 등록
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr className="bg-gray-50">
              <th>CS유형</th>
              <th>상태</th>
              <th>우선순위</th>
              <th>내용</th>
              <th>담당자</th>
              <th>등록일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className={r.priority === 'urgent' ? 'bg-red-50/50' : ''}>
                <td>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    {CS_TYPE_LABELS[r.csType] || r.csType}
                  </span>
                </td>
                <td>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      r.csStatus === '접수'
                        ? 'bg-yellow-100 text-yellow-800'
                        : r.csStatus === '처리중'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {r.csStatus}
                  </span>
                </td>
                <td>
                  {r.priority === 'urgent' ? (
                    <AlertTriangle size={14} className="text-red-500" />
                  ) : (
                    <Clock size={14} className="text-gray-400" />
                  )}
                </td>
                <td className="max-w-[300px] truncate text-gray-700">{r.content}</td>
                <td className="text-sm text-gray-500">{r.assignee || '-'}</td>
                <td className="text-sm text-gray-400 tabular-nums">
                  {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                </td>
                <td>
                  {r.csStatus === '완료' ? (
                    <CheckCircle size={14} className="text-green-500" />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
