"use client";

import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "@/lib/api";
import PageSkeleton from "@/components/ui/PageSkeleton";
import {
  MessageSquare,
  Plus,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";

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

interface CSSummary {
  total: number;
  접수: number;
  처리중: number;
  완료: number;
}

const CS_TYPE_LABELS: Record<string, string> = {
  as: "A/S",
  return: "반품",
  exchange: "교환",
  shipping: "배송",
  refund: "환불",
  cancel: "취소",
  etc: "기타",
};
const CS_TYPES = Object.keys(CS_TYPE_LABELS);

export default function CSManagementPage() {
  const [records, setRecords] = useState<CSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [summary, setSummary] = useState<CSSummary>({
    total: 0,
    접수: 0,
    처리중: 0,
    완료: 0,
  });
  const [showModal, setShowModal] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("csStatus", filter);
      const res = await fetch(`${API_BASE}/api/cs?${params}`);
      if (!res.ok) throw new Error("서버 오류");
      const data = await res.json();
      setRecords(data.items || []);
      setSummary(
        data.summary || { total: 0, 접수: 0, 처리중: 0, 완료: 0 }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "CS 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (form: {
    csType: string;
    content: string;
    priority: string;
    assignee: string;
    orderId: string;
  }) => {
    const res = await fetch(`${API_BASE}/api/cs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csType: form.csType,
        content: form.content,
        priority: form.priority,
        assignee: form.assignee || null,
        orderId: form.orderId || null,
      }),
    });
    if (!res.ok) throw new Error("등록 실패");
    fetchData();
  };

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const statusTabs = [
    { key: "all", label: `전체 (${summary.total})` },
    { key: "접수", label: `접수 (${summary.접수})` },
    { key: "처리중", label: `처리중 (${summary.처리중})` },
    { key: "완료", label: `완료 (${summary.완료})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare size={20} className="text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CS 관리</h1>
            <span className="text-sm text-gray-500">
              {summary.total}건 | 접수 {summary.접수}건
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} /> 새로고침
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            <Plus size={14} /> CS 등록
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "전체", value: summary.total, color: "text-gray-900", bg: "bg-white" },
          { label: "접수", value: summary.접수, color: "text-yellow-600", bg: "bg-yellow-50" },
          { label: "처리중", value: summary.처리중, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "완료", value: summary.완료, color: "text-green-600", bg: "bg-green-50" },
        ].map((card) => (
          <div
            key={card.label}
            className={`${card.bg} rounded-xl p-4 border border-gray-200`}
          >
            <div className="text-sm text-gray-500">{card.label}</div>
            <div className={`text-2xl font-bold mt-1 ${card.color}`}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === tab.key
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {records.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <MessageSquare
            size={48}
            className="mx-auto text-gray-300 mb-4"
          />
          <p className="text-gray-500 mb-4">CS 데이터가 없습니다</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            CS 등록
          </button>
        </div>
      ) : (
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
                  <tr
                    key={r.id}
                    className={
                      r.priority === "urgent" ? "bg-red-50/50" : ""
                    }
                  >
                    <td>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {CS_TYPE_LABELS[r.csType] || r.csType}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          r.csStatus === "접수"
                            ? "bg-yellow-100 text-yellow-800"
                            : r.csStatus === "처리중"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                        }`}
                      >
                        {r.csStatus}
                      </span>
                    </td>
                    <td>
                      {r.priority === "urgent" ? (
                        <AlertTriangle size={14} className="text-red-500" />
                      ) : (
                        <Clock size={14} className="text-gray-400" />
                      )}
                    </td>
                    <td className="max-w-[300px] truncate text-gray-700">
                      {r.content}
                    </td>
                    <td className="text-sm text-gray-500">
                      {r.assignee || "-"}
                    </td>
                    <td className="text-sm text-gray-400 tabular-nums">
                      {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td>
                      {r.csStatus === "완료" ? (
                        <CheckCircle
                          size={14}
                          className="text-green-500"
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <CreateCSModal
          onClose={() => setShowModal(false)}
          onCreated={async (form) => {
            await handleCreate(form);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function CreateCSModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (form: {
    csType: string;
    content: string;
    priority: string;
    assignee: string;
    orderId: string;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    csType: "as",
    content: "",
    priority: "normal",
    assignee: "",
    orderId: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.content.trim()) {
      alert("내용을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      await onCreated(form);
    } catch (e) {
      alert(e instanceof Error ? e.message : "오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">CS 등록</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                CS 유형
              </label>
              <select
                value={form.csType}
                onChange={(e) =>
                  setForm({ ...form, csType: e.target.value })
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {CS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CS_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                우선순위
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value })
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="normal">일반</option>
                <option value="urgent">긴급</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">
              주문번호 (선택)
            </label>
            <input
              type="text"
              value={form.orderId}
              onChange={(e) =>
                setForm({ ...form, orderId: e.target.value })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="주문번호"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">내용</label>
            <textarea
              value={form.content}
              onChange={(e) =>
                setForm({ ...form, content: e.target.value })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-24 resize-none"
              placeholder="CS 내용을 입력하세요"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">
              담당자
            </label>
            <input
              type="text"
              value={form.assignee}
              onChange={(e) =>
                setForm({ ...form, assignee: e.target.value })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="담당자"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
